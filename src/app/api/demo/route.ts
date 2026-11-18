import { route } from "@/lib/api";
import { buildDemo, DEMO_ID } from "@/lib/demo";
import * as repo from "@/lib/repo";

/** Carica (o ripristina) l'azienda dimostrativa. */
export const POST = route(async () => {
  await repo.deleteCompany(DEMO_ID);
  const d = buildDemo();
  await repo.putCompany(d.company);
  for (const x of d.documents) await repo.putDocument(x);
  for (const x of d.texts) await repo.putDocText(x);
  for (const x of d.periods) await repo.putPeriod(x);
  for (const x of d.custom) await repo.putCustom(x);
  for (const x of d.guidance) await repo.putGuidance(x);
  for (const x of d.insights) await repo.putInsights(x);
  for (const x of d.notes) await repo.putNote(x);
  for (const x of d.checks) await repo.putCheck(x);
  return { id: DEMO_ID };
});
