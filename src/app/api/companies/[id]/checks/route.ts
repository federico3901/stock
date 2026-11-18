import { bad, body, notFound, route } from "@/lib/api";
import { METRIC_MAP, type MetricKey } from "@/lib/analysis/metrics";
import * as repo from "@/lib/repo";
import type { ThesisCheck } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Aggiunge una condizione della tesi (o la modifica, se arriva con un id esistente). */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  if (!(await repo.getCompany(id))) throw notFound("Azienda");
  const b = await body<Partial<ThesisCheck>>(req);
  if (!b.metric || !METRIC_MAP[b.metric as MetricKey]) throw bad("Metrica non valida.");
  if (b.op !== "gte" && b.op !== "lte") throw bad("Operatore non valido.");
  if (typeof b.threshold !== "number" || !Number.isFinite(b.threshold)) throw bad("Soglia non valida.");
  const existing = b.id ? (await repo.listChecks(id)).find((c) => c.id === b.id) : undefined;
  const check: ThesisCheck = {
    id: existing?.id ?? repo.newId("chk"),
    companyId: id,
    metric: b.metric,
    op: b.op,
    threshold: b.threshold,
    note: typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 300) : undefined,
    createdAt: existing?.createdAt ?? repo.nowIso(),
  };
  await repo.putCheck(check);
  return { check };
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const cid = new URL(req.url).searchParams.get("checkId");
  if (!cid || !(await repo.listChecks(id)).some((c) => c.id === cid)) throw bad("Condizione non valida.");
  await repo.deleteCheck(cid);
  return { ok: true };
});
