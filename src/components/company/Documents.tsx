"use client";

import { useRef, useState } from "react";
import { Badge, Button, Card, Empty, ErrorBox, InfoBox, Input, Label, Select, Spinner, cx } from "@/components/ui";
import { api, errMsg, useStatus } from "@/lib/client";
import { fmtDate, fmtNum } from "@/lib/format";
import { parseFile, type ParsedFile } from "@/lib/parse";
import { DOC_TYPE_LABELS, FISCAL_PERIODS, type DocType, type DocumentMeta, type FiscalPeriod, type PassName, type PassState } from "@/lib/types";
import { useDocViewer } from "./DocViewer";
import type { TabProps } from "./types";

const PASSES: { key: PassName; label: string; hint: string }[] = [
  { key: "financials", label: "Bilanci e KPI", hint: "Conto economico, stato patrimoniale, rendiconto, segmenti e KPI" },
  { key: "guidance", label: "Guidance", hint: "Outlook e obiettivi dichiarati dal management" },
  { key: "insights", label: "Analisi qualitativa", hint: "Sintesi, rischi, segnali contabili, tono, domande aperte" },
];

const defaultPasses = (type: DocType): Record<PassName, boolean> => ({
  financials: type !== "transcript",
  guidance: true,
  insights: true,
});

interface Draft {
  key: string;
  file: File;
  parsed?: ParsedFile;
  progress?: string;
  error?: string;
  title: string;
  type: DocType;
  date: string;
  fiscalYear: string;
  fiscalPeriod: FiscalPeriod | "";
  passes: Record<PassName, boolean>;
  state: "parsing" | "ready" | "uploading" | "done" | "error";
}

// stima: ~3,6 caratteri per token; primo passaggio a prezzo pieno (+25% scrittura cache), i successivi al 10%
function estimateCost(chars: number, passes: number): number {
  if (!passes) return 0;
  const tokens = chars / 3.6;
  const input = (tokens * 1.25 + tokens * 0.1 * (passes - 1)) * 4;
  const output = passes * 6000 * 20;
  return (input + output) / 1e6;
}

export function Documents({ bundle, refresh }: TabProps) {
  const { company, documents } = bundle;
  const { data: status } = useStatus();
  const viewer = useDocViewer();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState<Record<string, PassName | undefined>>({});
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const patch = (key: string, p: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));

  const addFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`;
      setDrafts((ds) => [...ds, { key, file, title: file.name, type: "other", date: "", fiscalYear: "", fiscalPeriod: "", passes: defaultPasses("other"), state: "parsing", progress: "Lettura del file…" }]);
      parseFile(file, (done, total) => patch(key, { progress: `Lettura pagina ${done} di ${total}…` }))
        .then((parsed) =>
          patch(key, {
            parsed,
            state: "ready",
            progress: undefined,
            title: parsed.guess.title,
            type: parsed.guess.type,
            fiscalYear: parsed.guess.fiscalYear ? String(parsed.guess.fiscalYear) : "",
            fiscalPeriod: parsed.guess.fiscalPeriod ?? "",
            passes: defaultPasses(parsed.guess.type),
          }),
        )
        .catch((e) => patch(key, { state: "error", error: errMsg(e), progress: undefined }));
    }
  };

  const runPasses = async (docId: string, passes: PassName[]) => {
    for (const pass of passes) {
      setRunning((r) => ({ ...r, [docId]: pass }));
      try {
        await api(`/api/documents/${docId}/extract`, { json: { pass } });
      } catch (e) {
        setErr(`${PASSES.find((p) => p.key === pass)!.label}: ${errMsg(e)}`);
        refresh();
        if ((e as { code?: string }).code === "not_configured") break;
      }
      refresh();
    }
    setRunning((r) => ({ ...r, [docId]: undefined }));
  };

  const upload = async (d: Draft) => {
    if (!d.parsed) return;
    patch(d.key, { state: "uploading", progress: "Salvataggio…" });
    setErr("");
    try {
      const { document } = await api<{ document: DocumentMeta }>(`/api/companies/${company.id}/documents`, {
        json: {
          title: d.title,
          type: d.type,
          fileName: d.file.name,
          date: d.date || undefined,
          fiscalYear: d.fiscalYear ? Number(d.fiscalYear) : undefined,
          fiscalPeriod: d.fiscalPeriod || undefined,
          pages: d.parsed.pages,
        },
      });
      setDrafts((ds) => ds.filter((x) => x.key !== d.key));
      refresh();
      const passes = PASSES.map((p) => p.key).filter((k) => d.passes[k]);
      if (status?.llm && passes.length) await runPasses(document.id, passes);
    } catch (e) {
      patch(d.key, { state: "error", error: errMsg(e), progress: undefined });
    }
  };

  const remove = async (doc: DocumentMeta) => {
    if (!confirm(`Eliminare "${doc.title}"? Guidance e analisi qualitativa estratte da questo documento verranno rimosse; i valori di bilancio già importati restano.`)) return;
    await api(`/api/documents/${doc.id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="space-y-4">
      {status?.mock && <InfoBox tone="warn">Modalità di prova attiva (LLM_MOCK): le analisi restituiscono dati finti.</InfoBox>}

      {status?.llm && (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className={cx("rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors", dragging ? "border-accent bg-accent-wash" : "border-axis bg-surface")}
      >
        <div className="font-medium">Trascina qui i documenti</div>
        <p className="text-sm text-ink-2 mt-1">10-K, 10-Q, comunicati sui risultati, presentazioni, trascrizioni delle call — in PDF, HTML o testo. Anche più file insieme.</p>
        <Button variant="primary" className="mt-4" onClick={() => input.current?.click()}>Scegli file</Button>
        <input ref={input} type="file" multiple hidden accept=".pdf,.htm,.html,.xhtml,.txt,.md,application/pdf,text/html,text/plain" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <p className="text-xs text-muted mt-3">Il file viene letto nel tuo browser: al server arriva solo il testo.</p>
      </div>
      )}

      <ErrorBox>{err}</ErrorBox>

      {drafts.map((d) => {
        const nPasses = PASSES.filter((p) => d.passes[p.key]).length;
        return (
          <Card key={d.key} title={d.file.name} hint={d.parsed ? `${d.parsed.pages.length} pagine · ${fmtNum(d.parsed.charCount)} caratteri` : undefined} action={<Button size="sm" variant="ghost" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}>Rimuovi</Button>}>
            {d.state === "parsing" || d.state === "uploading" ? (
              <div className="text-sm text-ink-2"><Spinner /> {d.progress}</div>
            ) : d.state === "error" && !d.parsed ? (
              <ErrorBox>{d.error}</ErrorBox>
            ) : (
              <div className="space-y-3">
                {d.parsed && d.parsed.emptyPages > d.parsed.pages.length * 0.5 && (
                  <InfoBox tone="warn">Più di metà delle pagine non contiene testo: il PDF sembra una scansione. Serve una versione con testo selezionabile (o un OCR).</InfoBox>
                )}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <Label label="Titolo" className="col-span-2">
                    <Input value={d.title} onChange={(e) => patch(d.key, { title: e.target.value })} />
                  </Label>
                  <Label label="Tipo" className="col-span-2 md:col-span-1">
                    <Select value={d.type} onChange={(e) => patch(d.key, { type: e.target.value as DocType, passes: defaultPasses(e.target.value as DocType) })}>
                      {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </Label>
                  <Label label="Esercizio">
                    <Input value={d.fiscalYear} onChange={(e) => patch(d.key, { fiscalYear: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="auto" inputMode="numeric" />
                  </Label>
                  <Label label="Periodo">
                    <Select value={d.fiscalPeriod} onChange={(e) => patch(d.key, { fiscalPeriod: e.target.value as FiscalPeriod | "" })}>
                      <option value="">auto</option>
                      {FISCAL_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </Select>
                  </Label>
                  <Label label="Data pubblicazione">
                    <Input type="date" value={d.date} onChange={(e) => patch(d.key, { date: e.target.value })} />
                  </Label>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <span className="text-xs font-medium text-ink-2">Cosa estrarre:</span>
                  {PASSES.map((p) => (
                    <label key={p.key} className="flex items-center gap-1.5 text-sm" title={p.hint}>
                      <input type="checkbox" checked={d.passes[p.key]} onChange={(e) => patch(d.key, { passes: { ...d.passes, [p.key]: e.target.checked } })} className="accent-[var(--accent)]" />
                      {p.label}
                    </label>
                  ))}
                  <div className="flex-1" />
                  {d.parsed && status?.llm && !status.mock && nPasses > 0 && (
                    <span className="text-xs text-ink-2" title="Stima indicativa basata sulla lunghezza del testo e sui prezzi di listino del modello">
                      costo stimato ~{estimateCost(d.parsed.charCount, nPasses).toLocaleString("it-IT", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}
                    </span>
                  )}
                  <Button variant="primary" onClick={() => upload(d)} disabled={!d.title.trim()}>
                    {status?.llm && nPasses ? "Carica e analizza" : "Carica"}
                  </Button>
                </div>
                {d.error && <ErrorBox>{d.error}</ErrorBox>}
              </div>
            )}
          </Card>
        );
      })}

      {documents.length === 0 && drafts.length === 0 ? (
        <Empty title="Nessun documento caricato">
          Suggerimento: inizia dall&apos;ultimo 10-K (contiene tre anni di conto economico e due di stato patrimoniale), poi aggiungi i 10-Q successivi e l&apos;ultima presentazione dei risultati per la guidance.
        </Empty>
      ) : documents.length > 0 ? (
        <Card title={`Documenti e fonti (${documents.length})`} pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ink-2 text-left border-b border-line [&>th]:font-medium [&>th]:px-4 [&>th]:py-2">
                  <th>Documento</th>
                  <th>Periodo</th>
                  <th>Data</th>
                  <th className="text-right">Pagine</th>
                  <th>Analisi</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-line last:border-0 [&>td]:px-4 [&>td]:py-2.5 align-top">
                    <td>
                      {doc.url && !doc.pageCount ? (
                        <a href={doc.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{doc.title} ↗</a>
                      ) : (
                        <button type="button" className="font-medium hover:underline text-left" onClick={() => viewer.open(doc.id)}>{doc.title}</button>
                      )}
                      <div className="text-xs text-muted">{DOC_TYPE_LABELS[doc.type]}</div>
                    </td>
                    <td className="num whitespace-nowrap">{doc.fiscalYear ? `${doc.fiscalPeriod && doc.fiscalPeriod !== "FY" ? doc.fiscalPeriod + " " : "FY"}${doc.fiscalYear}` : "–"}</td>
                    <td className="whitespace-nowrap">{fmtDate(doc.date)}</td>
                    <td className="text-right num">{doc.pageCount || "–"}</td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        {!doc.pageCount && <span className="text-xs text-muted">fonte dei dati già caricati</span>}
                        {doc.pageCount > 0 && PASSES.map((p) => (
                          <PassBadge
                            key={p.key}
                            label={p.label}
                            state={running[doc.id] === p.key ? { status: "running" } : doc.passes[p.key]}
                            disabled={!status?.llm || Boolean(running[doc.id])}
                            onRun={() => { setErr(""); runPasses(doc.id, [p.key]); }}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {doc.pageCount > 0 && <Button size="sm" variant="ghost" onClick={() => viewer.open(doc.id)}>Apri</Button>}
                      <Button size="sm" variant="ghost" onClick={() => remove(doc)} className="text-critical-text">Elimina</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {documents.some((d) => Object.values(d.passes).some((p) => p?.costUsd)) && (
        <p className="text-xs text-muted">
          Costo totale delle analisi su questa azienda:{" "}
          {documents.reduce((a, d) => a + Object.values(d.passes).reduce((x, p) => x + (p?.costUsd ?? 0), 0), 0).toLocaleString("it-IT", { style: "currency", currency: "USD" })}
        </p>
      )}
    </div>
  );
}

function PassBadge({ label, state, onRun, disabled }: { label: string; state?: PassState; onRun: () => void; disabled: boolean }) {
  const status = state?.status ?? "pending";
  const tone = status === "done" ? "good" : status === "error" ? "bad" : status === "running" ? "accent" : "neutral";
  const icon = status === "done" ? "✓" : status === "error" ? "✕" : status === "running" ? null : "○";
  const title =
    status === "done"
      ? `Completata${state?.costUsd ? ` · costo ${state.costUsd.toLocaleString("it-IT", { style: "currency", currency: "USD" })}` : ""}. Clic per ripetere.`
      : status === "error"
        ? `Errore: ${state?.error ?? ""}. Clic per riprovare.`
        : status === "running"
          ? "In corso… può richiedere qualche minuto"
          : "Non ancora eseguita. Clic per avviare.";
  return (
    <button type="button" onClick={onRun} disabled={disabled || status === "running"} title={title} className="disabled:cursor-default">
      <Badge tone={tone}>
        {status === "running" ? <Spinner className="size-2.5 border" /> : icon} {label}
      </Badge>
    </button>
  );
}
