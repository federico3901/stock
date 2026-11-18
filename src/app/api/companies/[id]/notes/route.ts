import { bad, body, notFound, route } from "@/lib/api";
import * as repo from "@/lib/repo";
import type { Note } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };
const KINDS: Note["kind"][] = ["nota", "tesi", "memo", "catalizzatore", "rischio"];

export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  if (!(await repo.getCompany(id))) throw notFound("Azienda");
  const b = await body<Partial<Note>>(req);
  const existing = b.id ? (await repo.listNotes(id)).find((n) => n.id === b.id) : undefined;
  const now = repo.nowIso();
  const note: Note = {
    id: existing?.id ?? repo.newId("note"),
    companyId: id,
    kind: b.kind && KINDS.includes(b.kind) ? b.kind : (existing?.kind ?? "nota"),
    title: (b.title ?? existing?.title ?? "").trim() || "Senza titolo",
    body: typeof b.body === "string" ? b.body : (existing?.body ?? ""),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await repo.putNote(note);
  return { note };
});

export const DELETE = route<Ctx>(async (req) => {
  const nid = new URL(req.url).searchParams.get("noteId");
  if (!nid) throw bad("Nota non valida.");
  await repo.deleteNote(nid);
  return { ok: true };
});
