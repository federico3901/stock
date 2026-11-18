// Azienda dimostrativa INVENTATA ("Nordwind Robotics"), generata in modo deterministico.
// Serve a provare tutte le funzioni dell'app senza caricare documenti né usare la chiave API.
// Nessun dato qui dentro si riferisce a una società reale.

import type { FieldKey } from "./fields";
import { periodId } from "./analysis/periods";
import type {
  Company,
  ThesisCheck,
  CustomMetric,
  DocInsights,
  DocText,
  DocumentMeta,
  FinancialPeriod,
  FiscalPeriod,
  GuidanceItem,
  Note,
} from "./types";

export const DEMO_ID = "demo-nordwind";

type V = Partial<Record<FieldKey, number>>;

interface YearPlan {
  fy: number;
  revenue: number; // milioni
  gm: number;
  rd: number;
  sga: number;
  dso: number;
  dio: number;
  dpo: number;
  buybacks: number;
  dividends: number;
  debtChange: number;
}

const PLAN: YearPlan[] = [
  { fy: 2021, revenue: 1480, gm: 0.44, rd: 0.13, sga: 0.19, dso: 48, dio: 70, dpo: 52, buybacks: 0, dividends: 0, debtChange: 0 },
  { fy: 2022, revenue: 1795, gm: 0.455, rd: 0.13, sga: 0.18, dso: 49, dio: 72, dpo: 52, buybacks: 40, dividends: 0, debtChange: 0 },
  { fy: 2023, revenue: 2120, gm: 0.47, rd: 0.125, sga: 0.172, dso: 50, dio: 74, dpo: 51, buybacks: 90, dividends: 30, debtChange: -100 },
  { fy: 2024, revenue: 2415, gm: 0.478, rd: 0.122, sga: 0.165, dso: 56, dio: 83, dpo: 50, buybacks: 140, dividends: 42, debtChange: 0 },
  { fy: 2025, revenue: 2700, gm: 0.482, rd: 0.12, sga: 0.16, dso: 58, dio: 85, dpo: 50, buybacks: 160, dividends: 50, debtChange: 0 },
];

const SEASON = [0.22, 0.24, 0.25, 0.29];
const M = 1e6;
const r = (n: number) => Math.round(n * 10) / 10;

interface Quarter {
  fy: number;
  q: 1 | 2 | 3 | 4;
  end: string;
  v: V; // in milioni (azioni in milioni, EPS in unità)
}

function simulate(): Quarter[] {
  const out: Quarter[] = [];
  // stato patrimoniale di apertura (fine FY2020), in milioni
  let cash = 310;
  const sti = 120;
  let rec = 165;
  let inv = 140;
  const oca = 60;
  let ppe = 380;
  const goodwill = 420;
  let intang = 180;
  const onca = 55;
  let pay = 105;
  let def = 95;
  const stDebt = 0;
  let ltDebt = 600;
  const ocl = 130;
  const oncl = 90;
  let retained = 310;
  let equity = cash + sti + rec + inv + oca + ppe + goodwill + intang + onca - (pay + def + stDebt + ltDebt + ocl + oncl);
  let shares = 142;

  for (const y of PLAN) {
    for (let qi = 0; qi < 4; qi++) {
      const revenue = r(y.revenue * SEASON[qi]);
      const cogs = r(revenue * (1 - y.gm));
      const gross = r(revenue - cogs);
      const rd = r(revenue * y.rd);
      const sga = r(revenue * y.sga);
      const otherOpex = y.fy === 2023 && qi === 1 ? 18 : 0; // ristrutturazione una tantum
      const ebit = r(gross - rd - sga - otherOpex);
      const interestExpense = r((ltDebt * 0.045) / 4);
      const interestIncome = r(((cash + sti) * 0.02) / 4);
      const pretax = r(ebit - interestExpense + interestIncome);
      const tax = r(pretax * 0.19);
      const ni = r(pretax - tax);
      const da = r(revenue * 0.042);
      const sbc = r(revenue * 0.055);
      const annualizedRev = revenue / SEASON[qi];
      const annualizedCogs = cogs / SEASON[qi];
      const newRec = r((annualizedRev * y.dso) / 365);
      const newInv = r((annualizedCogs * y.dio) / 365);
      const newPay = r((annualizedCogs * y.dpo) / 365);
      const newDef = r(annualizedRev * 0.07);
      const dWc = r(-(newRec - rec) - (newInv - inv) + (newPay - pay) + (newDef - def));
      const cfo = r(ni + da + sbc + dWc);
      const capex = r(revenue * 0.05);
      const cfi = r(-capex);
      const buybacks = r(y.buybacks / 4);
      const dividends = r(y.dividends / 4);
      const debtRepaid = qi === 0 && y.debtChange < 0 ? -y.debtChange : 0;
      const cff = r(-buybacks - dividends - debtRepaid);
      const net = r(cfo + cfi + cff);

      cash = r(cash + net);
      rec = newRec;
      inv = newInv;
      pay = newPay;
      def = newDef;
      ppe = r(ppe + capex - da * 0.75);
      intang = r(intang - da * 0.25);
      ltDebt = r(ltDebt - debtRepaid);
      retained = r(retained + ni - dividends);
      equity = r(equity + ni + sbc - dividends - buybacks);
      shares = r(shares + 0.55 - buybacks / 45);

      const tca = r(cash + sti + rec + inv + oca);
      const ta = r(tca + ppe + goodwill + intang + onca);
      const tcl = r(pay + def + stDebt + ocl);
      const tl = r(ta - equity);
      const month = [3, 6, 9, 12][qi];
      const day = [31, 30, 30, 31][qi];
      out.push({
        fy: y.fy,
        q: (qi + 1) as 1 | 2 | 3 | 4,
        end: `${y.fy}-${String(month).padStart(2, "0")}-${day}`,
        v: {
          revenue, cost_of_revenue: cogs, gross_profit: gross, rd, sga, other_opex: otherOpex, operating_income: ebit,
          interest_expense: interestExpense, interest_income: interestIncome, pretax_income: pretax, income_tax: tax, net_income: ni,
          shares_basic: r(shares - 2), shares_diluted: shares, dividends_per_share: Math.round((dividends / shares) * 100) / 100,
          cash, short_term_investments: sti, receivables: rec, inventory: inv, other_current_assets: oca, total_current_assets: tca,
          ppe_net: ppe, goodwill, intangibles: intang, other_noncurrent_assets: onca, total_assets: ta,
          payables: pay, deferred_revenue: def, short_term_debt: stDebt, other_current_liabilities: ocl, total_current_liabilities: tcl,
          long_term_debt: ltDebt, other_noncurrent_liabilities: r(tl - tcl - ltDebt), total_liabilities: tl,
          retained_earnings: retained, total_equity: equity, shares_outstanding: r(shares - 1.5),
          da, sbc, change_working_capital: dWc, cfo, capex, cfi, dividends_paid: dividends, buybacks, debt_repaid: debtRepaid, cff, net_change_cash: net,
        },
      });
    }
  }
  return out;
}

const SHARE_KEYS: FieldKey[] = ["shares_basic", "shares_diluted", "shares_outstanding"];
const STOCK_KEYS: FieldKey[] = [
  "cash", "short_term_investments", "receivables", "inventory", "other_current_assets", "total_current_assets", "ppe_net", "goodwill",
  "intangibles", "other_noncurrent_assets", "total_assets", "payables", "deferred_revenue", "short_term_debt", "other_current_liabilities",
  "total_current_liabilities", "long_term_debt", "other_noncurrent_liabilities", "total_liabilities", "retained_earnings", "total_equity",
];

/** Converte da milioni a unità intere e calcola l'EPS. */
function finalize(v: V): V {
  const out: V = {};
  for (const [k, val] of Object.entries(v) as [FieldKey, number][]) {
    if (k === "dividends_per_share") out[k] = val;
    else out[k] = Math.round(val * M);
  }
  if (v.net_income !== undefined && v.shares_diluted) {
    out.eps_diluted = Math.round((v.net_income / v.shares_diluted) * 100) / 100;
    out.eps_basic = Math.round((v.net_income / v.shares_basic!) * 100) / 100;
  }
  return out;
}

function aggregate(qs: Quarter[]): V {
  const last = qs[qs.length - 1].v;
  const out: V = {};
  for (const k of Object.keys(last) as FieldKey[]) {
    if (STOCK_KEYS.includes(k) || SHARE_KEYS.includes(k)) out[k] = last[k];
    else out[k] = r(qs.reduce((a, q) => a + (q.v[k] ?? 0), 0));
  }
  // media delle azioni nel periodo
  out.shares_diluted = r(qs.reduce((a, q) => a + q.v.shares_diluted!, 0) / qs.length);
  out.shares_basic = r(qs.reduce((a, q) => a + q.v.shares_basic!, 0) / qs.length);
  return out;
}

const NOW = "2025-08-05T09:00:00.000Z";

function mkPeriod(fy: number, fp: FiscalPeriod, end: string, v: V, docId: string): FinancialPeriod {
  const values = finalize(v);
  const sources: FinancialPeriod["sources"] = {};
  for (const k of Object.keys(values) as FieldKey[]) sources[k] = { docId };
  return { id: periodId(DEMO_ID, fy, fp), companyId: DEMO_ID, fiscalYear: fy, fiscalPeriod: fp, periodEnd: end, values, sources, edited: {}, updatedAt: NOW };
}

const DOC_10K_23 = "demo-10k-2023";
const DOC_10K_24 = "demo-10k-2024";
const DOC_10Q_25 = "demo-10q-2025q2";
const DOC_PRES_25 = "demo-pres-2025q2";

function riskSection(year: 2023 | 2024): string {
  const common = [
    "La domanda dei nostri sistemi di automazione dipende dai piani di investimento dei clienti nei settori della logistica e della manifattura, che sono ciclici e sensibili alle condizioni macroeconomiche generali, ai tassi di interesse e alla fiducia delle imprese.",
    "Operiamo in mercati altamente competitivi, nei quali concorrenti con risorse finanziarie superiori potrebbero introdurre prodotti con prestazioni migliori o prezzi inferiori, riducendo la nostra quota di mercato e i nostri margini.",
    "Dipendiamo da un numero limitato di fornitori per componenti critici come attuatori, sensori e semiconduttori; interruzioni nella catena di fornitura potrebbero ritardare le consegne e aumentare i nostri costi.",
    "I nostri risultati trimestrali possono variare in modo significativo a causa della stagionalità degli ordini, concentrati storicamente nel quarto trimestre, e dei tempi di accettazione dei progetti di grandi dimensioni.",
    "Una parte rilevante dei nostri ricavi è generata fuori dagli Stati Uniti ed è quindi esposta alle fluttuazioni dei tassi di cambio, a dazi doganali e a cambiamenti nelle normative sul commercio internazionale.",
  ];
  if (year === 2023) {
    return [
      ...common,
      "I nostri primi dieci clienti hanno rappresentato circa il 31% dei ricavi dell'esercizio; la perdita di uno di essi potrebbe avere un effetto negativo sui risultati.",
      "Il successo del nostro piano di ristrutturazione avviato nel 2023 dipende dalla capacità di realizzare i risparmi di costo previsti senza compromettere l'esecuzione commerciale.",
    ].join("\n\n");
  }
  return [
    ...common.slice(0, 2),
    "Dipendiamo da un numero limitato di fornitori per componenti critici come attuatori, sensori e semiconduttori; nel corso del 2024 abbiamo aumentato in modo significativo le scorte di sicurezza di tali componenti, il che ha assorbito capitale circolante e ci espone al rischio di obsolescenza qualora la domanda risultasse inferiore alle attese.",
    ...common.slice(3),
    "I nostri primi dieci clienti hanno rappresentato circa il 38% dei ricavi dell'esercizio, e un singolo cliente del settore e-commerce ha rappresentato il 14% dei ricavi; la perdita o la riduzione degli ordini di tale cliente avrebbe un effetto negativo rilevante sui risultati.",
    "Abbiamo esteso i termini di pagamento concessi ad alcuni grandi clienti per sostenere l'adozione della nuova piattaforma Atlas; ciò ha aumentato i nostri crediti commerciali e potrebbe esporci a un maggiore rischio di credito.",
    "La nostra offerta in abbonamento Nordwind Fleet Cloud è recente: se i clienti non rinnovassero i contratti ai tassi attesi, la crescita dei ricavi ricorrenti potrebbe risultare inferiore ai nostri obiettivi.",
    "Lo sviluppo e l'impiego di funzionalità di intelligenza artificiale nei nostri robot ci espone a nuovi rischi normativi, di responsabilità da prodotto e reputazionali.",
  ].join("\n\n");
}

function tenK(year: 2023 | 2024): string[] {
  const revenue = year === 2023 ? "2.120" : "2.415";
  return [
    `NORDWIND ROBOTICS, INC. (società dimostrativa inventata)\nRELAZIONE ANNUALE — FORM 10-K\nEsercizio chiuso al 31 dicembre ${year}\n\nINDICE\nItem 1. Business\nItem 1A. Risk Factors\nItem 7. Management's Discussion and Analysis\nItem 8. Financial Statements`,
    `Item 1. Business\n\nNordwind Robotics progetta, produce e vende robot mobili autonomi e sistemi di automazione per magazzini e stabilimenti produttivi. I nostri prodotti sono venduti a operatori logistici, rivenditori e-commerce e produttori industriali in Nord America, Europa e Asia.\n\nGeneriamo ricavi da tre fonti: la vendita di sistemi robotici (hardware), i servizi di installazione e manutenzione, e il software di gestione della flotta${year === 2024 ? ", offerto dal 2024 anche in abbonamento con il nome Nordwind Fleet Cloud" : ""}. I ricavi dell'esercizio ${year} sono stati pari a ${revenue} milioni di dollari.\n\nLa nostra strategia si basa sull'ampliamento della base installata, sull'aumento della quota di ricavi ricorrenti da software e servizi e sull'espansione internazionale.`,
    `Item 1A. Risk Factors\n\n${riskSection(year)}`,
    `Item 7. Management's Discussion and Analysis of Financial Condition and Results of Operations\n\nI ricavi dell'esercizio ${year} sono cresciuti rispetto all'esercizio precedente grazie alla forte domanda di sistemi per la logistica e alla crescita dei servizi.\n\n${
      year === 2024
        ? "Il margine lordo è migliorato al 47,8% per effetto del maggior peso del software. Il flusso di cassa operativo è stato penalizzato dall'aumento dei crediti commerciali e delle rimanenze: i giorni medi di incasso sono saliti a 56 dai 50 dell'anno precedente, in seguito all'estensione dei termini di pagamento per alcuni grandi clienti, e abbiamo costituito scorte di componenti critici.\n\nPer l'esercizio 2025 prevediamo ricavi compresi tra 2.650 e 2.750 milioni di dollari e un margine operativo compreso tra il 14,5% e il 15,5%. Prevediamo investimenti in conto capitale pari a circa 135 milioni di dollari."
        : "Il margine lordo è migliorato al 47,0%. Nel secondo trimestre abbiamo contabilizzato oneri di ristrutturazione per 18 milioni di dollari. Abbiamo rimborsato anticipatamente 100 milioni di dollari di debito a lungo termine.\n\nPer l'esercizio 2024 prevediamo ricavi compresi tra 2.350 e 2.450 milioni di dollari e un margine operativo compreso tra il 13,5% e il 14,5%."
    }`,
    `Item 8. Financial Statements\n\nIl bilancio consolidato e le relative note sono riportati nelle pagine seguenti. (Documento dimostrativo: i prospetti completi sono già caricati nella sezione Bilanci.)`,
  ];
}

export interface DemoData {
  company: Company;
  documents: DocumentMeta[];
  texts: DocText[];
  periods: FinancialPeriod[];
  custom: CustomMetric[];
  guidance: GuidanceItem[];
  insights: DocInsights[];
  notes: Note[];
  checks: ThesisCheck[];
}

export function buildDemo(): DemoData {
  const quarters = simulate();
  const periods: FinancialPeriod[] = [];
  for (const fy of [2021, 2022, 2023, 2024]) {
    const qs = quarters.filter((q) => q.fy === fy);
    periods.push(mkPeriod(fy, "FY", `${fy}-12-31`, aggregate(qs), fy <= 2023 ? DOC_10K_23 : DOC_10K_24));
  }
  for (const q of quarters) {
    const keep = (q.fy === 2024 && q.q <= 3) || (q.fy === 2025 && q.q <= 2);
    if (keep) periods.push(mkPeriod(q.fy, `Q${q.q}` as FiscalPeriod, q.end, q.v, q.fy === 2025 ? DOC_10Q_25 : DOC_10K_24));
  }

  const company: Company = {
    id: DEMO_ID,
    ticker: "NWRB",
    name: "Nordwind Robotics (demo)",
    currency: "USD",
    sector: "Automazione industriale",
    description: "Società inventata a scopo dimostrativo: robot mobili autonomi e software per la logistica.",
    fiscalYearEndMonth: 12,
    price: 48.5,
    priceDate: "2025-08-04",
    demo: true,
    createdAt: NOW,
    updatedAt: NOW,
  };

  const doc = (id: string, title: string, type: DocumentMeta["type"], date: string, fy: number, fp: FiscalPeriod, pages: string[]): [DocumentMeta, DocText] => [
    {
      id, companyId: DEMO_ID, title, type, date, fiscalYear: fy, fiscalPeriod: fp, fileName: `${id}.pdf`,
      pageCount: pages.length, charCount: pages.join("").length,
      passes: { financials: { status: "done" }, guidance: { status: "done" }, insights: { status: "done" } },
      uploadedAt: NOW,
    },
    { id, companyId: DEMO_ID, pages },
  ];
  const docs = [
    doc(DOC_10K_23, "10-K esercizio 2023", "10-K", "2024-02-20", 2023, "FY", tenK(2023)),
    doc(DOC_10K_24, "10-K esercizio 2024", "10-K", "2025-02-18", 2024, "FY", tenK(2024)),
    doc(DOC_10Q_25, "10-Q secondo trimestre 2025", "10-Q", "2025-07-29", 2025, "Q2", [
      "NORDWIND ROBOTICS, INC. (società dimostrativa inventata)\nFORM 10-Q — trimestre chiuso al 30 giugno 2025",
      "Item 2. Management's Discussion and Analysis\n\nI ricavi del secondo trimestre sono cresciuti dell'11,8% rispetto allo stesso periodo dell'anno precedente. La crescita è stata trainata dai servizi e dal software in abbonamento.\n\nAlziamo la previsione di ricavi per l'esercizio 2025 a un intervallo compreso tra 2.690 e 2.760 milioni di dollari. Confermiamo la previsione di margine operativo tra il 14,5% e il 15,5%.",
    ]),
    doc(DOC_PRES_25, "Presentazione risultati Q2 2025", "presentation", "2025-07-29", 2025, "Q2", [
      "Nordwind Robotics — Risultati del secondo trimestre 2025 (documento dimostrativo)",
      "Outlook 2025\n\nRicavi: 2.690 – 2.760 milioni di dollari (precedente: 2.650 – 2.750)\nMargine operativo: 14,5% – 15,5% (invariato)\nCapex: circa 135 milioni di dollari\nRicavi terzo trimestre: 660 – 690 milioni di dollari",
      "Priorità di allocazione del capitale\n\n1. Investimenti organici in R&S e capacità produttiva\n2. Acquisizioni mirate nel software\n3. Ritorno agli azionisti: buyback e dividendo in crescita",
    ]),
  ];

  let gi = 0;
  const g = (p: Partial<GuidanceItem> & Pick<GuidanceItem, "issuedDate" | "metric" | "label" | "targetFiscalYear" | "targetPeriod" | "unit">): GuidanceItem => ({
    id: `demo-g${++gi}`, companyId: DEMO_ID, nonGaap: false, qualitative: false, createdAt: NOW, ...p,
  });
  const guidance: GuidanceItem[] = [
    g({ docId: DOC_10K_23, issuedDate: "2024-02-20", metric: "revenue", label: "Ricavi", targetFiscalYear: 2024, targetPeriod: "FY", low: 2350 * M, high: 2450 * M, unit: "currency", page: 4, quote: "Per l'esercizio 2024 prevediamo ricavi compresi tra 2.350 e 2.450 milioni di dollari" }),
    g({ docId: DOC_10K_23, issuedDate: "2024-02-20", metric: "operating_margin", label: "Margine operativo", targetFiscalYear: 2024, targetPeriod: "FY", low: 0.135, high: 0.145, unit: "percent", page: 4, quote: "un margine operativo compreso tra il 13,5% e il 14,5%" }),
    g({ docId: DOC_10K_24, issuedDate: "2025-02-18", metric: "revenue", label: "Ricavi", targetFiscalYear: 2025, targetPeriod: "FY", low: 2650 * M, high: 2750 * M, unit: "currency", page: 4, quote: "Per l'esercizio 2025 prevediamo ricavi compresi tra 2.650 e 2.750 milioni di dollari" }),
    g({ docId: DOC_10K_24, issuedDate: "2025-02-18", metric: "operating_margin", label: "Margine operativo", targetFiscalYear: 2025, targetPeriod: "FY", low: 0.145, high: 0.155, unit: "percent", page: 4 }),
    g({ docId: DOC_10K_24, issuedDate: "2025-02-18", metric: "capex", label: "Capex", targetFiscalYear: 2025, targetPeriod: "FY", low: 135 * M, high: 135 * M, unit: "currency", page: 4 }),
    g({ docId: DOC_10K_24, issuedDate: "2025-02-18", metric: "revenue", label: "Ricavi", targetFiscalYear: 2025, targetPeriod: "Q2", low: 630 * M, high: 650 * M, unit: "currency" }),
    g({ docId: DOC_PRES_25, issuedDate: "2025-07-29", metric: "revenue", label: "Ricavi", targetFiscalYear: 2025, targetPeriod: "FY", low: 2690 * M, high: 2760 * M, unit: "currency", page: 2, quote: "Ricavi: 2.690 – 2.760 milioni di dollari (precedente: 2.650 – 2.750)" }),
    g({ docId: DOC_PRES_25, issuedDate: "2025-07-29", metric: "operating_margin", label: "Margine operativo", targetFiscalYear: 2025, targetPeriod: "FY", low: 0.145, high: 0.155, unit: "percent", page: 2 }),
    g({ docId: DOC_PRES_25, issuedDate: "2025-07-29", metric: "revenue", label: "Ricavi", targetFiscalYear: 2025, targetPeriod: "Q3", low: 660 * M, high: 690 * M, unit: "currency", page: 2 }),
    g({ docId: DOC_PRES_25, issuedDate: "2025-07-29", metric: "other", label: "Allocazione del capitale", targetFiscalYear: 2025, targetPeriod: "FY", unit: "other", qualitative: true, text: "Dividendo in crescita e prosecuzione dei buyback; acquisizioni mirate nel software.", page: 3 }),
  ];

  const custom: CustomMetric[] = [];
  let ci = 0;
  const seg = (name: string, category: CustomMetric["category"], unit: string, vals: Record<number, number>, scale = M) => {
    for (const [fy, value] of Object.entries(vals)) {
      custom.push({ id: `demo-c${++ci}`, companyId: DEMO_ID, category, name, fiscalYear: Number(fy), fiscalPeriod: "FY", value: value * scale, unit });
    }
  };
  seg("Sistemi robotici", "segment_revenue", "currency", { 2022: 1220, 2023: 1380, 2024: 1495 });
  seg("Servizi", "segment_revenue", "currency", { 2022: 395, 2023: 490, 2024: 580 });
  seg("Software", "segment_revenue", "currency", { 2022: 180, 2023: 250, 2024: 340 });
  seg("Nord America", "geo_revenue", "currency", { 2022: 1005, 2023: 1166, 2024: 1304 });
  seg("Europa", "geo_revenue", "currency", { 2022: 539, 2023: 636, 2024: 725 });
  seg("Asia e resto del mondo", "geo_revenue", "currency", { 2022: 251, 2023: 318, 2024: 386 });
  seg("Robot installati (base cumulata)", "kpi", "unità", { 2022: 41200, 2023: 52800, 2024: 64100 }, 1);
  seg("Ricavi ricorrenti (ARR software)", "kpi", "currency", { 2022: 150, 2023: 232, 2024: 345 });
  seg("Tasso di rinnovo netto", "kpi", "percent", { 2022: 1.08, 2023: 1.11, 2024: 1.12 }, 1);
  seg("Portafoglio ordini (backlog)", "kpi", "currency", { 2022: 610, 2023: 705, 2024: 742 });

  const insights: DocInsights[] = [
    {
      id: DOC_10K_24,
      companyId: DEMO_ID,
      summary:
        "Esercizio di crescita solida (+13,9% i ricavi) con margini in miglioramento grazie al maggior peso di software e servizi. Il punto debole è la cassa: crediti e magazzino sono cresciuti più dei ricavi, comprimendo la conversione degli utili in free cash flow.",
      businessModel:
        "Vende robot mobili autonomi (62% dei ricavi), servizi di installazione e manutenzione (24%) e software di gestione della flotta (14%), quest'ultimo sempre più in abbonamento. Il modello punta ad ampliare la base installata per poi monetizzarla con ricavi ricorrenti a margine più alto.",
      highlights: [
        "Ricavi software +36%, con ARR a 345 milioni e tasso di rinnovo netto al 112%",
        "Margine lordo salito al 47,8% (+80 punti base)",
        "Buyback per 140 milioni e dividendo aumentato",
      ],
      lowlights: [
        "Giorni di incasso saliti da 50 a 56 per l'estensione dei termini di pagamento ai grandi clienti",
        "Scorte di componenti in forte aumento (DIO da 74 a 83 giorni)",
        "Concentrazione clienti in aumento: i primi dieci pesano il 38% dei ricavi (31% un anno prima)",
      ],
      risks: [
        { title: "Concentrazione su un cliente e-commerce", detail: "Un singolo cliente vale il 14% dei ricavi; nel 10-K 2023 nessun cliente superava il 10%.", severity: "alta", page: 3 },
        { title: "Qualità dei crediti", detail: "Termini di pagamento più lunghi per sostenere la piattaforma Atlas: più rischio di credito e meno cassa.", severity: "media", page: 3 },
        { title: "Obsolescenza del magazzino", detail: "Scorte di sicurezza di componenti aumentate in modo significativo.", severity: "media", page: 3 },
        { title: "Rinnovi del software in abbonamento", detail: "Fleet Cloud è un'offerta recente, senza storico di rinnovi.", severity: "bassa", page: 3 },
      ],
      accountingFlags: [
        { title: "Crediti in crescita più dei ricavi", detail: "Coerente con l'estensione dei termini di pagamento dichiarata; da monitorare nei prossimi trimestri.", severity: "media", page: 4 },
      ],
      capitalAllocation:
        "Priorità dichiarate: investimenti organici, acquisizioni mirate nel software, poi ritorno agli azionisti. Nel 2024 buyback e dividendi hanno assorbito una quota del FCF superiore agli anni precedenti; i compensi in azioni restano rilevanti (5,5% dei ricavi).",
      competitivePosition:
        "Vantaggio legato alla base installata e all'integrazione hardware-software; il management riconosce la pressione di concorrenti con più risorse.",
      managementTone: { label: "positivo", rationale: "Tono fiducioso sulla domanda e sul software, ma più cauto del passato su capitale circolante e concentrazione dei clienti." },
      nonGaapAdjustments: ["Esclusione dei compensi in azioni", "Esclusione dell'ammortamento degli intangibili acquisiti"],
      keyQuotes: [
        { text: "Abbiamo esteso i termini di pagamento concessi ad alcuni grandi clienti per sostenere l'adozione della nuova piattaforma Atlas", why: "Spiega l'aumento dei crediti: la crescita è stata in parte 'comprata' con condizioni più generose.", page: 3 },
        { text: "un singolo cliente del settore e-commerce ha rappresentato il 14% dei ricavi", why: "Nuova informativa di concentrazione rispetto all'anno precedente.", page: 3 },
      ],
      openQuestions: [
        "I termini di pagamento estesi sono temporanei o diventeranno lo standard per Atlas?",
        "Quanta parte della crescita 2025 dipende dal cliente che pesa il 14%?",
        "Il margine lordo del software in abbonamento è già superiore a quello delle licenze?",
      ],
      createdAt: NOW,
    },
  ];

  const notes: Note[] = [
    {
      id: "demo-n1",
      companyId: DEMO_ID,
      kind: "tesi",
      title: "Tesi d'investimento (esempio)",
      body:
        "**Perché potrebbe funzionare**\n- La base installata cresce del 20% l'anno e alimenta ricavi ricorrenti a margine alto\n- Leva operativa: SG&A in calo in % dei ricavi\n\n**Cosa deve essere vero**\n- ARR software > 450 Mln a fine 2025\n- DSO che torna sotto i 52 giorni\n\n**Cosa mi farebbe cambiare idea**\n- Perdita o forte riduzione del cliente che pesa il 14%\n- Margine lordo in calo per due trimestri consecutivi",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];

  return {
    company,
    documents: docs.map((d) => d[0]),
    texts: docs.map((d) => d[1]),
    periods,
    custom,
    guidance,
    insights,
    notes,
    checks: [
      { id: "demo-c1", companyId: DEMO_ID, metric: "dso", op: "lte", threshold: 52, note: "I termini di pagamento estesi devono rientrare", createdAt: NOW },
      { id: "demo-c2", companyId: DEMO_ID, metric: "gross_margin", op: "gte", threshold: 0.47, note: "Il mix verso il software deve reggere", createdAt: NOW },
      { id: "demo-c3", companyId: DEMO_ID, metric: "roic", op: "gte", threshold: 0.2, createdAt: NOW },
    ],
  };
}
