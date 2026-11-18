import { bad, body, notFound, route } from "@/lib/api";
import * as repo from "@/lib/repo";
import { periodId } from "@/lib/analysis/periods";
import { FIELD_MAP, type FieldKey } from "@/lib/fields";
import { FISCAL_PERIODS, type FinancialPeriod, type FiscalPeriod } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

interface EditBody {
  fiscalYear?: number;
  fiscalPeriod?: FiscalPeriod;
  periodEnd?: string;
  /** valori da impostare; null cancella il valore */
  values?: Partial<Record<FieldKey, number | null>>;
}

/** Inserimento o correzione manuale: i campi toccati vengono marcati "edited" e protetti dalle estrazioni successive. */
export const PUT = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  if (!(await repo.getCompany(id))) throw notFound("Azienda");
  const b = await body<EditBody>(req);
  if (!Number.isInteger(b.fiscalYear) || !b.fiscalPeriod || !FISCAL_PERIODS.includes(b.fiscalPeriod)) throw bad("Periodo non valido.");
  const pid = periodId(id, b.fiscalYear!, b.fiscalPeriod);
  const existing = (await repo.listPeriods(id)).find((p) => p.id === pid);
  const p: FinancialPeriod = existing ?? {
    id: pid, companyId: id, fiscalYear: b.fiscalYear!, fiscalPeriod: b.fiscalPeriod, periodEnd: "", values: {}, sources: {}, edited: {}, updatedAt: "",
  };
  if (typeof b.periodEnd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.periodEnd)) p.periodEnd = b.periodEnd;
  for (const [k, v] of Object.entries(b.values ?? {}) as [FieldKey, number | null][]) {
    if (!FIELD_MAP[k]) continue;
    if (v === null) {
      delete p.values[k];
      delete p.sources[k];
      p.edited[k] = true;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      p.values[k] = v;
      delete p.sources[k];
      p.edited[k] = true;
    }
  }
  p.updatedAt = repo.nowIso();
  await repo.putPeriod(p);
  return { period: p };
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const pid = new URL(req.url).searchParams.get("periodId");
  if (!pid || !pid.startsWith(id + "_")) throw bad("Periodo non valido.");
  await repo.deletePeriod(pid);
  return { ok: true };
});
