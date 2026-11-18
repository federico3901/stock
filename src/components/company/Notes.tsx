"use client";

import { useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Badge, Button, Card, ErrorBox, Input, Segmented, Select, Spinner, cx } from "@/components/ui";
import { api, errMsg, streamPost, useStatus } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import type { Note } from "@/lib/types";
import { ThesisChecks } from "./Thesis";
import type { TabProps } from "./types";

const KIND_LABELS: Record<Note["kind"], string> = { tesi: "Tesi", nota: "Nota", catalizzatore: "Catalizzatore", rischio: "Rischio", memo: "Memo" };
const KIND_TONE: Record<Note["kind"], "accent" | "neutral" | "good" | "bad" | "warn"> = { tesi: "accent", nota: "neutral", catalizzatore: "good", rischio: "bad", memo: "warn" };

const THESIS_TEMPLATE = `**Perché potrebbe funzionare**
- 

**Cosa deve essere vero** (numeri verificabili a ogni trimestrale)
- 

**Cosa mi farebbe cambiare idea**
- 

**Prezzo a cui comprerei / venderei**
- `;

export function NotesTab({ bundle, refresh, analysis }: TabProps) {
  const { company, notes } = bundle;
  const { data: status } = useStatus();
  const [currentId, setCurrentId] = useState<string | null>(notes[0]?.id ?? null);
  const [draft, setDraft] = useState<Partial<Note> | null>(null);
  const [mode, setMode] = useState<"leggi" | "scrivi">("leggi");
  const [memo, setMemo] = useState("");
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");

  const current = draft ?? notes.find((n) => n.id === currentId) ?? null;

  const startNew = (kind: Note["kind"]) => {
    setDraft({ kind, title: kind === "tesi" ? "Tesi d'investimento" : "", body: kind === "tesi" ? THESIS_TEMPLATE : "" });
    setMode("scrivi");
    setMemo("");
  };
  const edit = (n: Note) => {
    setDraft({ ...n });
    setMode("scrivi");
  };
  const save = async () => {
    if (!draft) return;
    setErr("");
    try {
      const { note } = await api<{ note: Note }>(`/api/companies/${company.id}/notes`, { json: draft });
      setDraft(null);
      setCurrentId(note.id);
      setMode("leggi");
      refresh();
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  const remove = async (n: Note) => {
    if (!confirm(`Eliminare "${n.title}"?`)) return;
    await api(`/api/companies/${company.id}/notes?noteId=${n.id}`, { method: "DELETE" });
    setCurrentId(null);
    refresh();
  };
  const generate = async () => {
    setGenerating(true);
    setErr("");
    setDraft(null);
    setCurrentId(null);
    setMemo("");
    try {
      await streamPost(`/api/companies/${company.id}/memo`, {}, setMemo);
      refresh();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
    <div className="no-print">
      <ThesisChecks companyId={company.id} currency={company.currency} evals={analysis.checks} snapshotLabel={analysis.snapshot?.label} refresh={refresh} />
    </div>
    <div className="grid lg:grid-cols-[280px_1fr] gap-4 items-start">
      <div className="space-y-4 no-print">
        {status?.llm && (
        <Card title="Memo d'investimento" hint="Scritto dal modello a partire da bilanci, metriche, segnali, guidance, analisi qualitativa e dalle tue note">
          <Button variant="primary" className="w-full" onClick={generate} disabled={generating || !status?.llm} title={status?.llm ? undefined : "Richiede la chiave API"}>
            {generating && <Spinner />} Genera memo
          </Button>
          {!status?.llm && <p className="text-xs text-ink-2 mt-2">Richiede la chiave API di Anthropic.</p>}
        </Card>
        )}
        <Card title="Le tue note" pad={false} action={
          <Select value="" onChange={(e) => e.target.value && startNew(e.target.value as Note["kind"])} className="h-7 text-xs" aria-label="Nuova nota">
            <option value="">+ Nuova…</option>
            <option value="tesi">Tesi</option>
            <option value="nota">Nota</option>
            <option value="catalizzatore">Catalizzatore</option>
            <option value="rischio">Rischio</option>
          </Select>
        }>
          <ul>
            {notes.map((n) => (
              <li key={n.id} className={cx("border-t border-line", !draft && !memo && n.id === currentId && "bg-accent-wash")}>
                <button type="button" className="w-full text-left px-4 py-2" onClick={() => { setDraft(null); setMemo(""); setCurrentId(n.id); setMode("leggi"); }}>
                  <div className="flex items-center gap-2">
                    <Badge tone={KIND_TONE[n.kind]}>{KIND_LABELS[n.kind]}</Badge>
                    <span className="text-sm truncate">{n.title}</span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">{fmtDate(n.updatedAt)}</div>
                </button>
              </li>
            ))}
            {!notes.length && <li className="px-4 py-3 text-sm text-ink-2 border-t border-line">Nessuna nota. Inizia dalla tesi: scriverla ti obbliga a dire cosa deve succedere perché l&apos;investimento funzioni.</li>}
          </ul>
        </Card>
      </div>

      <div className="space-y-3 min-w-0">
        <ErrorBox>{err}</ErrorBox>
        {memo || generating ? (
          <Card title="Nuovo memo" action={!generating ? <Button size="sm" onClick={() => window.print()}>Stampa / PDF</Button> : <span className="text-xs text-ink-2"><Spinner /> scrittura in corso…</span>}>
            {memo ? <Markdown>{memo.split("\n\n[[ERRORE]]")[0]}</Markdown> : <p className="text-sm text-ink-2">Sto analizzando i dati…</p>}
          </Card>
        ) : current ? (
          <Card
            title={
              draft ? (
                <div className="flex gap-2 items-center">
                  <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Note["kind"] })} className="h-8" aria-label="Tipo">
                    {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                  <Input value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Titolo" className="h-8 w-72 max-w-full font-normal" />
                </div>
              ) : (
                <span className="flex items-center gap-2"><Badge tone={KIND_TONE[current.kind!]}>{KIND_LABELS[current.kind!]}</Badge>{current.title}</span>
              )
            }
            action={
              draft ? (
                <>
                  <Segmented value={mode} onChange={setMode} options={[{ value: "scrivi", label: "Scrivi" }, { value: "leggi", label: "Anteprima" }]} />
                  <Button size="sm" onClick={() => { setDraft(null); setMode("leggi"); }}>Annulla</Button>
                  <Button size="sm" variant="primary" onClick={save}>Salva</Button>
                </>
              ) : (
                <span className="no-print flex gap-2">
                  <Button size="sm" onClick={() => window.print()}>Stampa / PDF</Button>
                  <Button size="sm" onClick={() => edit(current as Note)}>Modifica</Button>
                  <Button size="sm" variant="danger" onClick={() => remove(current as Note)}>Elimina</Button>
                </span>
              )
            }
          >
            {draft && mode === "scrivi" ? (
              <textarea
                value={draft.body ?? ""}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                className="w-full min-h-[50vh] rounded-md border border-edge bg-surface p-3 text-sm font-mono leading-relaxed focus:outline-2 focus:outline-accent"
                placeholder="Scrivi in Markdown…"
                aria-label="Testo della nota"
              />
            ) : (
              <Markdown>{current.body || "*Nota vuota.*"}</Markdown>
            )}
          </Card>
        ) : (
          <Card>
            <div className="py-8 text-center">
              <div className="font-medium">Tesi, note e memo</div>
              <p className="text-sm text-ink-2 mt-1 max-w-lg mx-auto">Tieni qui il ragionamento: la tesi d&apos;investimento, i catalizzatori, i rischi da seguire. Le note entrano nel contesto della chat e del memo.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="primary" onClick={() => startNew("tesi")}>Scrivi la tesi</Button>
                <Button onClick={() => startNew("nota")}>Nuova nota</Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
    </div>
  );
}
