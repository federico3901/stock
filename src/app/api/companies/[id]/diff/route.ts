import { bad, body, notFound, route, streamText } from "@/lib/api";
import * as repo from "@/lib/repo";
import { diffFilings, SECTION_LABELS, type SectionDiff } from "@/lib/analysis/textdiff";
import { llmMock, runText } from "@/lib/llm/client";
import { DIFF_SYSTEM } from "@/lib/llm/prompts";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

async function compute(companyId: string, oldId: string | null, newId: string | null) {
  if (!oldId || !newId || oldId === newId) throw bad("Scegli due documenti diversi.");
  const [oldDoc, newDoc] = await Promise.all([repo.getDocument(oldId), repo.getDocument(newId)]);
  if (!oldDoc || !newDoc || oldDoc.companyId !== companyId || newDoc.companyId !== companyId) throw notFound("Documento");
  const [a, b] = await Promise.all([repo.getDocText(oldId), repo.getDocText(newId)]);
  if (!a || !b) throw notFound("Testo del documento");
  return { oldDoc, newDoc, sections: diffFilings(a.pages, b.pages) };
}

/** Confronto deterministico (nessuna chiamata al modello). */
export const GET = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const { sections } = await compute(id, q.get("old"), q.get("new"));
  return { sections };
});

const BUDGET = 400_000; // caratteri di modifiche passati al modello

function render(sections: SectionDiff[]): { text: string; included: number; total: number } {
  let used = 0;
  let included = 0;
  let total = 0;
  const parts: string[] = [];
  for (const s of sections) {
    const lines: string[] = [];
    // prima i paragrafi nuovi, poi i riscritti, poi i rimossi
    const order = { nuovo: 0, modificato: 1, rimosso: 2 } as const;
    for (const c of [...s.changes].sort((x, y) => order[x.kind] - order[y.kind])) {
      total++;
      const line = c.kind === "modificato" ? `[RISCRITTO]\nPrima: ${c.before}\nDopo: ${c.text}` : `[${c.kind.toUpperCase()}] ${c.text}`;
      if (used + line.length > BUDGET) continue;
      used += line.length;
      included++;
      lines.push(line);
    }
    if (lines.length) parts.push(`## ${SECTION_LABELS[s.key]}\n(${s.unchanged} paragrafi invariati)\n\n${lines.join("\n\n")}`);
  }
  return { text: parts.join("\n\n"), included, total };
}

/** Sintesi delle differenze scritta dal modello. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const b = await body<{ old?: string; new?: string }>(req);
  const { oldDoc, newDoc, sections } = await compute(id, b.old ?? null, b.new ?? null);
  const r = render(sections);
  if (!r.total) throw bad("Nessuna differenza trovata nelle sezioni confrontabili.");
  return streamText(async (send) => {
    if (r.included < r.total) send(`> Nota: analizzate ${r.included} modifiche su ${r.total} (le altre superano il limite di lunghezza).\n\n`);
    if (llmMock()) {
      send(`Sintesi di prova (LLM_MOCK): ${r.total} modifiche tra "${oldDoc.title}" e "${newDoc.title}".`);
      return;
    }
    await runText({
      system: DIFF_SYSTEM,
      messages: [{ role: "user", content: `Filing precedente: "${oldDoc.title}". Filing nuovo: "${newDoc.title}".\n\n${r.text}` }],
      effort: "medium",
      maxTokens: 12000,
      onText: send,
    });
  });
});
