"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Input, Modal, Spinner } from "@/components/ui";
import { api, errMsg } from "@/lib/client";
import type { DocumentMeta, SourceRef } from "@/lib/types";

type OpenFn = (docId: string, page?: number, highlight?: string) => void;
const Ctx = createContext<{ open: OpenFn; title: (docId: string) => string | undefined }>({ open: () => {}, title: () => undefined });

/** Apre un documento a una pagina precisa: serve a verificare alla fonte ogni numero o citazione. */
export const useDocViewer = () => useContext(Ctx);

export function DocViewerProvider({ documents, children }: { documents: DocumentMeta[]; children: ReactNode }) {
  const [state, setState] = useState<{ docId: string; page: number; highlight?: string } | null>(null);
  const open = useCallback<OpenFn>((docId, page, highlight) => setState({ docId, page: page && page > 0 ? page : 1, highlight }), []);
  const title = useCallback((docId: string) => documents.find((d) => d.id === docId)?.title, [documents]);
  const value = useMemo(() => ({ open, title }), [open, title]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {state && <Viewer key={state.docId} {...state} onClose={() => setState(null)} />}
    </Ctx.Provider>
  );
}

function Viewer({ docId, page: initial, highlight, onClose }: { docId: string; page: number; highlight?: string; onClose: () => void }) {
  const [data, setData] = useState<{ document: DocumentMeta; pages: string[] } | null>(null);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(initial);
  const [query, setQuery] = useState(highlight ?? "");
  const bodyRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    api<{ document: DocumentMeta; pages: string[] }>(`/api/documents/${docId}`).then(setData).catch((e) => setErr(errMsg(e)));
  }, [docId]);

  const total = data?.pages.length ?? 0;
  const text = data?.pages[Math.min(page, total) - 1] ?? "";
  const q = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!data || q.length < 2) return [];
    return data.pages.map((p, i) => (p.toLowerCase().includes(q) ? i + 1 : 0)).filter(Boolean);
  }, [data, q]);

  useEffect(() => {
    bodyRef.current?.querySelector("mark")?.scrollIntoView({ block: "center" });
  }, [page, q, data]);

  const parts = useMemo(() => {
    if (q.length < 2) return [text];
    const out: ReactNode[] = [];
    const lower = text.toLowerCase();
    let i = 0;
    for (let n = 0; n < 500; n++) {
      const j = lower.indexOf(q, i);
      if (j < 0) break;
      out.push(text.slice(i, j), <mark key={j} className="bg-warning/60 text-ink rounded-sm">{text.slice(j, j + q.length)}</mark>);
      i = j + q.length;
    }
    out.push(text.slice(i));
    return out;
  }, [text, q]);

  const nextHit = () => {
    if (!hits.length) return;
    setPage(hits.find((h) => h > page) ?? hits[0]);
  };

  return (
    <Modal open onClose={onClose} wide title={data ? data.document.title : "Documento"}>
      {err ? (
        <div className="text-sm text-critical-text">{err}</div>
      ) : !data ? (
        <div className="text-sm text-ink-2"><Spinner /> Caricamento…</div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>← Prec.</Button>
            <span className="text-sm num">
              Pagina{" "}
              <input
                type="number"
                min={1}
                max={total}
                value={page}
                onChange={(e) => setPage(Math.min(total, Math.max(1, Number(e.target.value) || 1)))}
                className="w-16 h-7 rounded border border-edge bg-surface px-1.5 text-sm"
                aria-label="Numero di pagina"
              />{" "}
              di {total}
            </span>
            <Button size="sm" onClick={() => setPage((p) => Math.min(total, p + 1))} disabled={page >= total}>Succ. →</Button>
            <div className="flex-1" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca nel documento" className="w-56 h-7" onKeyDown={(e) => e.key === "Enter" && nextHit()} />
            {q.length >= 2 && (
              <Button size="sm" onClick={nextHit} disabled={!hits.length}>
                {hits.length ? `${hits.length} pag. · successiva` : "Nessun risultato"}
              </Button>
            )}
          </div>
          <pre ref={bodyRef} className="whitespace-pre-wrap font-mono text-xs leading-relaxed bg-surface-2 rounded-md p-4 max-h-[65vh] overflow-auto">
            {parts}
          </pre>
          <p className="text-xs text-muted">Testo estratto dal file caricato: l&apos;impaginazione delle tabelle è approssimata.</p>
        </div>
      )}
    </Modal>
  );
}

/** Piccolo rimando alla fonte (documento e pagina), cliccabile. */
export function SourceLink({ source, highlight, children }: { source?: SourceRef; highlight?: string; children?: ReactNode }) {
  const { open, title } = useDocViewer();
  if (!source) return null;
  const t = title(source.docId);
  if (!t) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); open(source.docId, source.page, highlight); }}
      className="text-xs text-accent-ink hover:underline whitespace-nowrap"
      title={`Apri "${t}"${source.page ? ` a pagina ${source.page}` : ""}`}
    >
      {children ?? `${t}${source.page ? `, p. ${source.page}` : ""}`}
    </button>
  );
}
