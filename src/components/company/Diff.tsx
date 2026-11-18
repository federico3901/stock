"use client";

import { useMemo, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Badge, Button, Card, Empty, ErrorBox, Label, Segmented, Select, Spinner } from "@/components/ui";
import { SECTION_LABELS, type ParagraphChange, type SectionDiff } from "@/lib/analysis/textdiff";
import { errMsg, streamPost, useApi, useStatus } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import type { TabProps } from "./types";

type Kind = "tutti" | ParagraphChange["kind"];

/** La coppia più recente dello stesso tipo (10-K con 10-K, 10-Q con 10-Q): solo così le sezioni coincidono. */
function defaultPair(docs: { id: string; type: string; date?: string }[]) {
  for (const newest of docs) {
    const older = docs.find((d) => d.id !== newest.id && d.type === newest.type && (d.date ?? "") <= (newest.date ?? ""));
    if (older) return { newId: newest.id, oldId: older.id };
  }
  return { newId: docs[0]?.id ?? "", oldId: docs[1]?.id ?? "" };
}

export function DiffTab({ bundle }: TabProps) {
  const { data: status } = useStatus();
  // i documenti confrontabili sono i filing con sezioni standard, dal più recente
  const docs = useMemo(() => bundle.documents.filter((d) => d.type === "10-K" || d.type === "10-Q" || d.type === "annual_report"), [bundle.documents]);
  const [defaults] = useState(() => defaultPair(docs));
  const [oldId, setOldId] = useState(defaults.oldId);
  const [newId, setNewId] = useState(defaults.newId);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState<Kind>("tutti");
  // la sintesi è legata alla coppia di documenti: cambiando coppia sparisce da sola
  const pairKey = `${oldId}|${newId}`;
  const [summaryState, setSummaryState] = useState({ key: "", text: "" });
  const summary = summaryState.key === pairKey ? summaryState.text : "";
  const [summarizing, setSummarizing] = useState(false);

  const valid = !!oldId && !!newId && oldId !== newId;
  const { data, error, isLoading: loading } = useApi<{ sections: SectionDiff[] }>(
    valid ? `/api/companies/${bundle.company.id}/diff?old=${oldId}&new=${newId}` : null,
  );
  const sections = valid ? (data?.sections ?? null) : null;
  const shownErr = err || (error ? errMsg(error) : "");

  if (docs.length < 2) {
    return (
      <Empty title="Servono due filing da confrontare">
        Carica due 10-K (o 10-Q) di periodi diversi: qui vedrai quali fattori di rischio sono comparsi, quali sono spariti e dove il management ha cambiato le parole — spesso il segnale più precoce che qualcosa sta cambiando.
      </Empty>
    );
  }

  const summarize = async () => {
    setSummarizing(true);
    setErr("");
    setSummaryState({ key: pairKey, text: "" });
    try {
      await streamPost(`/api/companies/${bundle.company.id}/diff`, { old: oldId, new: newId }, (text) => setSummaryState({ key: pairKey, text }));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSummarizing(false);
    }
  };
  const total = sections?.reduce((n, s) => n + s.changes.length, 0) ?? 0;
  const count = (k: ParagraphChange["kind"]) => sections?.reduce((n, s) => n + s.changes.filter((c) => c.kind === k).length, 0) ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Label label="Filing precedente">
            <Select value={oldId} onChange={(e) => setOldId(e.target.value)}>
              {docs.map((d) => <option key={d.id} value={d.id}>{d.title}{d.date ? ` — ${fmtDate(d.date)}` : ""}</option>)}
            </Select>
          </Label>
          <span className="pb-2 text-ink-2" aria-hidden>→</span>
          <Label label="Filing nuovo">
            <Select value={newId} onChange={(e) => setNewId(e.target.value)}>
              {docs.map((d) => <option key={d.id} value={d.id}>{d.title}{d.date ? ` — ${fmtDate(d.date)}` : ""}</option>)}
            </Select>
          </Label>
          <div className="flex-1" />
          <Button variant="primary" onClick={summarize} disabled={!status?.llm || summarizing || !total} title={status?.llm ? undefined : "Richiede la chiave API"}>
            {summarizing && <Spinner />} Riassumi cosa è cambiato
          </Button>
        </div>
        {oldId === newId && <p className="text-sm text-critical-text mt-2">Scegli due documenti diversi.</p>}
      </Card>
      <ErrorBox>{shownErr}</ErrorBox>

      {summary && (
        <Card title="Sintesi delle differenze" hint="Scritta dal modello a partire dai paragrafi modificati">
          <Markdown>{summary}</Markdown>
        </Card>
      )}

      {loading ? (
        <div className="text-sm text-ink-2"><Spinner /> Confronto in corso…</div>
      ) : sections && sections.length === 0 ? (
        <Empty title="Nessuna sezione confrontabile">Non sono state trovate sezioni standard in comune (Item 1, 1A, 7…). Il confronto funziona sui filing SEC in inglese con la struttura a &quot;Item&quot;.</Empty>
      ) : sections ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented<Kind>
              value={kind}
              onChange={setKind}
              options={[
                { value: "tutti", label: `Tutti (${total})` },
                { value: "nuovo", label: `Nuovi (${count("nuovo")})` },
                { value: "modificato", label: `Riscritti (${count("modificato")})` },
                { value: "rimosso", label: `Rimossi (${count("rimosso")})` },
              ]}
            />
            <span className="text-xs text-ink-2">I paragrafi che cambiano solo nei numeri non sono considerati modificati.</span>
          </div>
          {sections.map((s) => {
            const list = s.changes.filter((c) => kind === "tutti" || c.kind === kind);
            return (
              <Card
                key={s.key}
                title={SECTION_LABELS[s.key]}
                hint={`${s.unchanged} paragrafi invariati · lunghezza ${s.newLength >= s.oldLength ? "+" : ""}${Math.round(((s.newLength - s.oldLength) / Math.max(1, s.oldLength)) * 100)}%`}
              >
                {list.length === 0 ? (
                  <p className="text-sm text-ink-2">Nessuna modifica di questo tipo.</p>
                ) : (
                  <ul className="space-y-3">
                    {list.map((c, i) => <Change key={i} c={c} />)}
                  </ul>
                )}
              </Card>
            );
          })}
        </>
      ) : null}
    </div>
  );
}

function Change({ c }: { c: ParagraphChange }) {
  const [open, setOpen] = useState(false);
  const long = c.text.length > 420;
  const text = long && !open ? c.text.slice(0, 420) + "…" : c.text;
  return (
    <li className="text-sm">
      <div className="flex gap-3">
        <div className="w-20 shrink-0 pt-0.5">
          <Badge tone={c.kind === "nuovo" ? "good" : c.kind === "rimosso" ? "bad" : "warn"}>{c.kind === "nuovo" ? "+ nuovo" : c.kind === "rimosso" ? "− rimosso" : "~ riscritto"}</Badge>
        </div>
        <div className="min-w-0 flex-1">
          <p className={c.kind === "rimosso" ? "line-through decoration-muted text-ink-2" : ""}>{text}</p>
          {c.kind === "modificato" && c.before && open && (
            <p className="mt-2 text-ink-2 border-l-2 border-line pl-3"><span className="text-xs font-medium block mb-0.5">Versione precedente</span>{c.before}</p>
          )}
          {(long || c.kind === "modificato") && (
            <button type="button" className="text-xs text-accent-ink hover:underline mt-1" onClick={() => setOpen((o) => !o)}>
              {open ? "Riduci" : c.kind === "modificato" ? "Mostra la versione precedente" : "Mostra tutto"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
