// Costruisce src/seed/data/index.json: le aziende distribuite con l'app.
//
// Ingressi:
//   import/raw/<ticker>-<income|balance|cashflow>-<annual|quarterly>.json  tabelle di bilancio trascritte dalla fonte
//   import/companies/<id>.json                                             anagrafica, fonti, guidance, analisi qualitativa, tesi
//
// Uso: node scripts/build-seed.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(root, "import/raw");
const COMPANIES = join(root, "import/companies");
const NOW = "2026-11-18T12:00:00.000Z";

const read = (f) => JSON.parse(readFileSync(f, "utf8"));
const num = (v) => typeof v === "number" && Number.isFinite(v);

/** Legge una tabella grezza e restituisce, per ogni colonna, una funzione che cerca il valore di una riga per etichetta. */
function table(ticker, statement, frequency) {
  const f = join(RAW, `${ticker.toLowerCase()}-${statement}-${frequency}.json`);
  if (!existsSync(f)) return [];
  const t = read(f);
  const scale = /billion/i.test(t.unitsNote) ? 1e9 : /million/i.test(t.unitsNote) ? 1e6 : /thousand/i.test(t.unitsNote) ? 1e3 : 1;
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const rows = new Map(t.rows.map((r) => [norm(r.label), r.values]));
  return t.columns.map((c, i) => ({
    label: c.label,
    periodEnd: c.periodEnd,
    scale,
    /** primo valore disponibile tra le etichette indicate */
    get: (...labels) => {
      for (const l of labels) {
        const v = rows.get(norm(l))?.[i];
        if (num(v)) return v;
      }
      return undefined;
    },
  }));
}

/** "FY 2025" -> {fy, fp:"FY"}; "Q3 2026" -> Q3; "H1 2025" -> H1. TTM, H2 e simili non sono periodi di bilancio a sé. */
function parsePeriod(label) {
  const m = /^(FY|Q[1-4]|H1)\s+(\d{4})$/.exec(label.trim());
  return m ? { fp: m[1], fy: Number(m[2]) } : null;
}

const sum = (...xs) => (xs.some(num) ? xs.reduce((a, x) => a + (num(x) ? x : 0), 0) : undefined);
const neg = (x) => (num(x) ? -x : undefined);
const abs = (x) => (num(x) ? Math.abs(x) : undefined);
/** residuo = totale − componenti note; serve a far quadrare i subtotali con le voci non mappate */
const rest = (total, ...parts) => (num(total) ? total - parts.reduce((a, x) => a + (num(x) ? x : 0), 0) : undefined);

function income(c) {
  const g = c.get;
  const v = {};
  v.revenue = g("Revenue", "Total Revenue");
  v.cost_of_revenue = g("Cost of Revenue");
  v.gross_profit = g("Gross Profit");
  v.rd = g("Research & Development");
  v.sga = g("Selling, General & Admin", "Selling, General & Administrative");
  v.operating_income = g("Operating Income");
  if (num(v.gross_profit) && num(v.operating_income)) v.other_opex = rest(v.gross_profit, v.rd, v.sga, v.operating_income);
  v.interest_expense = abs(g("Interest Expense"));
  v.interest_income = g("Interest & Investment Income");
  v.pretax_income = g("Pretax Income");
  if (num(v.pretax_income) && num(v.operating_income)) v.other_nonoperating = v.pretax_income - v.operating_income + (v.interest_expense ?? 0) - (v.interest_income ?? 0);
  v.income_tax = g("Income Tax Expense");
  v.net_income = g("Net Income to Common", "Net Income");
  v.eps_basic = g("EPS (Basic)");
  v.eps_diluted = g("EPS (Diluted)");
  v.shares_basic = g("Shares Outstanding (Basic)");
  v.shares_diluted = g("Shares Outstanding (Diluted)");
  v.dividends_per_share = g("Dividend Per Share");
  return v;
}

function balance(c) {
  const g = c.get;
  const v = {};
  v.cash = g("Cash & Equivalents");
  v.short_term_investments = sum(g("Short-Term Investments"), g("Trading Asset Securities"));
  v.receivables = g("Accounts Receivable", "Receivables", "Other Receivables");
  v.inventory = g("Inventory");
  v.total_current_assets = g("Total Current Assets");
  v.ppe_net = g("Property, Plant & Equipment");
  v.goodwill = g("Goodwill");
  v.intangibles = g("Other Intangible Assets");
  v.long_term_investments = g("Long-Term Investments", "Total Investments");
  v.total_assets = g("Total Assets");
  v.payables = g("Accounts Payable");
  v.deferred_revenue = g("Current Unearned Revenue", "Unearned Premiums");
  v.short_term_debt = sum(g("Short-Term Debt"), g("Current Portion of Long-Term Debt"));
  v.total_current_liabilities = g("Total Current Liabilities");
  v.long_term_debt = g("Long-Term Debt");
  const leaseCur = g("Current Portion of Leases");
  const leaseLong = g("Long-Term Leases");
  v.lease_liabilities = sum(leaseCur, leaseLong);
  v.total_liabilities = g("Total Liabilities");
  v.retained_earnings = g("Retained Earnings");
  v.minority_interest = g("Minority Interest");
  // patrimonio di tutti gli azionisti della capogruppo, azioni privilegiate comprese: così lo stato patrimoniale quadra
  v.total_equity = rest(g("Shareholders' Equity"), v.minority_interest) ?? g("Total Common Equity");
  v.shares_outstanding = g("Total Common Shares Outstanding", "Filing Date Shares Outstanding");
  if (num(v.total_current_assets)) {
    v.other_current_assets = rest(v.total_current_assets, v.cash, v.short_term_investments, v.receivables, v.inventory);
    v.other_noncurrent_assets = rest(v.total_assets, v.total_current_assets, v.ppe_net, v.goodwill, v.intangibles, v.long_term_investments);
  }
  if (num(v.total_current_liabilities)) {
    v.other_current_liabilities = rest(v.total_current_liabilities, v.payables, v.deferred_revenue, v.short_term_debt, leaseCur);
    v.other_noncurrent_liabilities = rest(v.total_liabilities, v.total_current_liabilities, v.long_term_debt, leaseLong);
  }
  // colonna preliminare (la fonte riporta i totali ma non ancora il dettaglio): non la si usa,
  // l'app prende lo stato patrimoniale dal periodo precedente
  const preliminary = !num(v.retained_earnings) && !num(v.ppe_net) && !num(v.payables);
  if (preliminary) return {};
  return v;
}

function cashflow(c) {
  const g = c.get;
  const v = {};
  v.da = sum(g("Depreciation & Amortization"), g("Other Amortization"));
  v.sbc = g("Stock-Based Compensation");
  v.change_working_capital = g("Change in Working Capital");
  v.cfo = g("Operating Cash Flow");
  v.capex = neg(g("Capital Expenditures"));
  v.acquisitions = neg(g("Cash Acquisitions"));
  v.cfi = g("Investing Cash Flow");
  v.dividends_paid = neg(g("Common Dividends Paid"));
  v.buybacks = neg(g("Repurchases of Common Stock"));
  v.share_issuance = g("Issuance of Common Stock");
  v.debt_issued = g("Total Debt Issued");
  v.debt_repaid = neg(g("Total Debt Repaid"));
  v.cff = g("Financing Cash Flow");
  v.net_change_cash = g("Net Cash Flow");
  v.cash_taxes_paid = g("Cash Income Tax Paid");
  v.cash_interest_paid = g("Cash Interest Paid");
  return v;
}

const SHARES = new Set(["shares_basic", "shares_diluted", "shares_outstanding"]);
const PER_SHARE = new Set(["eps_basic", "eps_diluted", "dividends_per_share"]);

function buildPeriods(company, sourceDocId) {
  const periods = new Map();
  const add = (cols, map) => {
    for (const c of cols) {
      const p = parsePeriod(c.label);
      if (!p) continue;
      const id = `${company.id}_${p.fy}_${p.fp}`;
      if (!periods.has(id)) periods.set(id, { id, companyId: company.id, fiscalYear: p.fy, fiscalPeriod: p.fp, periodEnd: c.periodEnd ?? "", values: {}, sources: {}, edited: {}, updatedAt: NOW });
      const rec = periods.get(id);
      if (!rec.periodEnd && c.periodEnd) rec.periodEnd = c.periodEnd;
      for (const [k, raw] of Object.entries(map(c))) {
        if (!num(raw)) continue;
        const val = PER_SHARE.has(k) ? raw : raw * c.scale;
        // i residui nulli non sono un dato: non li si scrive
        if (val === 0 && k.startsWith("other_")) continue;
        rec.values[k] = SHARES.has(k) || !PER_SHARE.has(k) ? Math.round(val) : val;
        rec.sources[k] = { docId: sourceDocId };
      }
    }
  };
  for (const freq of ["annual", "quarterly"]) {
    add(table(company.ticker, "income", freq), income);
    add(table(company.ticker, "balance", freq), balance);
    add(table(company.ticker, "cashflow", freq), cashflow);
  }
  const STOCK = new Set(Object.keys(balance({ get: () => 1 })));
  const isQ = (p) => /^Q[1-4]$/.test(p.fiscalPeriod);
  // Società che pubblicano prospetti completi solo a semestre: i singoli trimestri della fonte non sono affidabili
  // (voci cumulate mescolate a differenze), ma la somma dei primi due sì. Si tiene quindi solo il primo semestre.
  if (company.interim === "halves") {
    for (const fy of new Set([...periods.values()].map((p) => p.fiscalYear))) {
      const q1 = periods.get(`${company.id}_${fy}_Q1`);
      const q2 = periods.get(`${company.id}_${fy}_Q2`);
      for (const q of ["Q1", "Q2", "Q3", "Q4"]) periods.delete(`${company.id}_${fy}_${q}`);
      if (!q1 || !q2 || !num(q1.values.revenue) || !num(q2.values.revenue)) continue;
      const id = `${company.id}_${fy}_H1`;
      const rec = { id, companyId: company.id, fiscalYear: fy, fiscalPeriod: "H1", periodEnd: q2.periodEnd || `${fy}-06-30`, values: {}, sources: {}, edited: {}, updatedAt: NOW };
      for (const k of Object.keys(q2.values)) {
        if (STOCK.has(k) || SHARES.has(k)) rec.values[k] = q2.values[k];
        else if (num(q1.values[k])) rec.values[k] = PER_SHARE.has(k) ? Math.round((q1.values[k] + q2.values[k]) * 100) / 100 : q1.values[k] + q2.values[k];
        else continue;
        rec.sources[k] = { docId: sourceDocId };
      }
      periods.set(id, rec);
    }
  }
  // Dati infrannuali della fonte giudicati inaffidabili per questa azienda: si tengono solo gli esercizi.
  if (company.interim === "none") for (const p of [...periods.values()]) if (p.fiscalPeriod !== "FY") periods.delete(p.id);
  // Un solo trimestre mancante in un esercizio completo si ricava per differenza (esercizio − altri tre trimestri).
  const years = new Set([...periods.values()].map((p) => p.fiscalYear));
  for (const fy of years) {
    const full = periods.get(`${company.id}_${fy}_FY`);
    const qs = ["Q1", "Q2", "Q3", "Q4"].map((q) => periods.get(`${company.id}_${fy}_${q}`));
    const has = qs.map((q) => q && num(q.values.revenue));
    const missing = has.filter((x) => !x).length;
    if (full && missing === 1) {
      const i = has.findIndex((x) => !x);
      const fp = `Q${i + 1}`;
      const id = `${company.id}_${fy}_${fp}`;
      const rec = periods.get(id) ?? { id, companyId: company.id, fiscalYear: fy, fiscalPeriod: fp, periodEnd: "", values: {}, sources: {}, edited: {}, updatedAt: NOW };
      const others = qs.filter((_, j) => j !== i);
      const keys = Object.keys(full.values);
      for (const k of keys) {
        if (STOCK.has(k) || SHARES.has(k) || num(rec.values[k]) || !num(full.values[k])) continue;
        if (!others.every((o) => num(o.values[k]))) continue;
        const v = full.values[k] - others.reduce((a, o) => a + o.values[k], 0);
        rec.values[k] = PER_SHARE.has(k) ? Math.round(v * 100) / 100 : v;
        rec.sources[k] = { docId: sourceDocId };
      }
      if (!rec.periodEnd) rec.periodEnd = i === 3 ? full.periodEnd : `${fy}-${["03-31", "06-30", "09-30"][i]}`;
      periods.set(id, rec);
    } else if (has.filter(Boolean).length === 1 && fy === Math.min(...years)) {
      // un trimestre isolato all'inizio della serie non serve a nulla
      for (const q of qs) if (q) periods.delete(q.id);
    }
  }
  // un periodo senza ricavi né utile non serve all'analisi
  return [...periods.values()].filter((p) => num(p.values.revenue) || num(p.values.net_income));
}

const records = [];
const push = (collection, data, companyId) => records.push({ collection, id: data.id, companyId, data });
const summary = [];

for (const file of readdirSync(COMPANIES).filter((f) => f.endsWith(".json")).sort()) {
  const src = read(join(COMPANIES, file));
  const company = { createdAt: NOW, updatedAt: NOW, ...src.company };
  const id = company.id;
  // la ricerca (guidance, segmenti, analisi) sta in un file a parte, scritto azienda per azienda
  const researchFile = join(root, "import/research", file);
  if (existsSync(researchFile)) {
    const r = read(researchFile);
    const known = new Set((r.documents ?? []).map((d) => d.id));
    src.documents = [...(src.documents ?? []), ...(r.documents ?? [])];
    // una voce senza fonte verificabile non entra nell'app
    src.guidance = [...(src.guidance ?? []), ...(r.guidance ?? []).filter((g) => known.has(g.docId))];
    src.custom = [...(src.custom ?? []), ...(r.custom ?? []).filter((c) => known.has(c.source?.docId) && num(c.value))];
    if (r.insights && known.has(r.insights.id)) src.insights = [...(src.insights ?? []), r.insights];
    // il prezzo trovato nella ricerca vale solo se è più recente di quello già noto
    if (r.price && num(r.price.value) && r.price.value > 0 && String(r.price.date ?? "") > String(company.priceDate ?? "")) {
      company.price = r.price.value;
      company.priceDate = r.price.date;
    }
  }
  const sourceDocId = `${id}-dati`;
  push("companies", company, null);

  const docs = [
    {
      id: sourceDocId, title: "Bilanci standardizzati (stockanalysis.com, dati S&P Global)", type: "other",
      url: src.financialsUrl, date: company.dataAsOf,
    },
    ...(src.documents ?? []),
  ];
  for (const d of docs) push("documents", { companyId: id, pageCount: 0, charCount: 0, passes: {}, uploadedAt: NOW, ...d }, id);

  const periods = buildPeriods(company, sourceDocId);
  for (const p of periods) push("periods", p, id);
  for (const [i, g] of (src.guidance ?? []).entries()) push("guidance", { id: `${id}-g${i + 1}`, companyId: id, nonGaap: false, qualitative: false, createdAt: NOW, ...g }, id);
  for (const [i, c] of (src.custom ?? []).entries()) push("custom_metrics", { id: `${id}-m${i + 1}`, companyId: id, ...c }, id);
  for (const ins of src.insights ?? []) push("insights", { companyId: id, createdAt: NOW, ...ins }, id);
  for (const [i, n] of (src.notes ?? []).entries()) push("notes", { id: `${id}-n${i + 1}`, companyId: id, createdAt: NOW, updatedAt: NOW, ...n }, id);
  for (const [i, c] of (src.checks ?? []).entries()) push("thesis_checks", { id: `${id}-c${i + 1}`, companyId: id, createdAt: NOW, ...c }, id);

  const fy = periods.filter((p) => p.fiscalPeriod === "FY").map((p) => p.fiscalYear).sort();
  const q = periods.filter((p) => p.fiscalPeriod !== "FY").length;
  summary.push(`${company.ticker.padEnd(6)} esercizi ${fy[0] ?? "-"}-${fy[fy.length - 1] ?? "-"} (${fy.length}), periodi infrannuali ${q}, guidance ${(src.guidance ?? []).length}, analisi ${(src.insights ?? []).length}`);
}

writeFileSync(join(root, "src/seed/data/index.json"), JSON.stringify(records));
console.log(summary.join("\n"));
console.log(`${records.length} record scritti in src/seed/data/index.json`);
