"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Button, Card, ErrorBox, InfoBox, Spinner, cx } from "@/components/ui";
import { api, errMsg, streamPost, useApi, useStatus } from "@/lib/client";
import { fmtDate, fmtNum } from "@/lib/format";
import type { ChatMessage, ChatThread } from "@/lib/types";
import { useDocViewer } from "./DocViewer";
import type { TabProps } from "./types";

const SUGGESTIONS = [
  "Quali sono i tre rischi più importanti e come sono cambiati rispetto all'anno scorso?",
  "Spiegami da dove viene la crescita dei ricavi: prezzo, volumi o nuovi prodotti?",
  "Cosa dice il management sulla concorrenza e sul potere di prezzo?",
  "Ci sono voci una tantum o rettifiche che gonfiano l'utile rettificato?",
  "Com'è strutturato il debito e quando scade?",
  "Riassumi la guidance e le ipotesi su cui si basa.",
];

export function ChatTab({ bundle }: TabProps) {
  const { company, documents } = bundle;
  const { data: status } = useStatus();
  const viewer = useDocViewer();
  const { data, mutate } = useApi<{ chats: ChatThread[] }>(`/api/companies/${company.id}/chat`);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(() => documents.slice(0, 2).map((d) => d.id));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const docRefs = useMemo(() => documents.map((d) => ({ id: d.id, title: d.title })), [documents]);

  const thread = data?.chats.find((c) => c.id === threadId);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const openThread = (t: ChatThread | null) => {
    setThreadId(t?.id ?? null);
    setMessages(t?.messages ?? []);
    setErr("");
  };

  const activeDocs = thread ? thread.docIds : selected;
  const chars = documents.filter((d) => activeDocs.includes(d.id)).reduce((a, d) => a + d.charCount, 0);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setErr("");
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: message }, { role: "assistant", content: "" }];
    setMessages(next);
    try {
      await streamPost(`/api/companies/${company.id}/chat`, { threadId, docIds: selected, message }, (full) => {
        // la prima riga è un JSON con l'id della conversazione
        const nl = full.indexOf("\n");
        if (nl < 0) return;
        try {
          const meta = JSON.parse(full.slice(0, nl)) as { threadId: string };
          setThreadId(meta.threadId);
        } catch {
          /* intestazione non ancora completa */
        }
        const body = full.slice(nl + 1).split("\n\n[[ERRORE]]")[0];
        setMessages([...next.slice(0, -1), { role: "assistant", content: body }]);
      });
      mutate();
    } catch (e) {
      setErr(errMsg(e));
      setMessages((m) => (m[m.length - 1]?.content === "" ? m.slice(0, -1) : m));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: ChatThread) => {
    if (!confirm("Eliminare questa conversazione?")) return;
    await api(`/api/companies/${company.id}/chat?chatId=${t.id}`, { method: "DELETE" });
    if (t.id === threadId) openThread(null);
    mutate();
  };

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-4 items-start">
      <div className="space-y-4">
        <Card title="Conversazioni" action={<Button size="sm" onClick={() => openThread(null)}>+ Nuova</Button>} pad={false}>
          <ul className="max-h-72 overflow-y-auto">
            {(data?.chats ?? []).map((t) => (
              <li key={t.id} className={cx("group flex items-center border-t border-line", t.id === threadId && "bg-accent-wash")}>
                <button type="button" className="flex-1 min-w-0 text-left px-4 py-2 text-sm" onClick={() => openThread(t)}>
                  <div className="truncate">{t.title}</div>
                  <div className="text-[11px] text-muted">{fmtDate(t.updatedAt)} · {(t.messages.length / 2) | 0 || 1} {t.messages.length > 2 ? "domande" : "domanda"}</div>
                </button>
                <button type="button" className="px-2 text-muted hover:text-critical-text opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => remove(t)} aria-label="Elimina conversazione">✕</button>
              </li>
            ))}
            {!data?.chats.length && <li className="px-4 py-3 text-sm text-ink-2 border-t border-line">Nessuna conversazione.</li>}
          </ul>
        </Card>
        <Card title="Documenti nel contesto" hint={thread ? "Fissati all'inizio della conversazione" : "Scegli su quali documenti fare domande"}>
          {documents.length === 0 ? (
            <p className="text-sm text-ink-2">Nessun documento caricato: la chat userà solo i dati strutturati.</p>
          ) : (
            <ul className="space-y-1.5">
              {documents.map((d) => (
                <li key={d.id}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 accent-[var(--accent)]"
                      checked={activeDocs.includes(d.id)}
                      disabled={Boolean(thread)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, d.id] : s.filter((x) => x !== d.id)))}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{d.title}</span>
                      <span className="text-[11px] text-muted">{d.pageCount} pag.</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted mt-3 pt-3 border-t border-line">
            {chars < 3600 ? "Meno di mille" : `~${fmtNum(Math.round(chars / 3600))} mila`} token di testo. Bilanci, metriche, guidance e note sono sempre inclusi. Dopo la prima domanda il contesto resta in cache e le successive costano circa un decimo.
          </p>
        </Card>
      </div>

      <Card pad={false} className="flex flex-col min-h-[60vh]">
        <div className="flex-1 p-4 space-y-5 overflow-y-auto max-h-[68vh]">
          {status && !status.llm && <InfoBox tone="warn">La chat richiede la chiave API di Anthropic (ANTHROPIC_API_KEY).</InfoBox>}
          {messages.length === 0 && (
            <div className="py-6">
              <div className="font-medium">Fai una domanda sui documenti di {company.name}</div>
              <p className="text-sm text-ink-2 mt-1">Le risposte citano documento e pagina: clicca la citazione per aprire la fonte.</p>
              <div className="mt-4 grid sm:grid-cols-2 gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} disabled={busy || !status?.llm} className="text-left text-sm rounded-md border border-edge px-3 py-2 hover:bg-surface-2 disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="bg-accent-wash rounded-lg px-3 py-2 text-sm max-w-[80%] whitespace-pre-wrap">{m.content}</div>
              </div>
            ) : (
              <div key={i} className="max-w-[95%]">
                {m.content ? <Markdown docs={docRefs} onDoc={(id, page) => viewer.open(id, page)}>{m.content}</Markdown> : <span className="text-sm text-ink-2"><Spinner /> Sto leggendo i documenti…</span>}
              </div>
            ),
          )}
          <ErrorBox>{err}</ErrorBox>
          <div ref={endRef} />
        </div>
        <form
          className="border-t border-line p-3 flex gap-2 items-end"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            rows={2}
            placeholder="Scrivi una domanda… (Invio per inviare, Maiusc+Invio per andare a capo)"
            className="flex-1 resize-none rounded-md border border-edge bg-surface px-3 py-2 text-sm focus:outline-2 focus:outline-accent"
            disabled={busy || !status?.llm}
            aria-label="Domanda"
          />
          <Button variant="primary" type="submit" disabled={busy || !input.trim() || !status?.llm}>{busy ? <Spinner /> : null} Invia</Button>
        </form>
      </Card>
    </div>
  );
}
