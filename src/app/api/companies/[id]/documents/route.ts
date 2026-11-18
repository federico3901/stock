import { bad, body, notFound, route } from "@/lib/api";
import * as repo from "@/lib/repo";
import { FISCAL_PERIODS, DOC_TYPE_LABELS, type DocType, type DocumentMeta, type FiscalPeriod } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

interface UploadBody {
  title?: string;
  type?: DocType;
  fileName?: string;
  date?: string;
  fiscalYear?: number;
  fiscalPeriod?: FiscalPeriod;
  pages?: string[];
}

/** Riceve il testo già estratto nel browser (non il file binario). */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const company = await repo.getCompany(id);
  if (!company) throw notFound("Azienda");
  const b = await body<UploadBody>(req);
  if (!Array.isArray(b.pages) || !b.pages.length || !b.pages.every((p) => typeof p === "string")) throw bad("Nessun testo nel documento.");
  const charCount = b.pages.reduce((a, p) => a + p.length, 0);
  if (charCount < 200) throw bad("Il documento non contiene testo leggibile: se è una scansione serve prima un OCR.");
  const docId = repo.newId("doc");
  const doc: DocumentMeta = {
    id: docId,
    companyId: id,
    title: (b.title ?? "").trim() || b.fileName || "Documento",
    type: b.type && b.type in DOC_TYPE_LABELS ? b.type : "other",
    ...(b.fileName ? { fileName: b.fileName } : {}),
    ...(b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? { date: b.date } : {}),
    ...(Number.isInteger(b.fiscalYear) ? { fiscalYear: b.fiscalYear } : {}),
    ...(b.fiscalPeriod && FISCAL_PERIODS.includes(b.fiscalPeriod) ? { fiscalPeriod: b.fiscalPeriod } : {}),
    pageCount: b.pages.length,
    charCount,
    passes: {},
    uploadedAt: repo.nowIso(),
  };
  await repo.putDocText({ id: docId, companyId: id, pages: b.pages });
  await repo.putDocument(doc);
  return { document: doc };
});
