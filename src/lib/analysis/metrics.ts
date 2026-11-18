import type { Values } from "./periods";

export type MetricFormat = "pct" | "x" | "days" | "money" | "per_share" | "num";
export type MetricGroup = "Crescita" | "Redditività" | "Rendimento del capitale" | "Cassa" | "Solidità finanziaria" | "Efficienza" | "Azionisti" | "Per azione";

export interface MetricDef {
  key: string;
  label: string;
  group: MetricGroup;
  format: MetricFormat;
  /** true = più alto è meglio, false = più basso è meglio, undefined = dipende */
  higherIsBetter?: boolean;
  description: string;
}

export const METRICS = [
  { key: "revenue_growth", label: "Crescita ricavi", group: "Crescita", format: "pct", higherIsBetter: true, description: "Variazione dei ricavi rispetto allo stesso periodo dell'anno precedente." },
  { key: "gross_profit_growth", label: "Crescita utile lordo", group: "Crescita", format: "pct", higherIsBetter: true, description: "Variazione dell'utile lordo anno su anno." },
  { key: "operating_income_growth", label: "Crescita EBIT", group: "Crescita", format: "pct", higherIsBetter: true, description: "Variazione dell'utile operativo anno su anno." },
  { key: "net_income_growth", label: "Crescita utile netto", group: "Crescita", format: "pct", higherIsBetter: true, description: "Variazione dell'utile netto anno su anno." },
  { key: "eps_growth", label: "Crescita EPS diluito", group: "Crescita", format: "pct", higherIsBetter: true, description: "Variazione dell'utile per azione diluito anno su anno." },
  { key: "fcf_growth", label: "Crescita FCF", group: "Crescita", format: "pct", higherIsBetter: true, description: "Variazione del free cash flow anno su anno." },
  { key: "incremental_operating_margin", label: "Margine operativo incrementale", group: "Crescita", format: "pct", higherIsBetter: true, description: "ΔEBIT / ΔRicavi: quanto di ogni euro di ricavi aggiuntivi arriva all'utile operativo. Sopra il margine operativo = leva operativa positiva." },

  { key: "gross_margin", label: "Margine lordo", group: "Redditività", format: "pct", higherIsBetter: true, description: "Utile lordo / Ricavi." },
  { key: "operating_margin", label: "Margine operativo", group: "Redditività", format: "pct", higherIsBetter: true, description: "EBIT / Ricavi." },
  { key: "ebitda_margin", label: "Margine EBITDA", group: "Redditività", format: "pct", higherIsBetter: true, description: "(EBIT + ammortamenti) / Ricavi." },
  { key: "net_margin", label: "Margine netto", group: "Redditività", format: "pct", higherIsBetter: true, description: "Utile netto / Ricavi." },
  { key: "rd_pct", label: "R&S / Ricavi", group: "Redditività", format: "pct", description: "Intensità della spesa in ricerca e sviluppo." },
  { key: "sga_pct", label: "SG&A / Ricavi", group: "Redditività", format: "pct", higherIsBetter: false, description: "Peso delle spese commerciali e generali sui ricavi." },
  { key: "tax_rate", label: "Aliquota fiscale effettiva", group: "Redditività", format: "pct", description: "Imposte / Utile ante imposte." },

  { key: "roic", label: "ROIC", group: "Rendimento del capitale", format: "pct", higherIsBetter: true, description: "NOPAT / capitale investito medio (patrimonio netto + debito − cassa). Misura quanto rende ogni euro investito nel business." },
  { key: "roe", label: "ROE", group: "Rendimento del capitale", format: "pct", higherIsBetter: true, description: "Utile netto / patrimonio netto medio." },
  { key: "roa", label: "ROA", group: "Rendimento del capitale", format: "pct", higherIsBetter: true, description: "Utile netto / totale attivo medio." },
  { key: "asset_turnover", label: "Rotazione dell'attivo", group: "Rendimento del capitale", format: "x", higherIsBetter: true, description: "Ricavi / totale attivo medio." },
  { key: "equity_multiplier", label: "Leva (attivo / patrimonio)", group: "Rendimento del capitale", format: "x", description: "Totale attivo medio / patrimonio netto medio. Con margine netto e rotazione compone il ROE (analisi DuPont)." },

  { key: "fcf_margin", label: "Margine FCF", group: "Cassa", format: "pct", higherIsBetter: true, description: "(Cassa operativa − capex) / Ricavi." },
  { key: "fcf_conversion", label: "Conversione FCF / utile netto", group: "Cassa", format: "pct", higherIsBetter: true, description: "Quanta parte dell'utile contabile diventa cassa. Stabilmente sotto l'80% merita un approfondimento." },
  { key: "cfo_to_net_income", label: "Cassa operativa / utile netto", group: "Cassa", format: "x", higherIsBetter: true, description: "Sotto 1 in modo persistente indica utili di bassa qualità." },
  { key: "capex_pct", label: "Capex / Ricavi", group: "Cassa", format: "pct", description: "Intensità di capitale del business." },
  { key: "capex_to_da", label: "Capex / ammortamenti", group: "Cassa", format: "x", description: "Sopra 1: l'azienda investe più di quanto ammortizza (crescita). Sotto 1 a lungo: possibile sotto-investimento." },
  { key: "sbc_pct", label: "SBC / Ricavi", group: "Cassa", format: "pct", higherIsBetter: false, description: "Compensi in azioni sui ricavi: costo reale non monetario che diluisce gli azionisti." },
  { key: "fcf_after_sbc_margin", label: "Margine FCF al netto di SBC", group: "Cassa", format: "pct", higherIsBetter: true, description: "(FCF − SBC) / Ricavi: il free cash flow trattando i compensi in azioni come un costo." },
  { key: "rule_of_40", label: "Regola del 40", group: "Cassa", format: "pct", higherIsBetter: true, description: "Crescita ricavi + margine FCF. Sopra 40% è considerato eccellente per aziende in crescita." },

  { key: "net_debt_to_ebitda", label: "Debito netto / EBITDA", group: "Solidità finanziaria", format: "x", higherIsBetter: false, description: "Anni di EBITDA necessari a ripagare il debito netto. Negativo = cassa netta." },
  { key: "interest_coverage", label: "Copertura interessi", group: "Solidità finanziaria", format: "x", higherIsBetter: true, description: "EBIT / oneri finanziari." },
  { key: "current_ratio", label: "Current ratio", group: "Solidità finanziaria", format: "x", higherIsBetter: true, description: "Attività correnti / passività correnti." },
  { key: "quick_ratio", label: "Quick ratio", group: "Solidità finanziaria", format: "x", higherIsBetter: true, description: "(Cassa + investimenti a breve + crediti) / passività correnti." },
  { key: "debt_to_equity", label: "Debito / patrimonio netto", group: "Solidità finanziaria", format: "x", higherIsBetter: false, description: "Debito finanziario totale / patrimonio netto." },
  { key: "goodwill_pct_assets", label: "Avviamento e immateriali / attivo", group: "Solidità finanziaria", format: "pct", higherIsBetter: false, description: "Quota dell'attivo costituita da avviamento e intangibili (rischio di svalutazioni)." },

  { key: "dso", label: "Giorni di incasso (DSO)", group: "Efficienza", format: "days", higherIsBetter: false, description: "Crediti commerciali / ricavi × giorni del periodo." },
  { key: "dio", label: "Giorni di magazzino (DIO)", group: "Efficienza", format: "days", higherIsBetter: false, description: "Rimanenze / costo del venduto × giorni del periodo." },
  { key: "dpo", label: "Giorni di pagamento (DPO)", group: "Efficienza", format: "days", description: "Debiti commerciali / costo del venduto × giorni del periodo." },
  { key: "ccc", label: "Ciclo di conversione di cassa", group: "Efficienza", format: "days", higherIsBetter: false, description: "DSO + DIO − DPO: giorni in cui la cassa resta immobilizzata nel circolante." },

  { key: "payout_ratio", label: "Payout (dividendi / utile)", group: "Azionisti", format: "pct", description: "Dividendi pagati / utile netto." },
  { key: "shareholder_return_pct_fcf", label: "Dividendi + buyback / FCF", group: "Azionisti", format: "pct", description: "Quanta parte del FCF torna agli azionisti. Sopra 100% a lungo non è sostenibile senza debito o cassa." },
  { key: "share_count_change", label: "Variazione n. azioni", group: "Azionisti", format: "pct", higherIsBetter: false, description: "Variazione anno su anno delle azioni diluite. Positivo = diluizione, negativo = riduzione da buyback." },
  { key: "buyback_net_of_sbc", label: "Buyback al netto di SBC", group: "Azionisti", format: "money", higherIsBetter: true, description: "Riacquisti meno compensi in azioni: quanto dei buyback riduce davvero il capitale e quanto compensa solo la diluizione." },

  { key: "fcf_per_share", label: "FCF per azione", group: "Per azione", format: "per_share", higherIsBetter: true, description: "Free cash flow / azioni diluite." },
  { key: "book_value_per_share", label: "Patrimonio netto per azione", group: "Per azione", format: "per_share", higherIsBetter: true, description: "Patrimonio netto / azioni in circolazione." },
  { key: "revenue_per_share", label: "Ricavi per azione", group: "Per azione", format: "per_share", higherIsBetter: true, description: "Ricavi / azioni diluite." },
] as const satisfies readonly MetricDef[];

export type MetricKey = (typeof METRICS)[number]["key"];
export const METRIC_MAP = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<MetricKey, MetricDef>;
export type MetricValues = Partial<Record<MetricKey, number>>;

const ok = (v: number | undefined | null): v is number => typeof v === "number" && Number.isFinite(v);

/** Divisione sicura: undefined se manca un operando o il denominatore è zero. */
export function div(a: number | undefined, b: number | undefined): number | undefined {
  if (!ok(a) || !ok(b) || b === 0) return undefined;
  return a / b;
}

/** Crescita percentuale; non definita se la base è ≤ 0 (non significativa). */
export function growth(cur: number | undefined, prev: number | undefined): number | undefined {
  if (!ok(cur) || !ok(prev) || prev <= 0) return undefined;
  return cur / prev - 1;
}

const sum = (...vs: (number | undefined)[]) => vs.reduce<number>((a, v) => a + (ok(v) ? v : 0), 0);
const avg = (a: number | undefined, b: number | undefined) => (ok(a) && ok(b) ? (a + b) / 2 : a);

/** Grandezze derivate di base, riusate da metriche, qualità e valutazione. */
export function derive(v: Values) {
  const ebitda = ok(v.operating_income) ? v.operating_income + (v.da ?? 0) : undefined;
  const fcf = ok(v.cfo) ? v.cfo - (v.capex ?? 0) : undefined;
  const hasDebt = ok(v.short_term_debt) || ok(v.long_term_debt) || ok(v.lease_liabilities);
  const totalDebt = hasDebt ? sum(v.short_term_debt, v.long_term_debt, v.lease_liabilities) : undefined;
  const cashAndInv = ok(v.cash) || ok(v.short_term_investments) ? sum(v.cash, v.short_term_investments) : undefined;
  const netDebt = ok(totalDebt) || ok(cashAndInv) ? (totalDebt ?? 0) - (cashAndInv ?? 0) : undefined;
  let taxRate = div(v.income_tax, v.pretax_income);
  if (!ok(taxRate) || taxRate < 0 || taxRate > 0.5) taxRate = 0.21;
  const nopat = ok(v.operating_income) ? v.operating_income * (1 - taxRate) : undefined;
  const investedCapital = ok(v.total_equity) ? v.total_equity + (v.minority_interest ?? 0) + (netDebt ?? 0) : undefined;
  const grossProfit = v.gross_profit ?? (ok(v.revenue) && ok(v.cost_of_revenue) ? v.revenue - v.cost_of_revenue : undefined);
  const shares = v.shares_diluted ?? v.shares_basic ?? v.shares_outstanding;
  return { ebitda, fcf, totalDebt, cashAndInv, netDebt, taxRate, nopat, investedCapital, grossProfit, shares };
}

export interface MetricContext {
  /** periodo corrente */
  cur: Values;
  /** periodo immediatamente precedente (per le medie di stato patrimoniale) */
  prev?: Values;
  /** stesso periodo dell'anno precedente (per le crescite) */
  yearAgo?: Values;
  /** mesi coperti dal periodo: 12 per FY/TTM, 3 per un trimestre */
  months?: number;
}

export function computeMetrics({ cur, prev, yearAgo, months = 12 }: MetricContext): MetricValues {
  const d = derive(cur);
  const dYa = yearAgo ? derive(yearAgo) : undefined;
  const dPrev = prev ? derive(prev) : undefined;
  const ann = 12 / months; // fattore di annualizzazione per rendimenti e rotazioni
  const days = (365 * months) / 12;
  const m: MetricValues = {};
  const set = (k: MetricKey, v: number | undefined) => {
    if (ok(v)) m[k] = v;
  };

  set("revenue_growth", growth(cur.revenue, yearAgo?.revenue));
  set("gross_profit_growth", growth(d.grossProfit, dYa?.grossProfit));
  set("operating_income_growth", growth(cur.operating_income, yearAgo?.operating_income));
  set("net_income_growth", growth(cur.net_income, yearAgo?.net_income));
  set("eps_growth", growth(cur.eps_diluted, yearAgo?.eps_diluted));
  set("fcf_growth", growth(d.fcf, dYa?.fcf));
  if (ok(cur.revenue) && ok(yearAgo?.revenue) && ok(cur.operating_income) && ok(yearAgo?.operating_income) && cur.revenue > yearAgo.revenue) {
    set("incremental_operating_margin", (cur.operating_income - yearAgo.operating_income) / (cur.revenue - yearAgo.revenue));
  }

  set("gross_margin", div(d.grossProfit, cur.revenue));
  set("operating_margin", div(cur.operating_income, cur.revenue));
  set("ebitda_margin", div(d.ebitda, cur.revenue));
  set("net_margin", div(cur.net_income, cur.revenue));
  set("rd_pct", div(cur.rd, cur.revenue));
  set("sga_pct", div(cur.sga, cur.revenue));
  const tr = div(cur.income_tax, cur.pretax_income);
  if (ok(tr) && ok(cur.pretax_income) && cur.pretax_income > 0) set("tax_rate", tr);

  const avgIc = avg(d.investedCapital, dPrev?.investedCapital);
  if (ok(avgIc) && avgIc > 0) set("roic", div(ok(d.nopat) ? d.nopat * ann : undefined, avgIc));
  const avgEq = avg(cur.total_equity, prev?.total_equity);
  if (ok(avgEq) && avgEq > 0) set("roe", div(ok(cur.net_income) ? cur.net_income * ann : undefined, avgEq));
  const avgTa = avg(cur.total_assets, prev?.total_assets);
  set("roa", div(ok(cur.net_income) ? cur.net_income * ann : undefined, avgTa));
  set("asset_turnover", div(ok(cur.revenue) ? cur.revenue * ann : undefined, avgTa));
  if (ok(avgEq) && avgEq > 0) set("equity_multiplier", div(avgTa, avgEq));

  set("fcf_margin", div(d.fcf, cur.revenue));
  if (ok(cur.net_income) && cur.net_income > 0) {
    set("fcf_conversion", div(d.fcf, cur.net_income));
    set("cfo_to_net_income", div(cur.cfo, cur.net_income));
    set("payout_ratio", div(cur.dividends_paid, cur.net_income));
  }
  set("capex_pct", div(cur.capex, cur.revenue));
  set("capex_to_da", div(cur.capex, cur.da));
  set("sbc_pct", div(cur.sbc, cur.revenue));
  if (ok(d.fcf) && ok(cur.sbc)) set("fcf_after_sbc_margin", div(d.fcf - cur.sbc, cur.revenue));
  if (ok(m.revenue_growth) && ok(m.fcf_margin)) set("rule_of_40", m.revenue_growth + m.fcf_margin);

  if (ok(d.ebitda) && d.ebitda > 0) set("net_debt_to_ebitda", div(d.netDebt, d.ebitda * ann));
  if (ok(cur.interest_expense) && cur.interest_expense > 0) set("interest_coverage", div(cur.operating_income, cur.interest_expense));
  set("current_ratio", div(cur.total_current_assets, cur.total_current_liabilities));
  if (ok(cur.total_current_liabilities) && (ok(cur.cash) || ok(cur.receivables))) {
    set("quick_ratio", div(sum(cur.cash, cur.short_term_investments, cur.receivables), cur.total_current_liabilities));
  }
  if (ok(cur.total_equity) && cur.total_equity > 0) set("debt_to_equity", div(d.totalDebt, cur.total_equity));
  if (ok(cur.goodwill) || ok(cur.intangibles)) set("goodwill_pct_assets", div(sum(cur.goodwill, cur.intangibles), cur.total_assets));

  const dso = ok(cur.receivables) ? div(cur.receivables * days, cur.revenue) : undefined;
  const dio = ok(cur.inventory) ? div(cur.inventory * days, cur.cost_of_revenue) : undefined;
  const dpo = ok(cur.payables) ? div(cur.payables * days, cur.cost_of_revenue) : undefined;
  set("dso", dso);
  set("dio", dio);
  set("dpo", dpo);
  if (ok(dso) && ok(dpo)) set("ccc", dso + (dio ?? 0) - dpo);

  if (ok(d.fcf) && d.fcf > 0 && (ok(cur.dividends_paid) || ok(cur.buybacks))) {
    set("shareholder_return_pct_fcf", div(sum(cur.dividends_paid, cur.buybacks), d.fcf));
  }
  set("share_count_change", growth(cur.shares_diluted, yearAgo?.shares_diluted));
  if (ok(cur.buybacks) && ok(cur.sbc)) set("buyback_net_of_sbc", cur.buybacks - cur.sbc);

  set("fcf_per_share", div(d.fcf, d.shares));
  set("book_value_per_share", div(cur.total_equity, cur.shares_outstanding ?? d.shares));
  set("revenue_per_share", div(cur.revenue, d.shares));
  return m;
}

/** Tasso di crescita annuo composto tra il primo e l'ultimo valore di una serie. */
export function cagr(first: number | undefined, last: number | undefined, years: number): number | undefined {
  if (!ok(first) || !ok(last) || first <= 0 || last <= 0 || years <= 0) return undefined;
  return Math.pow(last / first, 1 / years) - 1;
}

/** Metriche per una serie cronologica omogenea (tutti FY oppure tutti trimestri discreti). */
export function computeSeriesMetrics(
  series: { fiscalYear: number; fiscalPeriod: string; values: Values }[],
  opts: { months: number },
): MetricValues[] {
  return series.map((p, i) => {
    const prev = i > 0 ? series[i - 1].values : undefined;
    const ya = series.find((x) => x.fiscalYear === p.fiscalYear - 1 && x.fiscalPeriod === p.fiscalPeriod)?.values;
    return computeMetrics({ cur: p.values, prev, yearAgo: ya, months: opts.months });
  });
}
