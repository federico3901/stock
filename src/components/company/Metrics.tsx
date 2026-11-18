"use client";

import { useState } from "react";
import { Bars, Lines, Spark } from "@/components/charts";
import { Card, Empty, Hint, Segmented, Stat, cx } from "@/components/ui";
import { METRICS, METRIC_MAP, cagr, derive, type MetricGroup, type MetricKey } from "@/lib/analysis/metrics";
import { periodLabel } from "@/lib/analysis/periods";
import { DASH, fmtMetric, fmtPct, fmtX } from "@/lib/format";
import type { TabProps } from "./types";

const GROUPS: MetricGroup[] = ["Crescita", "Redditività", "Rendimento del capitale", "Cassa", "Solidità finanziaria", "Efficienza", "Azionisti", "Per azione"];

export function MetricsTab({ bundle, analysis: a }: TabProps) {
  const [freq, setFreq] = useState<"annuale" | "trimestrale">("annuale");
  const [selected, setSelected] = useState<MetricKey>("roic");
  const cur = bundle.company.currency;
  const series = (freq === "annuale" ? a.annual : a.quarters).slice(-10);
  const metrics = (freq === "annuale" ? a.annualMetrics : a.quarterMetrics).slice(-10);

  if (!a.annual.length && !a.quarters.length) return <Empty title="Nessun dato">Le metriche vengono calcolate dai bilanci: carica un documento o inserisci i valori nella scheda Bilanci.</Empty>;

  const def = METRIC_MAP[selected];
  const chartData = series.map((p, i) => ({ label: periodLabel(p), v: metrics[i][selected] }));
  const n = a.annual.length - 1;
  const first = a.annual[0]?.values;
  const last = a.annual[n]?.values;
  const lastM = a.annualMetrics[n];

  return (
    <div className="space-y-4">
      {n >= 1 && first && last && (
        <Card title={`Crescita composta ${periodLabel(a.annual[0])} → ${periodLabel(a.annual[n])}`} hint={`CAGR su ${n} ${n === 1 ? "anno" : "anni"}`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
            <Stat label="Ricavi" value={fmtPct(cagr(first.revenue, last.revenue, n))} />
            <Stat label="Utile lordo" value={fmtPct(cagr(derive(first).grossProfit, derive(last).grossProfit, n))} />
            <Stat label="Utile operativo" value={fmtPct(cagr(first.operating_income, last.operating_income, n))} />
            <Stat label="EPS diluito" value={fmtPct(cagr(first.eps_diluted, last.eps_diluted, n))} />
            <Stat label="Free cash flow" value={fmtPct(cagr(derive(first).fcf, derive(last).fcf, n))} />
            <Stat label="Azioni diluite" value={fmtPct(cagr(first.shares_diluted, last.shares_diluted, n))} title="Negativo = l'azienda riduce il numero di azioni" />
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title={def.label} hint={def.description} action={<Segmented value={freq} onChange={setFreq} options={[{ value: "annuale", label: "Annuale" }, { value: "trimestrale", label: "Trimestrale" }]} />}>
          {def.format === "money" || def.format === "per_share" ? (
            <Bars data={chartData} series={[{ key: "v", label: def.label }]} format={def.format} height={220} />
          ) : (
            <Lines data={chartData} series={[{ key: "v", label: def.label }]} format={def.format} height={220} />
          )}
        </Card>
        <Card title="Scomposizione del ROE (DuPont)" hint={lastM ? periodLabel(a.annual[n]) : undefined}>
          {lastM?.roe !== undefined ? (
            <div className="space-y-3 text-sm">
              <DuPontRow label="Margine netto" value={fmtPct(lastM.net_margin)} note="quanto resta di ogni euro di ricavi" />
              <DuPontRow label="× Rotazione dell'attivo" value={fmtX(lastM.asset_turnover, 2)} note="ricavi generati per euro di attivo" />
              <DuPontRow label="× Leva finanziaria" value={fmtX(lastM.equity_multiplier, 2)} note="attivo per euro di patrimonio netto" />
              <div className="border-t border-line pt-3 flex items-baseline justify-between">
                <span className="font-semibold">= ROE</span>
                <span className="text-xl font-semibold num">{fmtPct(lastM.roe)}</span>
              </div>
              <p className="text-xs text-ink-2">
                Un ROE alto vale di più se viene da margini e rotazione che dalla leva.
                {lastM.equity_multiplier !== undefined && lastM.equity_multiplier > 3 ? " Qui la leva pesa molto." : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-2">Servono utile netto, attivo e patrimonio netto di almeno un esercizio.</p>
          )}
        </Card>
      </div>

      <Card title="Tutte le metriche" hint="Clic su una riga per vederla nel grafico. Passa il mouse sulla (i) per la definizione." pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm num border-separate border-spacing-0">
            <thead>
              <tr className="text-xs text-ink-2 [&>th]:font-medium [&>th]:px-3 [&>th]:py-2 [&>th]:border-b [&>th]:border-line">
                <th className="text-left sticky left-0 bg-surface z-10 min-w-64">Metrica</th>
                {series.map((p) => <th key={p.id} className="text-right whitespace-nowrap">{periodLabel(p)}</th>)}
                <th className="text-right">Andamento</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => {
                const rows = METRICS.filter((m) => m.group === g && metrics.some((x) => x[m.key] !== undefined));
                if (!rows.length) return null;
                return [
                  <tr key={g}>
                    <td colSpan={series.length + 2} className="sticky left-0 bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2 border-b border-line">{g}</td>
                  </tr>,
                  ...rows.map((m) => (
                    <tr key={m.key} onClick={() => setSelected(m.key)} className={cx("cursor-pointer hover:bg-surface-2", selected === m.key && "bg-accent-wash")}>
                      <td className={cx("text-left sticky left-0 z-10 px-3 py-1.5 border-b border-line", selected === m.key ? "bg-accent-wash" : "bg-surface")}>
                        {m.label}
                        <Hint text={m.description} />
                      </td>
                      {metrics.map((x, i) => {
                        const v = x[m.key];
                        const prev = i > 0 ? metrics[i - 1][m.key] : undefined;
                        const better = "higherIsBetter" in m && m.higherIsBetter !== undefined && v !== undefined && prev !== undefined && v !== prev ? (v > prev) === m.higherIsBetter : undefined;
                        return (
                          <td key={i} className="text-right px-3 py-1.5 border-b border-line whitespace-nowrap">
                            {v === undefined ? <span className="text-muted">{DASH}</span> : fmtMetric(v, m.format, cur)}
                            {better !== undefined && m.group !== "Crescita" && (
                              <span className={cx("ml-1 text-[10px]", better ? "text-good-text" : "text-critical-text")} title={better ? "In miglioramento sul periodo precedente" : "In peggioramento sul periodo precedente"}>
                                {v! > prev! ? "▲" : "▼"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-right px-3 py-1 border-b border-line"><Spark values={metrics.map((x) => x[m.key])} /></td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
        {freq === "trimestrale" && <p className="px-4 py-2 text-xs text-muted">Rendimenti e rotazioni trimestrali sono annualizzati; le crescite sono sullo stesso trimestre dell&apos;anno precedente.</p>}
      </Card>
    </div>
  );
}

function DuPontRow({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <div>{label}</div>
        <div className="text-xs text-muted">{note}</div>
      </div>
      <div className="font-semibold num">{value}</div>
    </div>
  );
}
