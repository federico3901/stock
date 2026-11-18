"use client";

import { useMemo } from "react";
import { Bars, Lines } from "@/components/charts";
import { Badge, Card, Empty, Button, Stat, cx } from "@/components/ui";
import { derive } from "@/lib/analysis/metrics";
import { periodLabel } from "@/lib/analysis/periods";
import { dataGaps, takeaways } from "@/lib/analysis/summary";
import { fmtMoney, fmtPct, fmtX } from "@/lib/format";
import { GUIDANCE_METRIC_LABELS } from "@/lib/types";
import { fmtGuidanceRange } from "./Guidance";
import { QuarterCard, ThesisChecks } from "./Thesis";
import type { TabProps } from "./types";

export function Overview({ bundle, analysis: a, setTab, refresh }: TabProps) {
  const { company } = bundle;
  const cur = company.currency;
  const points = useMemo(() => takeaways(bundle, a), [bundle, a]);
  const gaps = useMemo(() => dataGaps(bundle, a), [bundle, a]);

  if (!a.snapshot) {
    return (
      <Empty title="Ancora nessun dato di bilancio" action={<Button variant="primary" onClick={() => setTab("documenti")}>Carica documenti</Button>}>
        Carica un 10-K o un 10-Q: i prospetti vengono letti e normalizzati automaticamente, e qui compariranno numeri chiave, grafici e conclusioni.
      </Empty>
    );
  }
  const s = a.snapshot.values;
  const m = a.snapMetrics ?? {};
  const mult = a.mult;
  const rows = a.annual.map((p, i) => ({
    label: periodLabel(p),
    revenue: p.values.revenue,
    operating_income: p.values.operating_income,
    net_income: p.values.net_income,
    fcf: derive(p.values).fcf,
    gross_margin: a.annualMetrics[i].gross_margin,
    operating_margin: a.annualMetrics[i].operating_margin,
    fcf_margin: a.annualMetrics[i].fcf_margin,
    roic: a.annualMetrics[i].roic,
    roe: a.annualMetrics[i].roe,
  }));
  if (a.snapshot.isTtm && a.snapMetrics) {
    rows.push({
      label: "TTM",
      revenue: s.revenue,
      operating_income: s.operating_income,
      net_income: s.net_income,
      fcf: derive(s).fcf,
      gross_margin: m.gross_margin,
      operating_margin: m.operating_margin,
      fcf_margin: m.fcf_margin,
      roic: m.roic,
      roe: m.roe,
    });
  }
  const latestInsight = [...bundle.insights].sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
  const docTitle = (id: string) => bundle.documents.find((d) => d.id === id)?.title;

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
          <Stat label="Capitalizzazione" value={fmtMoney(mult.marketCap, cur)} sub={mult.enterpriseValue !== undefined ? `EV ${fmtMoney(mult.enterpriseValue)}` : "inserisci il prezzo"} />
          <Stat label="P/E" value={fmtX(mult.pe)} sub={`EV/EBITDA ${fmtX(mult.evEbitda)}`} />
          <Stat label="FCF yield" value={fmtPct(mult.fcfYield)} sub={mult.fcfYieldAfterSbc !== undefined ? `${fmtPct(mult.fcfYieldAfterSbc)} al netto di SBC` : undefined} title="Free cash flow / capitalizzazione" />
          <Stat label={`Ricavi ${a.snapshot.label}`} value={fmtMoney(s.revenue, cur)} sub={m.revenue_growth !== undefined ? `${m.revenue_growth >= 0 ? "+" : ""}${fmtPct(m.revenue_growth)} a/a` : undefined} />
          <Stat label="Margine operativo" value={fmtPct(m.operating_margin)} sub={`lordo ${fmtPct(m.gross_margin)} · FCF ${fmtPct(m.fcf_margin)}`} />
          <Stat label="ROIC" value={fmtPct(m.roic)} sub={m.net_debt_to_ebitda !== undefined ? `debito netto ${fmtX(m.net_debt_to_ebitda)} EBITDA` : undefined} />
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Cosa dicono i numeri" hint="Conclusioni calcolate dai dati caricati, senza interpretazioni del modello" className="lg:col-span-2">
          {points.length ? (
            <ul className="space-y-2">
              {points.map((p, i) => (
                <li key={i} className="flex gap-2.5 text-sm">
                  <span
                    aria-hidden
                    className={cx("mt-1.5 size-2 rounded-full shrink-0", p.tone === "good" ? "bg-good" : p.tone === "bad" ? "bg-critical" : "bg-axis")}
                  />
                  <span>
                    <span className="sr-only">{p.tone === "good" ? "Positivo: " : p.tone === "bad" ? "Negativo: " : ""}</span>
                    {p.text}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">Servono almeno due esercizi per trarre conclusioni.</p>
          )}
        </Card>
        <Card title="Da fare" hint="Per completare l'analisi">
          {gaps.length ? (
            <ul className="space-y-2 text-sm">
              {gaps.map((g, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted" aria-hidden>○</span>
                  {g.tab ? (
                    <button type="button" className="text-left hover:underline" onClick={() => setTab(g.tab!)}>{g.text}</button>
                  ) : (
                    <span>{g.text}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">Tutto a posto: i dati sono completi.</p>
          )}
        </Card>
      </div>

      <div className={cx("grid gap-4", a.quarter && "lg:grid-cols-2")}>
        {a.quarter && <QuarterCard q={a.quarter} currency={cur} />}
        <ThesisChecks companyId={company.id} currency={cur} evals={a.checks} snapshotLabel={a.snapshot.label} refresh={refresh} compact onManage={() => setTab("note")} />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card><Bars title="Ricavi" data={rows} series={[{ key: "revenue", label: "Ricavi" }]} /></Card>
        <Card><Bars title="Utile operativo e free cash flow" data={rows} series={[{ key: "operating_income", label: "Utile operativo" }, { key: "fcf", label: "Free cash flow" }]} /></Card>
        <Card><Lines title="Margini" data={rows} series={[{ key: "gross_margin", label: "Lordo" }, { key: "operating_margin", label: "Operativo" }, { key: "fcf_margin", label: "FCF" }]} /></Card>
        <Card><Lines title="Rendimento del capitale" data={rows} series={[{ key: "roic", label: "ROIC" }, { key: "roe", label: "ROE" }]} /></Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Segnali di attenzione" action={<Button size="sm" variant="ghost" onClick={() => setTab("qualita")}>Tutti →</Button>}>
          {a.flags.length ? (
            <ul className="space-y-2.5">
              {a.flags.slice(0, 4).map((f) => (
                <li key={f.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={f.severity === "alta" ? "bad" : f.severity === "media" ? "warn" : "neutral"}>{f.severity === "alta" ? "▲ alta" : f.severity === "media" ? "● media" : "nota"}</Badge>
                    <span className="font-medium">{f.title}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">{a.annual.length < 2 ? "Servono almeno due esercizi." : "Nessun segnale automatico negli ultimi due esercizi."}</p>
          )}
        </Card>
        <Card title="Guidance in corso" action={<Button size="sm" variant="ghost" onClick={() => setTab("guidance")}>Dettaglio →</Button>}>
          {a.open.filter((e) => !e.item.qualitative).length ? (
            <ul className="space-y-2 text-sm">
              {a.open.filter((e) => !e.item.qualitative).slice(0, 5).map((e) => (
                <li key={e.item.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {e.item.label || GUIDANCE_METRIC_LABELS[e.item.metric]} <span className="text-muted">{periodLabel({ fiscalYear: e.item.targetFiscalYear, fiscalPeriod: e.item.targetPeriod })}</span>
                  </span>
                  <span className="num whitespace-nowrap font-medium">
                    {fmtGuidanceRange(e.item, cur)}
                    {e.revision === "alzata" && <span className="text-good-text ml-1" title="Guidance alzata">▲</span>}
                    {e.revision === "abbassata" && <span className="text-critical-text ml-1" title="Guidance abbassata">▼</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">Nessuna guidance aperta.</p>
          )}
          {a.cred.evaluated > 0 && <p className="text-xs text-ink-2 mt-3 pt-3 border-t border-line">{a.cred.verdict}</p>}
        </Card>
        <Card title="In sintesi" hint={latestInsight ? docTitle(latestInsight.id) : undefined} action={<Button size="sm" variant="ghost" onClick={() => setTab("analisi")}>Leggi →</Button>}>
          {latestInsight ? <p className="text-sm">{latestInsight.summary}</p> : <p className="text-sm text-ink-2">L&apos;analisi qualitativa compare dopo aver analizzato un documento.</p>}
        </Card>
      </div>
    </div>
  );
}
