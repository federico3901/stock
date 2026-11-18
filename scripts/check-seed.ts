// Controlli sui dati distribuiti: quadrature contabili e panoramica per azienda.
// Uso: npx tsx scripts/check-seed.ts
import { coherenceChecks } from "../src/lib/analysis/quality";
import { analyze } from "../src/lib/analysis/summary";
import type { CompanyBundle } from "../src/lib/repo";
import data from "../src/seed/data/index.json";

type Rec = { collection: string; id: string; companyId: string | null; data: Record<string, unknown> };
const recs = data as Rec[];
const of = (c: string, id: string) => recs.filter((r) => r.collection === c && r.companyId === id).map((r) => r.data);
let failures = 0;

for (const c of recs.filter((r) => r.collection === "companies")) {
  const id = c.id;
  const bundle = {
    company: c.data, documents: of("documents", id), periods: of("periods", id), custom: of("custom_metrics", id),
    guidance: of("guidance", id), insights: of("insights", id), notes: of("notes", id), valuation: null, checks: of("thesis_checks", id),
  } as unknown as CompanyBundle;
  const a = analyze(bundle);
  const bad: string[] = [];
  for (const p of bundle.periods) {
    for (const k of coherenceChecks(p.values)) if (!k.ok) bad.push(`${p.fiscalPeriod} ${p.fiscalYear} ${k.label}: ${k.detail}`);
  }
  // i quattro trimestri devono ricomporre l'esercizio
  for (const fy of a.annual) {
    const qs = bundle.periods.filter((p) => p.fiscalYear === fy.fiscalYear && /^Q[1-4]$/.test(p.fiscalPeriod));
    if (!qs.length) continue;
    for (const k of ["revenue", "operating_income", "net_income", "cfo", "capex"] as const) {
      const vals = qs.map((q) => q.values[k]);
      const tot = fy.values[k];
      if (tot === undefined) continue;
      if (qs.length < 4 || vals.some((v) => v === undefined)) { bad.push(`FY ${fy.fiscalYear} ${k}: trimestri incompleti (${vals.filter((v) => v !== undefined).length}/4)`); continue; }
      const sum = (vals as number[]).reduce((x, y) => x + y, 0);
      if (Math.abs(sum - tot) > Math.abs(tot) * 0.02 + 2e6) bad.push(`FY ${fy.fiscalYear} ${k}: somma trimestri ${(sum / 1e6).toFixed(0)} vs esercizio ${(tot / 1e6).toFixed(0)}`);
    }
  }
  failures += bad.length;
  const m = a.snapMetrics ?? {};
  const pct = (v?: number) => (v === undefined ? "n.d." : (v * 100).toFixed(1) + "%");
  console.log(`\n${c.data.ticker} — ${c.data.name}`);
  console.log(`  esercizi ${a.annual.map((p) => p.fiscalYear).join(", ")} · trimestri ${a.quarters.length} · a oggi: ${a.snapshot?.label}`);
  console.log(`  ricavi ${((a.snapshot?.values.revenue ?? 0) / 1e9).toFixed(2)} mld · crescita ${pct(m.revenue_growth)} · marg. op. ${pct(m.operating_margin)} · ROIC ${pct(m.roic)} · prezzo ${c.data.price ?? "n.d."}`);
  console.log(`  guidance ${bundle.guidance.length} (verificabili ${a.guidanceEvals.filter((e) => e.actual !== undefined).length}) · segmenti/KPI ${bundle.custom.length} · analisi ${bundle.insights.length} · segnali ${a.flags.length}`);
  console.log(bad.length ? `  ${bad.length} controlli falliti:\n    ` + bad.slice(0, 40).join("\n    ") : "  quadrature: tutte superate");
}
console.log(`\nTotale controlli falliti: ${failures}`);
