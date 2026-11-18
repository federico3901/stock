import type { FieldKey } from "./fields";

export type FiscalPeriod = "FY" | "Q1" | "Q2" | "Q3" | "Q4" | "H1" | "9M";

export const FISCAL_PERIODS: FiscalPeriod[] = ["FY", "Q1", "Q2", "Q3", "Q4", "H1", "9M"];

export type DocType =
  | "10-K"
  | "10-Q"
  | "8-K"
  | "earnings_release"
  | "presentation"
  | "transcript"
  | "annual_report"
  | "other";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  "10-K": "10-K (annuale)",
  "10-Q": "10-Q (trimestrale)",
  "8-K": "8-K",
  earnings_release: "Comunicato risultati",
  presentation: "Presentazione investitori",
  transcript: "Trascrizione earnings call",
  annual_report: "Bilancio annuale (non SEC)",
  other: "Altro",
};

export interface Company {
  id: string;
  ticker: string;
  name: string;
  currency: string;
  sector?: string;
  description?: string;
  /** mese di chiusura dell'esercizio (1-12) */
  fiscalYearEndMonth?: number;
  price?: number;
  priceDate?: string;
  cik?: string;
  demo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PassName = "financials" | "guidance" | "insights";
export type PassStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface PassState {
  status: PassStatus;
  error?: string;
  finishedAt?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface DocumentMeta {
  id: string;
  companyId: string;
  title: string;
  type: DocType;
  fileName?: string;
  /** data di pubblicazione o di riferimento del documento (YYYY-MM-DD) */
  date?: string;
  fiscalYear?: number;
  fiscalPeriod?: FiscalPeriod;
  pageCount: number;
  charCount: number;
  passes: Partial<Record<PassName, PassState>>;
  uploadedAt: string;
}

export interface DocText {
  id: string; // = documento
  companyId: string;
  pages: string[];
}

export interface SourceRef {
  docId: string;
  page?: number;
}

/** Un periodo di bilancio per un'azienda. Chiave logica: companyId + fiscalYear + fiscalPeriod. */
export interface FinancialPeriod {
  id: string;
  companyId: string;
  fiscalYear: number;
  fiscalPeriod: FiscalPeriod;
  /** data di chiusura del periodo (YYYY-MM-DD) */
  periodEnd: string;
  values: Partial<Record<FieldKey, number>>;
  sources: Partial<Record<FieldKey, SourceRef>>;
  /** campi modificati a mano: l'estrazione automatica non li sovrascrive */
  edited: Partial<Record<FieldKey, boolean>>;
  /** dato calcolato per differenza (es. Q4 = FY - 9M), non salvato */
  derived?: boolean;
  updatedAt: string;
}

export type CustomMetricCategory = "segment_revenue" | "segment_profit" | "geo_revenue" | "kpi";

export const CUSTOM_CATEGORY_LABELS: Record<CustomMetricCategory, string> = {
  segment_revenue: "Ricavi per segmento",
  segment_profit: "Utile operativo per segmento",
  geo_revenue: "Ricavi per area geografica",
  kpi: "KPI operativi",
};

export interface CustomMetric {
  id: string;
  companyId: string;
  category: CustomMetricCategory;
  name: string;
  fiscalYear: number;
  fiscalPeriod: FiscalPeriod;
  value: number;
  /** "currency" (unità intere di valuta), "percent", "count" o testo libero (es. "abbonati") */
  unit: string;
  source?: SourceRef;
}

export type GuidanceMetric =
  | "revenue"
  | "revenue_growth"
  | "gross_margin"
  | "operating_income"
  | "operating_margin"
  | "net_income"
  | "eps_diluted"
  | "ebitda"
  | "cfo"
  | "fcf"
  | "capex"
  | "tax_rate"
  | "other";

export const GUIDANCE_METRIC_LABELS: Record<GuidanceMetric, string> = {
  revenue: "Ricavi",
  revenue_growth: "Crescita ricavi",
  gross_margin: "Margine lordo",
  operating_income: "Utile operativo",
  operating_margin: "Margine operativo",
  net_income: "Utile netto",
  eps_diluted: "EPS diluito",
  ebitda: "EBITDA",
  cfo: "Cassa operativa",
  fcf: "Free cash flow",
  capex: "Capex",
  tax_rate: "Aliquota fiscale",
  other: "Altro",
};

export type GuidanceUnit = "currency" | "percent" | "per_share" | "other";

export interface GuidanceItem {
  id: string;
  companyId: string;
  docId?: string;
  /** data in cui la guidance è stata comunicata (YYYY-MM-DD) */
  issuedDate: string;
  metric: GuidanceMetric;
  /** etichetta originale usata dal management (es. "Non-GAAP operating margin") */
  label: string;
  targetFiscalYear: number;
  targetPeriod: FiscalPeriod;
  low?: number;
  high?: number;
  unit: GuidanceUnit;
  nonGaap: boolean;
  /** guidance solo qualitativa (nessun numero) */
  qualitative: boolean;
  text?: string;
  quote?: string;
  page?: number;
  createdAt: string;
}

export interface InsightRisk {
  title: string;
  detail: string;
  severity: "alta" | "media" | "bassa";
  page?: number;
}

export interface InsightQuote {
  text: string;
  why: string;
  page?: number;
}

export interface DocInsights {
  id: string; // = documento
  companyId: string;
  summary: string;
  businessModel: string;
  highlights: string[];
  lowlights: string[];
  risks: InsightRisk[];
  accountingFlags: InsightRisk[];
  capitalAllocation: string;
  competitivePosition: string;
  managementTone: { label: "molto positivo" | "positivo" | "neutro" | "cauto" | "negativo"; rationale: string };
  nonGaapAdjustments: string[];
  keyQuotes: InsightQuote[];
  openQuestions: string[];
  createdAt: string;
}

export interface Note {
  id: string;
  companyId: string;
  kind: "nota" | "tesi" | "memo" | "catalizzatore" | "rischio";
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** Condizione della tesi d'investimento, verificata in automatico a ogni nuovo dato caricato. */
export interface ThesisCheck {
  id: string;
  companyId: string;
  /** chiave di una metrica calcolata (vedi METRICS) */
  metric: string;
  op: "gte" | "lte";
  /** soglia nell'unità naturale della metrica (0,15 = 15%) */
  threshold: number;
  note?: string;
  createdAt: string;
}

export interface ValuationInputs {
  /** id = companyId */
  id: string;
  companyId: string;
  scenarios: Record<"bear" | "base" | "bull", ScenarioInputs>;
  discountRate: number;
  terminalGrowth: number;
  years: number;
  updatedAt: string;
}

export interface ScenarioInputs {
  revenueGrowthStart: number;
  revenueGrowthEnd: number;
  fcfMarginStart: number;
  fcfMarginEnd: number;
  /** variazione annua del numero di azioni (negativa = buyback) */
  shareChange: number;
  /** multiplo P/FCF di uscita usato per il rendimento atteso */
  exitMultiple: number;
  probability: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatThread {
  id: string;
  companyId: string;
  title: string;
  docIds: string[];
  messages: ChatMessage[];
  updatedAt: string;
}

export interface AppSettings {
  id: "settings";
  model?: string;
  effort?: "low" | "medium" | "high";
  monthlySpendUsd?: Record<string, number>;
}
