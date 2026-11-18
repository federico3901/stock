import { getStore } from "./store";
import type {
  ChatThread, Company, ThesisCheck, CustomMetric, DocInsights, DocText, DocumentMeta, FinancialPeriod, GuidanceItem, Note, ValuationInputs,
} from "./types";

export const C = {
  companies: "companies",
  documents: "documents",
  texts: "doc_texts",
  periods: "periods",
  custom: "custom_metrics",
  guidance: "guidance",
  insights: "insights",
  notes: "notes",
  valuation: "valuation",
  chats: "chats",
  checks: "thesis_checks",
} as const;

export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const nowIso = () => new Date().toISOString();

export const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export async function listCompanies(): Promise<Company[]> {
  const cs = await getStore().list<Company>(C.companies);
  return cs.sort((a, b) => a.name.localeCompare(b.name));
}
export const getCompany = (id: string) => getStore().get<Company>(C.companies, id);
export const putCompany = (c: Company) => getStore().put(C.companies, c, null);

export async function deleteCompany(id: string) {
  const s = getStore();
  await s.deleteByCompany(id);
  await s.delete(C.companies, id);
}

export async function listDocuments(companyId: string): Promise<DocumentMeta[]> {
  const ds = await getStore().list<DocumentMeta>(C.documents, companyId);
  return ds.sort((a, b) => (b.date ?? b.uploadedAt).localeCompare(a.date ?? a.uploadedAt));
}
export const getDocument = (id: string) => getStore().get<DocumentMeta>(C.documents, id);
export const putDocument = (d: DocumentMeta) => getStore().put(C.documents, d, d.companyId);
export const getDocText = (id: string) => getStore().get<DocText>(C.texts, id);
export const putDocText = (t: DocText) => getStore().put(C.texts, t, t.companyId);

export async function deleteDocument(id: string) {
  const s = getStore();
  const doc = await getDocument(id);
  if (!doc) return;
  // rimuove ciò che è stato estratto da questo documento (non i valori di bilancio già confluiti nei periodi)
  for (const g of await listGuidance(doc.companyId)) if (g.docId === id) await s.delete(C.guidance, g.id);
  for (const m of await listCustom(doc.companyId)) if (m.source?.docId === id) await s.delete(C.custom, m.id);
  await s.delete(C.insights, id);
  await s.delete(C.texts, id);
  await s.delete(C.documents, id);
}

export const listPeriods = (companyId: string) => getStore().list<FinancialPeriod>(C.periods, companyId);
export const putPeriod = (p: FinancialPeriod) => getStore().put(C.periods, p, p.companyId);
export const deletePeriod = (id: string) => getStore().delete(C.periods, id);

export const listCustom = (companyId: string) => getStore().list<CustomMetric>(C.custom, companyId);
export const putCustom = (m: CustomMetric) => getStore().put(C.custom, m, m.companyId);

export const listGuidance = (companyId: string) => getStore().list<GuidanceItem>(C.guidance, companyId);
export const putGuidance = (g: GuidanceItem) => getStore().put(C.guidance, g, g.companyId);
export const deleteGuidance = (id: string) => getStore().delete(C.guidance, id);

export const listInsights = (companyId: string) => getStore().list<DocInsights>(C.insights, companyId);
export const putInsights = (i: DocInsights) => getStore().put(C.insights, i, i.companyId);

export async function listNotes(companyId: string): Promise<Note[]> {
  const ns = await getStore().list<Note>(C.notes, companyId);
  return ns.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export const putNote = (n: Note) => getStore().put(C.notes, n, n.companyId);
export const deleteNote = (id: string) => getStore().delete(C.notes, id);

export const getValuation = (companyId: string) => getStore().get<ValuationInputs>(C.valuation, companyId);
export const putValuation = (v: ValuationInputs) => getStore().put(C.valuation, v, v.companyId);

export async function listChats(companyId: string): Promise<ChatThread[]> {
  const cs = await getStore().list<ChatThread>(C.chats, companyId);
  return cs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export const getChat = (id: string) => getStore().get<ChatThread>(C.chats, id);
export const putChat = (c: ChatThread) => getStore().put(C.chats, c, c.companyId);
export const deleteChat = (id: string) => getStore().delete(C.chats, id);

/** Tutti i dati di un'azienda in un colpo solo (la pagina azienda li usa tutti). */
export async function listChecks(companyId: string): Promise<ThesisCheck[]> {
  const cs = await getStore().list<ThesisCheck>(C.checks, companyId);
  return cs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export const putCheck = (c: ThesisCheck) => getStore().put(C.checks, c, c.companyId);
export const deleteCheck = (id: string) => getStore().delete(C.checks, id);

export async function loadCompanyBundle(companyId: string) {
  const [company, documents, periods, custom, guidance, insights, notes, valuation, checks] = await Promise.all([
    getCompany(companyId),
    listDocuments(companyId),
    listPeriods(companyId),
    listCustom(companyId),
    listGuidance(companyId),
    listInsights(companyId),
    listNotes(companyId),
    getValuation(companyId),
    listChecks(companyId),
  ]);
  if (!company) return null;
  return { company, documents, periods, custom, guidance, insights, notes, valuation, checks };
}
export type CompanyBundle = NonNullable<Awaited<ReturnType<typeof loadCompanyBundle>>>;
