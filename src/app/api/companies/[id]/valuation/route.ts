import { bad, body, notFound, route } from "@/lib/api";
import * as repo from "@/lib/repo";
import type { ScenarioInputs, ValuationInputs } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const SCENARIO_KEYS: (keyof ScenarioInputs)[] = ["revenueGrowthStart", "revenueGrowthEnd", "fcfMarginStart", "fcfMarginEnd", "shareChange", "exitMultiple", "probability"];

export const PUT = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  if (!(await repo.getCompany(id))) throw notFound("Azienda");
  const b = await body<ValuationInputs>(req);
  const fin = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (!fin(b.discountRate) || !fin(b.terminalGrowth) || !fin(b.years) || !b.scenarios) throw bad("Ipotesi non valide.");
  for (const name of ["bear", "base", "bull"] as const) {
    const s = b.scenarios[name];
    if (!s || !SCENARIO_KEYS.every((k) => fin(s[k]))) throw bad("Scenario non valido: " + name);
  }
  const v: ValuationInputs = {
    id,
    companyId: id,
    scenarios: b.scenarios,
    discountRate: b.discountRate,
    terminalGrowth: b.terminalGrowth,
    years: Math.min(20, Math.max(3, Math.round(b.years))),
    updatedAt: repo.nowIso(),
  };
  await repo.putValuation(v);
  return { valuation: v };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const { getStore } = await import("@/lib/store");
  await getStore().delete(repo.C.valuation, id);
  return { ok: true };
});
