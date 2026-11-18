"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, Empty, ErrorBox, InfoBox, Input, Label, Modal, Spinner } from "@/components/ui";
import { api, errMsg, useApi, useStatus } from "@/lib/client";
import { fmtDate, fmtMoney, fmtPct, fmtX } from "@/lib/format";
import type { MetricValues } from "@/lib/analysis/metrics";
import type { Multiples } from "@/lib/analysis/valuation";
import type { Company } from "@/lib/types";

interface Row {
  company: Company;
  documents: number;
  lastDocument?: string;
  snapshotLabel?: string;
  lastFiscalYear?: number;
  revenue?: number;
  metrics: MetricValues;
  multiples: Multiples;
}

export default function Home() {
  const { data, error, isLoading, mutate } = useApi<{ companies: Row[] }>("/api/companies");
  const { data: status } = useStatus();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadDemo = async () => {
    setBusy(true);
    setErr("");
    try {
      const { id } = await api<{ id: string }>("/api/demo", { method: "POST" });
      router.push(`/c/${id}`);
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  };

  const rows = data?.companies ?? [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Le tue aziende</h1>
          <p className="text-sm text-ink-2 mt-0.5">Carica i documenti di una società e ottieni bilanci, metriche, guidance e valutazione in un unico posto.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadDemo} disabled={busy}>{busy ? <Spinner /> : null} Carica azienda demo</Button>
          <Button variant="primary" onClick={() => setAdding(true)}>+ Nuova azienda</Button>
        </div>
      </div>

      {status && !status.llm && (
        <InfoBox tone="warn">
          Chiave API di Anthropic non configurata: puoi esplorare l&apos;azienda demo e inserire dati a mano, ma l&apos;estrazione automatica dai documenti, la chat e il memo
          richiedono <code className="font-mono text-xs">ANTHROPIC_API_KEY</code>. Vedi <Link href="/impostazioni" className="underline">Impostazioni</Link>.
        </InfoBox>
      )}
      <ErrorBox>{err || (error ? errMsg(error) : "")}</ErrorBox>

      {isLoading ? (
        <div className="text-ink-2 text-sm"><Spinner /> Caricamento…</div>
      ) : rows.length === 0 ? (
        <Empty
          title="Nessuna azienda ancora"
          action={
            <>
              <Button variant="primary" onClick={() => setAdding(true)}>+ Nuova azienda</Button>
              <Button onClick={loadDemo} disabled={busy}>Prova con l&apos;azienda demo</Button>
            </>
          }
        >
          Crea un&apos;azienda e carica i suoi 10-K, 10-Q e presentazioni. Oppure carica l&apos;azienda demo (inventata) per vedere subito tutte le funzioni.
        </Empty>
      ) : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm num">
              <thead>
                <tr className="text-xs text-ink-2 text-right border-b border-line [&>th]:font-medium [&>th]:px-3 [&>th]:py-2.5 [&>th]:whitespace-nowrap">
                  <th className="text-left">Azienda</th>
                  <th>Prezzo</th>
                  <th>Capitalizz.</th>
                  <th>Ricavi</th>
                  <th title="Crescita dei ricavi nell'ultimo esercizio">Crescita</th>
                  <th>Marg. operativo</th>
                  <th>ROIC</th>
                  <th>P/E</th>
                  <th>EV/EBITDA</th>
                  <th>FCF yield</th>
                  <th>Documenti</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.company.id} className="border-b border-line last:border-0 hover:bg-surface-2 cursor-pointer text-right [&>td]:px-3 [&>td]:py-2.5" onClick={() => router.push(`/c/${r.company.id}`)}>
                    <td className="text-left">
                      <Link href={`/c/${r.company.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {r.company.name}
                      </Link>
                      <div className="text-xs text-muted flex items-center gap-1.5">
                        {r.company.ticker}
                        {r.company.sector ? ` · ${r.company.sector}` : ""}
                        {r.company.demo && <Badge tone="accent">demo</Badge>}
                      </div>
                    </td>
                    <td>{r.company.price ? fmtMoney(r.company.price, r.company.currency, 2) : <span className="text-muted">da inserire</span>}</td>
                    <td>{fmtMoney(r.multiples.marketCap)}</td>
                    <td>
                      {fmtMoney(r.revenue)}
                      {r.snapshotLabel && <div className="text-[11px] text-muted">{r.snapshotLabel}</div>}
                    </td>
                    <td>{fmtPct(r.metrics.revenue_growth)}</td>
                    <td>{fmtPct(r.metrics.operating_margin)}</td>
                    <td>{fmtPct(r.metrics.roic)}</td>
                    <td>{fmtX(r.multiples.pe)}</td>
                    <td>{fmtX(r.multiples.evEbitda)}</td>
                    <td>{fmtPct(r.multiples.fcfYield)}</td>
                    <td>
                      {r.documents}
                      {r.lastDocument && <div className="text-[11px] text-muted">ultimo {fmtDate(r.lastDocument)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AddCompany open={adding} onClose={() => setAdding(false)} onCreated={(id) => { mutate(); router.push(`/c/${id}?tab=documenti`); }} />
    </div>
  );
}

function AddCompany({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const { company } = await api<{ company: Company }>("/api/companies", { json: { ticker, name } });
      setTicker("");
      setName("");
      onCreated(company.id);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Nuova azienda">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Label label="Ticker">
            <Input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="AAPL" autoFocus required />
          </Label>
          <Label label="Nome (facoltativo)" className="col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Apple Inc." />
          </Label>
        </div>
        <p className="text-xs text-ink-2">Valuta, settore e chiusura dell&apos;esercizio vengono riconosciuti dal primo documento caricato.</p>
        <ErrorBox>{err}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Annulla</Button>
          <Button variant="primary" type="submit" disabled={busy || !ticker.trim()}>{busy && <Spinner />} Crea e carica documenti</Button>
        </div>
      </form>
    </Modal>
  );
}
