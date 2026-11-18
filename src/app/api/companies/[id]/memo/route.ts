import { notFound, route, streamText } from "@/lib/api";
import * as repo from "@/lib/repo";
import { llmMock, runText } from "@/lib/llm/client";
import { companyDigest } from "@/lib/llm/digest";
import { MEMO_SYSTEM } from "@/lib/llm/prompts";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** Genera un memo d'investimento dai dati strutturati e lo salva tra le note. */
export const POST = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const bundle = await repo.loadCompanyBundle(id);
  if (!bundle) throw notFound("Azienda");
  const digest = companyDigest(bundle);
  return streamText(async (send) => {
    let text: string;
    if (llmMock()) {
      text = `## Sintesi\nMemo di prova (LLM_MOCK) per ${bundle.company.name}.\n\n## Dati usati\n${digest.length} caratteri di dati strutturati.`;
      send(text);
    } else {
      const res = await runText({
        system: MEMO_SYSTEM,
        messages: [{ role: "user", content: `Ecco i dati disponibili.\n\n${digest}\n\nScrivi il memo d'investimento.` }],
        effort: "high",
        maxTokens: 24000,
        onText: send,
      });
      text = res.text;
    }
    const now = repo.nowIso();
    await repo.putNote({
      id: repo.newId("note"),
      companyId: id,
      kind: "memo",
      title: `Memo ${new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}`,
      body: text,
      createdAt: now,
      updatedAt: now,
    });
  });
});
