// Risposte finte per la modalità LLM_MOCK=1 (sviluppo e test dell'interfaccia senza chiave API).
import type { DocumentMeta } from "../types";
import type { FinancialsOutput, GuidanceOutput, InsightsOutput } from "./schemas";

export function mockFinancials(doc: DocumentMeta): FinancialsOutput {
  const fy = doc.fiscalYear ?? 2024;
  const mk = (year: number, k: number) => ({
    fiscal_year: year,
    fiscal_period: "FY" as const,
    period_end: `${year}-12-31`,
    values: [
      { field: "revenue" as const, value: 1000 * k, page: 1 },
      { field: "cost_of_revenue" as const, value: 600 * k, page: 1 },
      { field: "gross_profit" as const, value: 400 * k, page: 1 },
      { field: "operating_income" as const, value: 150 * k, page: 1 },
      { field: "pretax_income" as const, value: 140 * k, page: 1 },
      { field: "income_tax" as const, value: 30 * k, page: 1 },
      { field: "net_income" as const, value: 110 * k, page: 1 },
      { field: "eps_diluted" as const, value: 1.1 * k, page: 1 },
      { field: "shares_diluted" as const, value: 100, page: 1 },
      { field: "total_assets" as const, value: 2000 * k, page: 1 },
      { field: "total_liabilities" as const, value: 900 * k, page: 1 },
      { field: "total_equity" as const, value: 1100 * k, page: 1 },
      { field: "cash" as const, value: 300 * k, page: 1 },
      { field: "long_term_debt" as const, value: 400, page: 1 },
      { field: "cfo" as const, value: 180 * k, page: 1 },
      { field: "capex" as const, value: 50 * k, page: 1 },
    ],
  });
  return {
    company: { name: "Mock Corp", ticker: "MOCK", currency: "USD", fiscal_year_end_month: 12, sector: "Esempio" },
    document: { type: "10-K", fiscal_year: fy, fiscal_period: "FY", publication_date: `${fy + 1}-02-15` },
    money_scale: "millions",
    shares_scale: "millions",
    periods: [mk(fy, 1.1), mk(fy - 1, 1)],
    custom_metrics: [{ category: "kpi", name: "Clienti attivi", fiscal_year: fy, fiscal_period: "FY", value: 12500, unit: "count", unit_label: "clienti", page: 1 }],
    notes: ["Dati finti generati in modalità di prova (LLM_MOCK)."],
  };
}

export function mockGuidance(doc: DocumentMeta): GuidanceOutput {
  const fy = (doc.fiscalYear ?? 2024) + 1;
  return {
    issued_date: "",
    items: [
      { metric: "revenue", label: "Ricavi", target_fiscal_year: fy, target_period: "FY", low: 1.2e9, high: 1.25e9, unit: "currency", non_gaap: false, qualitative: false, text: "Guidance finta (modalità di prova).", quote: "", page: 1 },
    ],
  };
}

export function mockInsights(): InsightsOutput {
  return {
    summary: "Analisi finta generata in modalità di prova (LLM_MOCK): nessuna chiamata al modello è stata fatta.",
    business_model: "—",
    highlights: ["Esempio di punto positivo"],
    lowlights: ["Esempio di punto negativo"],
    risks: [{ title: "Rischio di esempio", detail: "Dettaglio di esempio.", severity: "media", page: 1 }],
    accounting_flags: [],
    capital_allocation: "—",
    competitive_position: "—",
    management_tone: { label: "neutro", rationale: "Modalità di prova." },
    non_gaap_adjustments: [],
    key_quotes: [],
    open_questions: ["Domanda di esempio?"],
  };
}
