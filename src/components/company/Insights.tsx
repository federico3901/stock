"use client";

import { useState } from "react";
import { Badge, Button, Card, Empty, Select } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { InsightRisk } from "@/lib/types";
import { SourceLink } from "./DocViewer";
import type { TabProps } from "./types";

const toneOf = { "molto positivo": "good", positivo: "good", neutro: "neutral", cauto: "warn", negativo: "bad" } as const;

export function InsightsTab({ bundle, setTab }: TabProps) {
  const docs = bundle.documents.filter((d) => bundle.insights.some((i) => i.id === d.id));
  const [docId, setDocId] = useState(docs[0]?.id ?? "");
  const ins = bundle.insights.find((i) => i.id === (docs.some((d) => d.id === docId) ? docId : docs[0]?.id));

  if (!ins) {
    return (
      <Empty title="Nessuna analisi qualitativa" action={<Button variant="primary" onClick={() => setTab("documenti")}>Vai ai documenti</Button>}>
        Per ogni documento analizzato trovi qui: sintesi, modello di business, punti positivi e negativi, rischi specifici, segnali contabili, tono del management, citazioni chiave e domande aperte — ognuno col rimando alla pagina.
      </Empty>
    );
  }
  const doc = bundle.documents.find((d) => d.id === ins.id);
  const src = (page?: number) => ({ docId: ins.id, page });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={ins.id} onChange={(e) => setDocId(e.target.value)} aria-label="Documento">
          {docs.map((d) => <option key={d.id} value={d.id}>{d.title}{d.date ? ` — ${fmtDate(d.date)}` : ""}</option>)}
        </Select>
        <Badge tone={toneOf[ins.managementTone.label]}>Tono del management: {ins.managementTone.label}</Badge>
        {doc && <SourceLink source={{ docId: doc.id }}>Apri il documento</SourceLink>}
      </div>

      <Card title="In sintesi">
        <p className="text-[15px] leading-relaxed">{ins.summary}</p>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Punti positivi">
          <List items={ins.highlights} mark="+" tone="text-good-text" />
        </Card>
        <Card title="Punti negativi">
          <List items={ins.lowlights} mark="−" tone="text-critical-text" />
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Rischi specifici" hint="Quelli distintivi o in peggioramento, non l'elenco standard">
          <Risks items={ins.risks} docId={ins.id} empty="Nessun rischio specifico rilevato." />
        </Card>
        <Card title="Segnali contabili" hint="Cambi di principi, voci una tantum, rettifiche, rilievi dei revisori">
          <Risks items={ins.accountingFlags} docId={ins.id} empty="Nessun segnale contabile rilevato nel documento." />
          {ins.nonGaapAdjustments.length > 0 && (
            <div className="mt-4 pt-3 border-t border-line">
              <div className="text-xs font-medium text-ink-2 mb-1.5">Rettifiche non-GAAP</div>
              <List items={ins.nonGaapAdjustments} mark="·" tone="text-muted" />
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Modello di business"><p className="text-sm">{ins.businessModel}</p></Card>
        <Card title="Posizione competitiva"><p className="text-sm">{ins.competitivePosition}</p></Card>
        <Card title="Allocazione del capitale"><p className="text-sm">{ins.capitalAllocation}</p></Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Citazioni chiave">
          {ins.keyQuotes.length ? (
            <ul className="space-y-4">
              {ins.keyQuotes.map((q, i) => (
                <li key={i}>
                  <blockquote className="border-l-2 border-axis pl-3 text-sm italic">“{q.text}”</blockquote>
                  <div className="text-sm text-ink-2 mt-1 pl-3.5">
                    {q.why} <SourceLink source={src(q.page)} highlight={q.text.slice(0, 40)}>{q.page ? `p. ${q.page}` : "apri"}</SourceLink>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">Nessuna citazione selezionata.</p>
          )}
        </Card>
        <Card title="Domande aperte" hint="Ciò a cui il documento non risponde" action={<Button size="sm" onClick={() => setTab("chat")}>Chiedi ai documenti →</Button>}>
          <List items={ins.openQuestions} mark="?" tone="text-accent-ink" />
          <p className="text-xs text-ink-2 mt-4 pt-3 border-t border-line">Tono: {ins.managementTone.rationale}</p>
        </Card>
      </div>
    </div>
  );
}

function List({ items, mark, tone }: { items: string[]; mark: string; tone: string }) {
  if (!items.length) return <p className="text-sm text-ink-2">Nessun elemento.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5">
          <span className={`${tone} font-semibold w-3 shrink-0 text-center`} aria-hidden>{mark}</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Risks({ items, docId, empty }: { items: InsightRisk[]; docId: string; empty: string }) {
  if (!items.length) return <p className="text-sm text-ink-2">{empty}</p>;
  return (
    <ul className="divide-y divide-line -my-2">
      {items.map((r, i) => (
        <li key={i} className="py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={r.severity === "alta" ? "bad" : r.severity === "media" ? "warn" : "neutral"}>{r.severity === "alta" ? "▲ " : ""}{r.severity}</Badge>
            <span className="font-medium text-sm">{r.title}</span>
            {r.page ? <SourceLink source={{ docId, page: r.page }}>p. {r.page}</SourceLink> : null}
          </div>
          <div className="text-sm text-ink-2 mt-1">{r.detail}</div>
        </li>
      ))}
    </ul>
  );
}
