import { body, notFound, route } from "@/lib/api";
import * as repo from "@/lib/repo";
import { DOC_TYPE_LABELS, FISCAL_PERIODS, type DocumentMeta } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const document = await repo.getDocument(id);
  if (!document) throw notFound("Documento");
  const text = await repo.getDocText(id);
  return { document, pages: text?.pages ?? [] };
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const doc = await repo.getDocument(id);
  if (!doc) throw notFound("Documento");
  const b = await body<Partial<DocumentMeta>>(req);
  if (typeof b.title === "string" && b.title.trim()) doc.title = b.title.trim();
  if (b.type && b.type in DOC_TYPE_LABELS) doc.type = b.type;
  if (typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) doc.date = b.date;
  if (Number.isInteger(b.fiscalYear)) doc.fiscalYear = b.fiscalYear;
  if (b.fiscalPeriod && FISCAL_PERIODS.includes(b.fiscalPeriod)) doc.fiscalPeriod = b.fiscalPeriod;
  await repo.putDocument(doc);
  return { document: doc };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  await repo.deleteDocument(id);
  return { ok: true };
});
