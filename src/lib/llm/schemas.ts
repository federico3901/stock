import { z } from "zod";
import { FIELD_KEYS } from "../fields";

const fiscalPeriod = z.enum(["FY", "Q1", "Q2", "Q3", "Q4", "H1", "9M"]);
const scale = z.enum(["units", "thousands", "millions", "billions"]);

export const SCALE: Record<z.infer<typeof scale>, number> = { units: 1, thousands: 1e3, millions: 1e6, billions: 1e9 };

export const FinancialsSchema = z.object({
  company: z.object({
    name: z.string(),
    ticker: z.string().describe("Ticker di borsa, stringa vuota se non indicato"),
    currency: z.string().describe("Codice ISO della valuta di bilancio, es. USD, EUR"),
    fiscal_year_end_month: z.number().int().describe("Mese (1-12) di chiusura dell'esercizio"),
    sector: z.string().describe("Settore in poche parole, in italiano"),
  }),
  document: z.object({
    type: z.enum(["10-K", "10-Q", "8-K", "earnings_release", "presentation", "transcript", "annual_report", "other"]),
    fiscal_year: z.number().int().describe("Esercizio a cui si riferisce il documento"),
    fiscal_period: fiscalPeriod.describe("Periodo principale del documento: FY per un annuale, Q1..Q4 per un trimestrale"),
    publication_date: z.string().describe("Data di pubblicazione YYYY-MM-DD, stringa vuota se non indicata"),
  }),
  money_scale: scale.describe("Scala in cui sono espressi gli importi monetari nei prospetti (es. 'in millions')"),
  shares_scale: scale.describe("Scala in cui è espresso il numero di azioni nei prospetti"),
  periods: z.array(
    z.object({
      fiscal_year: z.number().int(),
      fiscal_period: fiscalPeriod,
      period_end: z.string().describe("Data di chiusura del periodo, YYYY-MM-DD"),
      values: z.array(
        z.object({
          field: z.enum(FIELD_KEYS),
          value: z.number().describe("Valore come stampato nel prospetto, nella scala del documento, con la convenzione di segno indicata"),
          page: z.number().int().describe("Pagina da cui è tratto il valore, 0 se non determinabile"),
        }),
      ),
    }),
  ),
  custom_metrics: z.array(
    z.object({
      category: z.enum(["segment_revenue", "segment_profit", "geo_revenue", "kpi"]),
      name: z.string().describe("Nome del segmento, dell'area o del KPI, come nel documento"),
      fiscal_year: z.number().int(),
      fiscal_period: fiscalPeriod,
      value: z.number().describe("Valore in unità assolute (già moltiplicato per la scala); le percentuali come frazione decimale (0,12 = 12%)"),
      unit: z.enum(["currency", "percent", "count"]),
      unit_label: z.string().describe("Per 'count': cosa si conta (es. 'abbonati', 'negozi'); altrimenti stringa vuota"),
      page: z.number().int(),
    }),
  ),
  notes: z.array(z.string()).describe("Avvertenze utili a chi legge i dati: riesposizioni, cambi di perimetro, voci classificate in modo insolito. In italiano."),
});
export type FinancialsOutput = z.infer<typeof FinancialsSchema>;

export const GuidanceSchema = z.object({
  issued_date: z.string().describe("Data in cui la guidance è stata comunicata (data del documento), YYYY-MM-DD; stringa vuota se non determinabile"),
  items: z.array(
    z.object({
      metric: z.enum(["revenue", "revenue_growth", "gross_margin", "operating_income", "operating_margin", "net_income", "eps_diluted", "ebitda", "cfo", "fcf", "capex", "tax_rate", "other"]),
      label: z.string().describe("Etichetta usata dal management, es. 'Non-GAAP operating margin'"),
      target_fiscal_year: z.number().int(),
      target_period: fiscalPeriod,
      low: z.number().nullable().describe("Estremo inferiore in unità assolute (percentuali come frazione decimale). Uguale a high per un valore puntuale. null se qualitativa."),
      high: z.number().nullable(),
      unit: z.enum(["currency", "percent", "per_share", "other"]),
      non_gaap: z.boolean(),
      qualitative: z.boolean().describe("true se l'indicazione non contiene numeri"),
      text: z.string().describe("Sintesi in italiano dell'indicazione, incluse condizioni e ipotesi dichiarate"),
      quote: z.string().describe("Citazione testuale breve dal documento, in lingua originale"),
      page: z.number().int().describe("Pagina, 0 se non determinabile"),
    }),
  ),
});
export type GuidanceOutput = z.infer<typeof GuidanceSchema>;

const risk = z.object({
  title: z.string(),
  detail: z.string(),
  severity: z.enum(["alta", "media", "bassa"]),
  page: z.number().int().describe("Pagina, 0 se non determinabile"),
});

export const InsightsSchema = z.object({
  summary: z.string().describe("3-5 frasi: cosa è successo nel periodo e cosa conta davvero per un investitore"),
  business_model: z.string().describe("Come l'azienda guadagna: prodotti, clienti, fonti di ricavo, leve di margine"),
  highlights: z.array(z.string()).describe("Fatti positivi concreti, con numeri"),
  lowlights: z.array(z.string()).describe("Fatti negativi o deterioramenti concreti, con numeri"),
  risks: z.array(risk).describe("I rischi davvero specifici e rilevanti per questa azienda, non il boilerplate generico. Massimo 8."),
  accounting_flags: z.array(risk).describe("Segnali contabili: cambi di principi o stime, riesposizioni, voci una tantum ricorrenti, differenze GAAP/non-GAAP ampie, capitalizzazione di costi, parti correlate, rilievi dei revisori, debolezze nei controlli interni"),
  capital_allocation: z.string(),
  competitive_position: z.string(),
  management_tone: z.object({
    label: z.enum(["molto positivo", "positivo", "neutro", "cauto", "negativo"]),
    rationale: z.string(),
  }),
  non_gaap_adjustments: z.array(z.string()).describe("Principali rettifiche tra risultati GAAP e non-GAAP, con importi se indicati"),
  key_quotes: z.array(
    z.object({
      text: z.string().describe("Citazione testuale in lingua originale"),
      why: z.string().describe("Perché è importante, in italiano"),
      page: z.number().int(),
    }),
  ).describe("Massimo 6 citazioni che un analista evidenzierebbe"),
  open_questions: z.array(z.string()).describe("Domande che un investitore dovrebbe approfondire dopo aver letto il documento"),
});
export type InsightsOutput = z.infer<typeof InsightsSchema>;
