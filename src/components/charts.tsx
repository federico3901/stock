"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMetric, fmtMoney, fmtNum, fmtPct } from "@/lib/format";

export type ChartFormat = "money" | "pct" | "x" | "num" | "days" | "per_share";

export interface SeriesDef {
  key: string;
  label: string;
}

type Row = { label: string } & Record<string, number | string | null | undefined>;

const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

const fmt = (v: number | undefined | null, f: ChartFormat) => (f === "money" ? fmtMoney(v) : fmtMetric(v, f));
const tick = (v: number, f: ChartFormat, fine = false) =>
  (f === "money" ? fmtMoney(v, "", Math.abs(v) >= 1e9 && Math.abs(v) < 1e10 ? 1 : 0) : f === "pct" ? fmtPct(v, fine ? 1 : 0) : f === "x" ? fmtNum(v, fine ? 2 : 1) + "x" : fmtNum(v, Math.abs(v) < 10 ? 1 : 0)).replace(/ /g, "\u00a0");

/** Se l'escursione dei dati è piccola servono più decimali sull'asse, altrimenti le tacche si ripetono. */
function isFine(data: Row[], series: SeriesDef[], f: ChartFormat): boolean {
  const vals = data.flatMap((d) => series.map((s) => d[s.key])).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (vals.length < 2) return false;
  const span = Math.max(...vals) - Math.min(...vals);
  return f === "pct" ? span < 0.04 : f === "x" ? span < 0.4 : false;
}

function Tip({ active, payload, label, series, format }: { active?: boolean; payload?: { dataKey?: string | number; value?: number | null; color?: string }[]; label?: string; series: SeriesDef[]; format: ChartFormat }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-edge bg-surface px-2.5 py-1.5 shadow-md text-xs">
      <div className="font-medium mb-0.5">{label}</div>
      {payload.map((p, i) => {
        const s = series.find((x) => x.key === p.dataKey);
        return (
          <div key={i} className="flex items-center gap-1.5 num">
            <span className="size-2 rounded-sm shrink-0" style={{ background: COLORS[series.findIndex((x) => x.key === p.dataKey) % COLORS.length] }} />
            {series.length > 1 && <span className="text-ink-2">{s?.label}</span>}
            <span className="font-medium ml-auto pl-2">{fmt(p.value, format)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Legend({ series }: { series: SeriesDef[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2 mb-1">
      {series.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

const axisProps = { tick: { fill: "var(--muted)", fontSize: 11 }, tickLine: false } as const;

function Frame({ title, series, height, empty, children }: { title?: string; series: SeriesDef[]; height: number; empty: boolean; children: React.ReactElement }) {
  return (
    <figure className="min-w-0">
      {title && <figcaption className="text-xs font-medium text-ink-2 mb-1">{title}</figcaption>}
      <Legend series={series} />
      {empty ? (
        <div className="flex items-center justify-center text-xs text-muted border border-dashed border-line rounded-md" style={{ height }}>
          Dati non disponibili
        </div>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

const hasData = (data: Row[], series: SeriesDef[]) => data.some((d) => series.some((s) => typeof d[s.key] === "number"));

/** Barre: per grandezze (ricavi, utili, flussi). Una serie = niente legenda, il titolo dice cosa si guarda. */
export function Bars({ data, series, format = "money", title, height = 180 }: { data: Row[]; series: SeriesDef[]; format?: ChartFormat; title?: string; height?: number }) {
  const single = series.length === 1;
  return (
    <Frame title={title} series={series} height={height} empty={!hasData(data, series)}>
      <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%" barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="label" {...axisProps} axisLine={{ stroke: "var(--axis)" }} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axisProps} axisLine={false} width={58} tickFormatter={(v: number) => tick(v, format)} />
        <ReferenceLine y={0} stroke="var(--axis)" />
        <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip series={series} format={format} />} isAnimationActive={false} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} fill={COLORS[i % COLORS.length]} maxBarSize={single ? 28 : 16} isAnimationActive={false} radius={[3, 3, 0, 0]}>
            {single && data.map((d, j) => <Cell key={j} radius={(typeof d[s.key] === "number" && (d[s.key] as number) < 0 ? [0, 0, 3, 3] : [3, 3, 0, 0]) as never} />)}
          </Bar>
        ))}
      </BarChart>
    </Frame>
  );
}

/** Linee: per rapporti e andamenti nel tempo (margini, rendimenti, crescite). */
export function Lines({ data, series, format = "pct", title, height = 180, zero }: { data: Row[]; series: SeriesDef[]; format?: ChartFormat; title?: string; height?: number; zero?: boolean }) {
  return (
    <Frame title={title} series={series} height={height} empty={!hasData(data, series)}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="label" {...axisProps} axisLine={{ stroke: "var(--axis)" }} interval="preserveStartEnd" minTickGap={8} padding={{ left: 12, right: 12 }} />
        <YAxis {...axisProps} axisLine={false} width={50} tickFormatter={(v: number) => tick(v, format, isFine(data, series, format))} domain={zero ? [0, "auto"] : ["auto", "auto"]} />
        <ReferenceLine y={0} stroke="var(--axis)" />
        <Tooltip cursor={{ stroke: "var(--axis)" }} content={<Tip series={series} format={format} />} isAnimationActive={false} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="linear"
            dataKey={s.key}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3, fill: COLORS[i % COLORS.length], stroke: "var(--surface)", strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </Frame>
  );
}

/** Mini-andamento senza assi, per le tabelle. */
export function Spark({ values, width = 72, height = 22 }: { values: (number | undefined)[]; width?: number; height?: number }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => typeof p.v === "number" && Number.isFinite(p.v));
  if (pts.length < 2) return <span className="text-muted">–</span>;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => 2 + (i / (values.length - 1)) * (width - 4);
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label="Andamento" className="inline-block align-middle">
      <polyline fill="none" stroke="var(--series-1)" strokeWidth={1.5} strokeLinejoin="round" points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} />
      <circle cx={x(last.i)} cy={y(last.v)} r={2.2} fill="var(--series-1)" />
    </svg>
  );
}
