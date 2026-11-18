import { bad, body, route } from "@/lib/api";
import { runPass } from "@/lib/llm/extract";
import type { PassName } from "@/lib/types";

// L'estrazione da un 10-K può richiedere alcuni minuti.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { pass } = await body<{ pass?: PassName }>(req);
  if (pass !== "financials" && pass !== "guidance" && pass !== "insights") throw bad("Passaggio non valido.");
  const res = await runPass(id, pass);
  return { document: res.doc, summary: res.summary, usage: res.usage ?? null };
});
