import { notFound, route } from "@/lib/api";
import * as repo from "@/lib/repo";
import { FIELDS, STATEMENT_LABELS } from "@/lib/fields";
import { annualSeries, periodLabel, quarterlySeries } from "@/lib/analysis/periods";
import { METRICS, computeSeriesMetrics } from "@/lib/analysis/metrics";

type Ctx = { params: Promise<{ id: string }> };

const cell = (v: string | number | undefined) => {
  if (v === undefined) return "";
  if (typeof v === "number") return String(v).replace(".", ",");
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/** Esporta bilanci e metriche in CSV (separatore ";", decimali con virgola: si apre direttamente in Excel italiano). */
export const GET = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const company = await repo.getCompany(id);
  if (!company) throw notFound("Azienda");
  const quarterly = new URL(req.url).searchParams.get("frequenza") === "trimestrale";
  const periods = await repo.listPeriods(id);
  const series = quarterly ? quarterlySeries(periods) : annualSeries(periods);
  const metrics = computeSeriesMetrics(series, { months: quarterly ? 3 : 12 });
  const rows: (string | number | undefined)[][] = [];
  rows.push([`${company.name} (${company.ticker})`, ...series.map(periodLabel)]);
  rows.push(["Chiusura periodo", ...series.map((p) => p.periodEnd)]);
  let section = "";
  for (const f of FIELDS) {
    if (!series.some((p) => p.values[f.key] !== undefined)) continue;
    if (STATEMENT_LABELS[f.statement] !== section) {
      section = STATEMENT_LABELS[f.statement];
      rows.push([]);
      rows.push([section.toUpperCase() + (company.currency ? ` (${company.currency}, unità)` : "")]);
    }
    rows.push([f.label, ...series.map((p) => p.values[f.key])]);
  }
  rows.push([]);
  rows.push(["METRICHE"]);
  for (const m of METRICS) {
    if (!metrics.some((x) => x[m.key] !== undefined)) continue;
    rows.push([`${m.label}${m.format === "pct" ? " (frazione)" : ""}`, ...metrics.map((x) => x[m.key])]);
  }
  const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${company.ticker}-${quarterly ? "trimestrale" : "annuale"}.csv"`,
    },
  });
});
