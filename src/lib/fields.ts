// Schema normalizzato dei dati di bilancio.
// Convenzioni di segno: tutti i valori sono positivi "per natura" della voce.
// Costi, capex, dividendi pagati, buyback e rimborsi di debito sono memorizzati come numeri positivi.
// I valori monetari sono memorizzati in unità intere della valuta (non in milioni).

export type Statement = "income" | "balance" | "cashflow";
export type FieldKind = "money" | "shares" | "per_share";

export interface FieldDef {
  key: string;
  label: string;
  statement: Statement;
  kind: FieldKind;
  /** riga di totale/subtotale: evidenziata nelle tabelle */
  total?: boolean;
  hint?: string;
}

export const FIELDS = [
  // Conto economico
  { key: "revenue", label: "Ricavi", statement: "income", kind: "money", total: true },
  { key: "cost_of_revenue", label: "Costo del venduto", statement: "income", kind: "money" },
  { key: "gross_profit", label: "Utile lordo", statement: "income", kind: "money", total: true },
  { key: "rd", label: "Ricerca e sviluppo", statement: "income", kind: "money" },
  { key: "sga", label: "Spese SG&A", statement: "income", kind: "money", hint: "Vendite, generali e amministrative (totale)" },
  { key: "other_opex", label: "Altri costi operativi", statement: "income", kind: "money", hint: "Ristrutturazioni, svalutazioni, ammortamento intangibili, ecc." },
  { key: "operating_income", label: "Utile operativo (EBIT)", statement: "income", kind: "money", total: true },
  { key: "interest_expense", label: "Oneri finanziari", statement: "income", kind: "money" },
  { key: "interest_income", label: "Proventi finanziari", statement: "income", kind: "money" },
  { key: "other_nonoperating", label: "Altri proventi/(oneri) non operativi", statement: "income", kind: "money", hint: "Positivo = provento" },
  { key: "pretax_income", label: "Utile ante imposte", statement: "income", kind: "money", total: true },
  { key: "income_tax", label: "Imposte", statement: "income", kind: "money" },
  { key: "net_income", label: "Utile netto", statement: "income", kind: "money", total: true, hint: "Attribuibile agli azionisti ordinari" },
  { key: "eps_basic", label: "EPS base", statement: "income", kind: "per_share" },
  { key: "eps_diluted", label: "EPS diluito", statement: "income", kind: "per_share" },
  { key: "shares_basic", label: "Azioni medie (base)", statement: "income", kind: "shares" },
  { key: "shares_diluted", label: "Azioni medie (diluite)", statement: "income", kind: "shares" },
  { key: "dividends_per_share", label: "Dividendo per azione", statement: "income", kind: "per_share" },

  // Stato patrimoniale
  { key: "cash", label: "Cassa e equivalenti", statement: "balance", kind: "money" },
  { key: "short_term_investments", label: "Investimenti a breve", statement: "balance", kind: "money" },
  { key: "receivables", label: "Crediti commerciali", statement: "balance", kind: "money" },
  { key: "inventory", label: "Rimanenze", statement: "balance", kind: "money" },
  { key: "other_current_assets", label: "Altre attività correnti", statement: "balance", kind: "money" },
  { key: "total_current_assets", label: "Totale attività correnti", statement: "balance", kind: "money", total: true },
  { key: "ppe_net", label: "Immobili, impianti e macchinari (netti)", statement: "balance", kind: "money" },
  { key: "goodwill", label: "Avviamento", statement: "balance", kind: "money" },
  { key: "intangibles", label: "Attività immateriali", statement: "balance", kind: "money" },
  { key: "long_term_investments", label: "Investimenti a lungo", statement: "balance", kind: "money" },
  { key: "other_noncurrent_assets", label: "Altre attività non correnti", statement: "balance", kind: "money" },
  { key: "total_assets", label: "Totale attivo", statement: "balance", kind: "money", total: true },
  { key: "payables", label: "Debiti commerciali", statement: "balance", kind: "money" },
  { key: "deferred_revenue", label: "Ricavi differiti (correnti)", statement: "balance", kind: "money" },
  { key: "short_term_debt", label: "Debito a breve", statement: "balance", kind: "money", hint: "Inclusa la quota corrente del debito a lungo" },
  { key: "other_current_liabilities", label: "Altre passività correnti", statement: "balance", kind: "money" },
  { key: "total_current_liabilities", label: "Totale passività correnti", statement: "balance", kind: "money", total: true },
  { key: "long_term_debt", label: "Debito a lungo", statement: "balance", kind: "money" },
  { key: "lease_liabilities", label: "Passività per leasing", statement: "balance", kind: "money", hint: "Correnti + non correnti, se non incluse nel debito" },
  { key: "other_noncurrent_liabilities", label: "Altre passività non correnti", statement: "balance", kind: "money" },
  { key: "total_liabilities", label: "Totale passività", statement: "balance", kind: "money", total: true },
  { key: "retained_earnings", label: "Utili a nuovo", statement: "balance", kind: "money" },
  { key: "minority_interest", label: "Interessi di minoranza", statement: "balance", kind: "money" },
  { key: "total_equity", label: "Patrimonio netto", statement: "balance", kind: "money", total: true, hint: "Attribuibile agli azionisti della capogruppo" },
  { key: "shares_outstanding", label: "Azioni in circolazione", statement: "balance", kind: "shares" },

  // Rendiconto finanziario
  { key: "da", label: "Ammortamenti e svalutazioni", statement: "cashflow", kind: "money" },
  { key: "sbc", label: "Compensi in azioni (SBC)", statement: "cashflow", kind: "money" },
  { key: "change_working_capital", label: "Variazione capitale circolante", statement: "cashflow", kind: "money", hint: "Positivo = genera cassa" },
  { key: "cfo", label: "Flusso di cassa operativo", statement: "cashflow", kind: "money", total: true },
  { key: "capex", label: "Investimenti (capex)", statement: "cashflow", kind: "money", hint: "Positivo = uscita" },
  { key: "acquisitions", label: "Acquisizioni", statement: "cashflow", kind: "money", hint: "Positivo = uscita netta" },
  { key: "cfi", label: "Flusso di cassa da investimenti", statement: "cashflow", kind: "money", total: true, hint: "Con segno: negativo = uscita" },
  { key: "dividends_paid", label: "Dividendi pagati", statement: "cashflow", kind: "money", hint: "Positivo = uscita" },
  { key: "buybacks", label: "Riacquisto azioni proprie", statement: "cashflow", kind: "money", hint: "Positivo = uscita" },
  { key: "share_issuance", label: "Emissione di azioni", statement: "cashflow", kind: "money" },
  { key: "debt_issued", label: "Nuovo debito emesso", statement: "cashflow", kind: "money" },
  { key: "debt_repaid", label: "Debito rimborsato", statement: "cashflow", kind: "money", hint: "Positivo = uscita" },
  { key: "cff", label: "Flusso di cassa da finanziamenti", statement: "cashflow", kind: "money", total: true, hint: "Con segno: negativo = uscita" },
  { key: "net_change_cash", label: "Variazione netta di cassa", statement: "cashflow", kind: "money", total: true },
  { key: "cash_taxes_paid", label: "Imposte pagate (cassa)", statement: "cashflow", kind: "money" },
  { key: "cash_interest_paid", label: "Interessi pagati (cassa)", statement: "cashflow", kind: "money" },
] as const satisfies readonly FieldDef[];

export type FieldKey = (typeof FIELDS)[number]["key"];

export const FIELD_KEYS = FIELDS.map((f) => f.key) as [FieldKey, ...FieldKey[]];

export const FIELD_MAP: Record<FieldKey, FieldDef> = Object.fromEntries(
  FIELDS.map((f) => [f.key, f]),
) as Record<FieldKey, FieldDef>;

export const STATEMENT_LABELS: Record<Statement, string> = {
  income: "Conto economico",
  balance: "Stato patrimoniale",
  cashflow: "Rendiconto finanziario",
};

export function fieldsOf(statement: Statement): FieldDef[] {
  return FIELDS.filter((f) => f.statement === statement);
}

/** Le voci di stato patrimoniale sono "stock" (fotografia a una data); le altre sono "flussi" (su un periodo). */
export function isStock(key: FieldKey): boolean {
  return FIELD_MAP[key].statement === "balance";
}

/** Voci di flusso che NON si sommano tra trimestri (medie o valori per azione). */
export function isAdditive(key: FieldKey): boolean {
  const f = FIELD_MAP[key];
  if (f.statement === "balance") return false;
  if (f.kind === "shares") return false;
  return true; // money e per_share (EPS, DPS) si sommano con buona approssimazione
}
