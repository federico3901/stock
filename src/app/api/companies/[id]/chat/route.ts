import { bad, body, notFound, route, streamText } from "@/lib/api";
import * as repo from "@/lib/repo";
import { LlmError, MAX_DOC_TOKENS, estimateTokens, llmMock, renderPages, runText } from "@/lib/llm/client";
import { companyDigest } from "@/lib/llm/digest";
import { CHAT_SYSTEM } from "@/lib/llm/prompts";
import type { ChatThread } from "@/lib/types";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  return { chats: await repo.listChats(id) };
});

/** Domanda sui documenti: risposta in streaming, conversazione salvata. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const bundle = await repo.loadCompanyBundle(id);
  if (!bundle) throw notFound("Azienda");
  const b = await body<{ threadId?: string; docIds?: string[]; message?: string }>(req);
  const message = (b.message ?? "").trim();
  if (!message) throw bad("Scrivi una domanda.");

  let thread = b.threadId ? await repo.getChat(b.threadId) : null;
  if (thread && thread.companyId !== id) thread = null;
  const docIds = (thread?.docIds ?? b.docIds ?? []).filter((d) => bundle.documents.some((x) => x.id === d));
  if (!thread) {
    thread = { id: repo.newId("chat"), companyId: id, title: message.slice(0, 70), docIds, messages: [], updatedAt: repo.nowIso() } satisfies ChatThread;
  }

  // contesto stabile (in cache tra una domanda e l'altra): dati strutturati + testo dei documenti scelti, in ordine fisso
  const parts = [`<dati_strutturati>\n${companyDigest(bundle)}\n</dati_strutturati>`];
  for (const docId of [...docIds].sort()) {
    const doc = bundle.documents.find((d) => d.id === docId)!;
    const text = await repo.getDocText(docId);
    if (text) parts.push(renderPages(doc.title, text.pages));
  }
  const context = parts.join("\n\n");
  if (estimateTokens(context.length) > MAX_DOC_TOKENS) {
    throw new LlmError("I documenti selezionati sono troppo lunghi per una sola conversazione: selezionane meno.", "too_large", 422);
  }

  const t = thread;
  t.messages.push({ role: "user", content: message });
  return streamText(async (send) => {
    send(JSON.stringify({ threadId: t.id }) + "\n");
    let answer: string;
    if (llmMock()) {
      answer = `Risposta di prova (LLM_MOCK). Hai chiesto: "${message}". Documenti nel contesto: ${docIds.length}.`;
      send(answer);
    } else {
      const res = await runText({ system: CHAT_SYSTEM, context, messages: t.messages, effort: "medium", maxTokens: 16000, onText: send });
      answer = res.text;
    }
    t.messages.push({ role: "assistant", content: answer });
    t.updatedAt = repo.nowIso();
    await repo.putChat(t);
  });
});

export const DELETE = route<Ctx>(async (req) => {
  const cid = new URL(req.url).searchParams.get("chatId");
  if (!cid) throw bad("Conversazione non valida.");
  await repo.deleteChat(cid);
  return { ok: true };
});
