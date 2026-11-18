import { bad, body, notFound, route } from "@/lib/api";
import * as repo from "@/lib/repo";
import { FISCAL_PERIODS, GUIDANCE_METRIC_LABELS, type GuidanceItem } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Crea o aggiorna una voce di guidance (inserimento manuale o correzione). */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  if (!(await repo.getCompany(id))) throw notFound("Azienda");
  const b = await body<Partial<GuidanceItem>>(req);
  if (!b.metric || !(b.metric in GUIDANCE_METRIC_LABELS)) throw bad("Metrica non valida.");
  if (!Number.isInteger(b.targetFiscalYear) || !b.targetPeriod || !FISCAL_PERIODS.includes(b.targetPeriod)) throw bad("Periodo obiettivo non valido.");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const low = num(b.low);
  const high = num(b.high);
  const existing = b.id ? (await repo.listGuidance(id)).find((g) => g.id === b.id) : undefined;
  const item: GuidanceItem = {
    id: existing?.id ?? repo.newId("g"),
    companyId: id,
    ...(existing?.docId ? { docId: existing.docId } : {}),
    issuedDate: typeof b.issuedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.issuedDate) ? b.issuedDate : new Date().toISOString().slice(0, 10),
    metric: b.metric,
    label: (b.label ?? "").trim() || GUIDANCE_METRIC_LABELS[b.metric],
    targetFiscalYear: b.targetFiscalYear!,
    targetPeriod: b.targetPeriod,
    ...(low !== undefined ? { low } : {}),
    ...(high !== undefined ? { high } : {}),
    unit: b.unit ?? "currency",
    nonGaap: Boolean(b.nonGaap),
    qualitative: low === undefined && high === undefined,
    ...(b.text ? { text: String(b.text) } : {}),
    ...(existing?.quote ? { quote: existing.quote } : {}),
    ...(existing?.page ? { page: existing.page } : {}),
    createdAt: existing?.createdAt ?? repo.nowIso(),
  };
  await repo.putGuidance(item);
  return { item };
});

export const DELETE = route<Ctx>(async (req) => {
  const gid = new URL(req.url).searchParams.get("guidanceId");
  if (!gid) throw bad("Voce non valida.");
  await repo.deleteGuidance(gid);
  return { ok: true };
});
