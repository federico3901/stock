import type { FinancialPeriod } from "../types";
import { derive, div, growth } from "./metrics";
import { yearAgo } from "./periods";

export interface QuarterRow {
  label: string;
  kind: "money" | "pct" | "per_share";
  value?: number;
  /** variazione su stesso trimestre dell'anno prima: relativa per importi, in punti per i margini */
  yoy?: number;
  /** variazione sul trimestre precedente */
  qoq?: number;
  higherIsBetter: boolean;
}

export interface QuarterBrief {
  label: string;
  compareLabel?: string;
  previousLabel?: string;
  rows: QuarterRow[];
  /** la crescita dei ricavi a/a del trimestre meno quella del trimestre precedente: >0 accelera */
  growthChange?: number;
}

/** L'ultimo trimestre a colpo d'occhio: contro lo stesso trimestre dell'anno prima e contro il precedente. */
export function quarterBrief(quarters: FinancialPeriod[]): QuarterBrief | null {
  const q = quarters[quarters.length - 1];
  if (!q) return null;
  const y = yearAgo(quarters, q);
  const p = quarters[quarters.length - 2];
  const py = p ? yearAgo(quarters, p) : undefined;
  const lab = (x: FinancialPeriod) => `${x.fiscalPeriod} ${x.fiscalYear}`;
  const money = (label: string, get: (v: FinancialPeriod["values"]) => number | undefined, kind: QuarterRow["kind"] = "money"): QuarterRow => ({
    label, kind, higherIsBetter: true,
    value: get(q.values),
    yoy: y ? growth(get(q.values), get(y.values)) : undefined,
    qoq: p ? growth(get(q.values), get(p.values)) : undefined,
  });
  const margin = (label: string, get: (v: FinancialPeriod["values"]) => number | undefined): QuarterRow => {
    const cur = get(q.values);
    const d = (o?: FinancialPeriod) => { const v = o ? get(o.values) : undefined; return cur !== undefined && v !== undefined ? cur - v : undefined; };
    return { label, kind: "pct", higherIsBetter: true, value: cur, yoy: d(y), qoq: d(p) };
  };
  const rows = [
    money("Ricavi", (v) => v.revenue),
    margin("Margine lordo", (v) => div(v.gross_profit, v.revenue)),
    margin("Margine operativo", (v) => div(v.operating_income, v.revenue)),
    money("Utile operativo", (v) => v.operating_income),
    money("EPS diluito", (v) => v.eps_diluted, "per_share"),
    money("Free cash flow", (v) => derive(v).fcf),
  ].filter((r) => r.value !== undefined);
  if (!rows.length) return null;
  const gNow = y ? growth(q.values.revenue, y.values.revenue) : undefined;
  const gPrev = p && py ? growth(p.values.revenue, py.values.revenue) : undefined;
  return {
    label: lab(q), compareLabel: y ? lab(y) : undefined, previousLabel: p ? lab(p) : undefined, rows,
    growthChange: gNow !== undefined && gPrev !== undefined ? gNow - gPrev : undefined,
  };
}
