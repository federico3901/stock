"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Badge, Button, ErrorBox, Input, Spinner, cx } from "@/components/ui";
import { DocViewerProvider } from "@/components/company/DocViewer";
import { Overview } from "@/components/company/Overview";
import { Documents } from "@/components/company/Documents";
import { Financials } from "@/components/company/Financials";
import { MetricsTab } from "@/components/company/Metrics";
import { GuidanceTab } from "@/components/company/Guidance";
import { ValuationTab } from "@/components/company/Valuation";
import { QualityTab } from "@/components/company/Quality";
import { InsightsTab } from "@/components/company/Insights";
import { DiffTab } from "@/components/company/Diff";
import { ChatTab } from "@/components/company/Chat";
import { NotesTab } from "@/components/company/Notes";
import { analyze } from "@/lib/analysis/summary";
import { api, errMsg, useCompany, useStatus } from "@/lib/client";
import { fmtDate, currencySymbol } from "@/lib/format";

const TABS = [
  { key: "panoramica", label: "Panoramica" },
  { key: "documenti", label: "Documenti" },
  { key: "bilanci", label: "Bilanci" },
  { key: "metriche", label: "Metriche" },
  { key: "guidance", label: "Guidance" },
  { key: "valutazione", label: "Valutazione" },
  { key: "qualita", label: "Qualità e segnali" },
  { key: "analisi", label: "Analisi qualitativa" },
  { key: "confronto", label: "Cosa è cambiato" },
  { key: "chat", label: "Chiedi ai documenti" },
  { key: "note", label: "Tesi, note e memo" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

export default function Page() {
  return (
    <Suspense fallback={<div className="text-ink-2 text-sm"><Spinner /> Caricamento…</div>}>
      <CompanyPage />
    </Suspense>
  );
}

function CompanyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const tab = (TABS.find((t) => t.key === search.get("tab"))?.key ?? "panoramica") as TabKey;
  const { data, error, isLoading, mutate } = useCompany(id);
  const analysis = useMemo(() => (data ? analyze(data) : null), [data]);
  const setTab = (t: string) => router.replace(`/c/${id}?tab=${t}`, { scroll: false });
  const { data: status } = useStatus();
  // senza modello la chat non esiste; il confronto tra filing serve solo se c'è del testo caricato
  const hasText = data?.documents.some((d) => d.pageCount > 0) ?? false;
  const tabs = TABS.filter((t) => (t.key === "chat" ? !!status?.llm : t.key === "confronto" ? hasText : true));

  if (isLoading) return <div className="text-ink-2 text-sm"><Spinner /> Caricamento…</div>;
  if (error || !data || !analysis)
    return (
      <div className="space-y-3">
        <ErrorBox>{error ? errMsg(error) : "Azienda non trovata."}</ErrorBox>
        <Link href="/" className="text-sm underline">Torna all&apos;elenco</Link>
      </div>
    );
  const { company } = data;
  const props = { bundle: data, analysis, refresh: () => mutate(), setTab };

  return (
    <DocViewerProvider documents={data.documents}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-ink-2">
              <Link href="/" className="hover:underline">Aziende</Link> /
            </div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2 flex-wrap">
              {company.name}
              <span className="text-ink-2 font-normal text-base">{company.ticker}</span>
              {company.demo && <Badge tone="accent" title="Dati inventati a scopo dimostrativo">demo</Badge>}
            </h1>
            <div className="text-xs text-ink-2 mt-0.5">
              {[company.sector, company.currency && `Bilancio in ${company.currency}`, analysis.snapshot && `Dati fino a ${fmtDate(analysis.snapshot.periodEnd)}`].filter(Boolean).join(" · ")}
            </div>
            {company.dataSource && (
              <div className="text-xs text-muted mt-0.5">
                Dati già caricati{company.dataAsOf ? `, aggiornati al ${fmtDate(company.dataAsOf)}` : ""}. {company.dataSource}.
              </div>
            )}
          </div>
          <PriceEditor id={id} price={company.price} priceDate={company.priceDate} currency={company.currency} onSaved={() => mutate()} />
        </div>

        <nav className="flex gap-0.5 overflow-x-auto border-b border-line -mx-4 px-4 sm:mx-0 sm:px-0 no-print" aria-label="Sezioni">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={t.key === tab ? "page" : undefined}
              className={cx(
                "px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
                t.key === tab ? "border-accent text-ink font-medium" : "border-transparent text-ink-2 hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "panoramica" && <Overview {...props} />}
        {tab === "documenti" && <Documents {...props} />}
        {tab === "bilanci" && <Financials {...props} />}
        {tab === "metriche" && <MetricsTab {...props} />}
        {tab === "guidance" && <GuidanceTab {...props} />}
        {tab === "valutazione" && <ValuationTab {...props} />}
        {tab === "qualita" && <QualityTab {...props} />}
        {tab === "analisi" && <InsightsTab {...props} />}
        {tab === "confronto" && <DiffTab {...props} />}
        {tab === "chat" && <ChatTab {...props} />}
        {tab === "note" && <NotesTab {...props} />}
      </div>
    </DocViewerProvider>
  );
}

function PriceEditor({ id, price, priceDate, currency, onSaved }: { id: string; price?: number; priceDate?: string; currency: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(value.replace(",", "."));
    if (!(n > 0)) return setErr("Prezzo non valido");
    setBusy(true);
    try {
      await api(`/api/companies/${id}`, { method: "PATCH", json: { price: n } });
      setEditing(false);
      setErr("");
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  if (editing)
    return (
      <form onSubmit={save} className="flex items-center gap-2 no-print">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Prezzo per azione" inputMode="decimal" className="w-36" autoFocus aria-label="Prezzo per azione" />
        <Button variant="primary" type="submit" disabled={busy}>Salva</Button>
        <Button onClick={() => setEditing(false)}>Annulla</Button>
        {err && <span className="text-xs text-critical-text">{err}</span>}
      </form>
    );
  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <div className="text-xs text-ink-2">Prezzo {priceDate ? `al ${fmtDate(priceDate)}` : ""}</div>
        <div className="text-lg font-semibold num leading-tight">{price ? `${price.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol(currency)}` : "–"}</div>
      </div>
      <Button size="sm" className="no-print" onClick={() => { setValue(price ? String(price).replace(".", ",") : ""); setEditing(true); }}>
        {price ? "Aggiorna" : "Inserisci prezzo"}
      </Button>
    </div>
  );
}
