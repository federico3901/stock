"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card, Empty, ErrorBox, Spinner, cx } from "@/components/ui";
import { errMsg, useApi } from "@/lib/client";
import { DASH, fmtMoney, fmtPct, fmtX } from "@/lib/format";
import type { MetricValues } from "@/lib/analysis/metrics";
import type { Multiples } from "@/lib/analysis/valuation";
import type { Company } from "@/lib/types";

interface Row {
  company: Company;
  snapshotLabel?: string;
  revenue?: number;
  metrics: MetricValues;
  multiples: Multiples;
}

type Fmt = "pct" | "x" | "money";
interface Line {
  label: string;
  get: (r: Row) => number | undefined;
  fmt: Fmt;
  /** true = più alto è meglio; false = più basso è meglio */
  better?: boolean;
}

const SECTIONS: { title: string; lines: Line[] }[] = [
  {
    title: "Dimensione",
    lines: [
      { label: "Capitalizzazione", get: (r) => r.multiples.marketCap, fmt: "money" },
      { label: "Ricavi", get: (r) => r.revenue, fmt: "money" },
    ],
  },
  {
    title: "Crescita e redditività (ultimo esercizio)",
    lines: [
      { label: "Crescita ricavi", get: (r) => r.metrics.revenue_growth, fmt: "pct", better: true },
      { label: "Margine lordo", get: (r) => r.metrics.gross_margin, fmt: "pct", better: true },
      { label: "Margine operativo", get: (r) => r.metrics.operating_margin, fmt: "pct", better: true },
      { label: "Margine FCF", get: (r) => r.metrics.fcf_margin, fmt: "pct", better: true },
      { label: "ROIC", get: (r) => r.metrics.roic, fmt: "pct", better: true },
      { label: "ROE", get: (r) => r.metrics.roe, fmt: "pct", better: true },
    ],
  },
  {
    title: "Qualità e solidità",
    lines: [
      { label: "Conversione FCF / utile", get: (r) => r.metrics.fcf_conversion, fmt: "pct", better: true },
      { label: "SBC / ricavi", get: (r) => r.metrics.sbc_pct, fmt: "pct", better: false },
      { label: "Variazione n. azioni", get: (r) => r.metrics.share_count_change, fmt: "pct", better: false },
      { label: "Debito netto / EBITDA", get: (r) => r.metrics.net_debt_to_ebitda, fmt: "x", better: false },
      { label: "Copertura interessi", get: (r) => r.metrics.interest_coverage, fmt: "x", better: true },
    ],
  },
  {
    title: "Valutazione (al prezzo inserito)",
    lines: [
      { label: "P/E", get: (r) => r.multiples.pe, fmt: "x", better: false },
      { label: "EV/EBITDA", get: (r) => r.multiples.evEbitda, fmt: "x", better: false },
      { label: "EV/Ricavi", get: (r) => r.multiples.evSales, fmt: "x", better: false },
      { label: "P/FCF", get: (r) => r.multiples.pFcf, fmt: "x", better: false },
      { label: "FCF yield", get: (r) => r.multiples.fcfYield, fmt: "pct", better: true },
      { label: "FCF yield al netto di SBC", get: (r) => r.multiples.fcfYieldAfterSbc, fmt: "pct", better: true },
      { label: "Rendimento agli azionisti", get: (r) => r.multiples.shareholderYield, fmt: "pct", better: true },
    ],
  },
];

const f = (v: number | undefined, fmt: Fmt) => (v === undefined ? DASH : fmt === "pct" ? fmtPct(v) : fmt === "x" ? fmtX(v) : fmtMoney(v));

export default function Compare() {
  const { data, error, isLoading } = useApi<{ companies: Row[] }>("/api/companies");
  const all = useMemo(() => (data?.companies ?? []).filter((r) => r.revenue !== undefined), [data]);
  const [hidden, setHidden] = useState<string[]>([]);
  const rows = all.filter((r) => !hidden.includes(r.company.id));

  if (isLoading) return <div className="text-sm text-ink-2"><Spinner /> Caricamento…</div>;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Confronta aziende</h1>
        <p className="text-sm text-ink-2 mt-0.5">Le aziende che segui, fianco a fianco. Il valore migliore di ogni riga è evidenziato.</p>
      </div>
      <ErrorBox>{error ? errMsg(error) : ""}</ErrorBox>
      {all.length < 2 ? (
        <Empty title="Servono almeno due aziende con dati di bilancio">Aggiungi un&apos;altra azienda e carica i suoi documenti per confrontarle.</Empty>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {all.map((r) => {
              const on = !hidden.includes(r.company.id);
              return (
                <button
                  key={r.company.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setHidden((h) => (on ? [...h, r.company.id] : h.filter((x) => x !== r.company.id)))}
                  className={cx("rounded-full border px-3 py-1 text-sm", on ? "border-accent bg-accent-wash text-accent-ink" : "border-edge text-ink-2")}
                >
                  {on ? "✓ " : ""}{r.company.ticker}
                </button>
              );
            })}
          </div>
          <Card pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm num">
                <thead>
                  <tr className="border-b border-line [&>th]:px-4 [&>th]:py-2.5 text-right">
                    <th className="text-left text-xs font-medium text-ink-2 min-w-56">Metrica</th>
                    {rows.map((r) => (
                      <th key={r.company.id} className="font-semibold whitespace-nowrap">
                        <Link href={`/c/${r.company.id}`} className="hover:underline">{r.company.ticker}</Link>
                        <div className="text-[11px] font-normal text-muted">{r.snapshotLabel}{r.company.currency ? ` · ${r.company.currency}` : ""}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SECTIONS.map((s) => [
                    <tr key={s.title}>
                      <td colSpan={rows.length + 1} className="bg-surface-2 px-4 py-1.5 text-xs font-semibold text-ink-2 border-b border-line">{s.title}</td>
                    </tr>,
                    ...s.lines.map((line) => {
                      const vals = rows.map((r) => line.get(r));
                      const defined = vals.filter((v): v is number => v !== undefined);
                      const best = line.better === undefined || defined.length < 2 ? undefined : line.better ? Math.max(...defined) : Math.min(...defined);
                      return (
                        <tr key={line.label} className="border-b border-line last:border-0">
                          <td className="px-4 py-1.5 text-left">{line.label}</td>
                          {vals.map((v, i) => (
                            <td key={i} className={cx("px-4 py-1.5 text-right whitespace-nowrap", v !== undefined && v === best && "font-semibold")}>
                              {f(v, line.fmt)}
                              {v !== undefined && v === best && <span className="ml-1.5"><Badge tone="good">migliore</Badge></span>}
                            </td>
                          ))}
                        </tr>
                      );
                    }),
                  ])}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-xs text-muted">Le dimensioni sono nella valuta di bilancio di ciascuna azienda e non sono convertite. I multipli richiedono il prezzo, inserito nella pagina dell&apos;azienda.</p>
        </>
      )}
    </div>
  );
}
