"use client";

import { Lines } from "@/components/charts";
import { Badge, Card, Empty, Hint, cx } from "@/components/ui";
import { accrualRatio } from "@/lib/analysis/quality";
import { periodLabel } from "@/lib/analysis/periods";
import { fmtNum, fmtPct } from "@/lib/format";
import { SourceLink } from "./DocViewer";
import type { TabProps } from "./types";

export function QualityTab({ bundle, analysis: a }: TabProps) {
  if (a.annual.length < 2) {
    return <Empty title="Servono almeno due esercizi">I punteggi di qualità e i segnali di attenzione confrontano l&apos;ultimo esercizio con il precedente. Carica un 10-K (ne contiene già due o tre).</Empty>;
  }
  const last = a.lastFy!;
  const rows = a.annual.map((p, i) => ({
    label: periodLabel(p),
    net_margin: a.annualMetrics[i].net_margin,
    fcf_margin: a.annualMetrics[i].fcf_margin,
    accruals: accrualRatio(p.values, a.annual[i - 1]?.values),
    dso: a.annualMetrics[i].dso,
    dio: a.annualMetrics[i].dio,
    dpo: a.annualMetrics[i].dpo,
    sbc_pct: a.annualMetrics[i].sbc_pct,
    share_count_change: a.annualMetrics[i].share_count_change,
  }));
  const accountingFlags = bundle.insights.flatMap((ins) => ins.accountingFlags.map((f) => ({ ...f, docId: ins.id })));

  return (
    <div className="space-y-4">
      <Card title="Segnali di attenzione" hint={`Regole automatiche sul confronto ${periodLabel(a.prevFy!)} → ${periodLabel(last)}. Non sono giudizi: sono le domande da porsi leggendo il bilancio.`}>
        {a.flags.length ? (
          <ul className="divide-y divide-line -my-2">
            {a.flags.map((f) => (
              <li key={f.id} className="py-2.5 flex gap-3">
                <div className="w-20 shrink-0 pt-0.5">
                  <Badge tone={f.severity === "alta" ? "bad" : f.severity === "media" ? "warn" : "neutral"}>{f.severity === "alta" ? "▲ alta" : f.severity === "media" ? "● media" : "nota"}</Badge>
                </div>
                <div>
                  <div className="font-medium text-sm">{f.title}</div>
                  <div className="text-sm text-ink-2">{f.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm"><Badge tone="good">✓</Badge> <span className="ml-1">Nessuno dei controlli automatici ha rilevato anomalie negli ultimi due esercizi.</span></p>
        )}
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title={<>Piotroski F-Score<Hint text="Nove criteri su redditività, leva, liquidità ed efficienza. 7-9 = fondamentali solidi e in miglioramento; 0-3 = deboli." /></>} hint={periodLabel(last)}>
          {a.pio && (
            <>
              <div className="flex items-baseline gap-2">
                <span className={cx("text-3xl font-semibold num", a.pio.score >= 7 ? "text-good-text" : a.pio.score <= 3 ? "text-critical-text" : "")}>{a.pio.score}</span>
                <span className="text-ink-2">su {a.pio.available}</span>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {a.pio.items.map((it) => (
                  <li key={it.label} className="flex gap-2" title={it.detail}>
                    <span className={cx("w-4 shrink-0 text-center", it.pass === true ? "text-good-text" : it.pass === false ? "text-critical-text" : "text-muted")} aria-label={it.pass === true ? "superato" : it.pass === false ? "non superato" : "non disponibile"}>
                      {it.pass === true ? "✓" : it.pass === false ? "✕" : "–"}
                    </span>
                    <span className="min-w-0">
                      {it.label}
                      <span className="block text-xs text-muted num">{it.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title={<>Altman Z-Score<Hint text="Stima del rischio di dissesto finanziario. Non è adatto a banche, assicurazioni e società immobiliari." /></>} hint={a.altman?.variant}>
          {a.altman ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className={cx("text-3xl font-semibold num", a.altman.zone === "sicura" ? "text-good-text" : a.altman.zone === "a rischio" ? "text-critical-text" : "")}>{fmtNum(a.altman.z, 2)}</span>
                <Badge tone={a.altman.zone === "sicura" ? "good" : a.altman.zone === "a rischio" ? "bad" : "warn"}>zona {a.altman.zone}</Badge>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {a.altman.components.map((c) => (
                  <li key={c.label} className="flex justify-between gap-3">
                    <span className="text-ink-2">{c.label}</span>
                    <span className="num">{fmtNum(c.value, 2)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted mt-3">{a.altman.variant.startsWith("Z'") ? "Soglie: sopra 2,9 sicura, sotto 1,23 a rischio. Inserendo il prezzo si usa la versione con capitalizzazione." : "Soglie: sopra 2,99 sicura, sotto 1,81 a rischio."}</p>
            </>
          ) : (
            <p className="text-sm text-ink-2">Servono attivo e passivo correnti, totale attivo e passivo, EBIT e ricavi.</p>
          )}
        </Card>

        <Card title={<>Beneish M-Score<Hint text="Otto indici che, combinati, segnalano bilanci con caratteristiche tipiche di utili manipolati. Sopra −1,78 merita un approfondimento; non è una prova." /></>} hint={`${periodLabel(a.prevFy!)} → ${periodLabel(last)}`}>
          {a.beneish ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className={cx("text-3xl font-semibold num", a.beneish.flag ? "text-critical-text" : "text-good-text")}>{fmtNum(a.beneish.m, 2)}</span>
                <Badge tone={a.beneish.flag ? "bad" : "good"}>{a.beneish.flag ? "▲ sopra la soglia −1,78" : "✓ sotto la soglia −1,78"}</Badge>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {(
                  [
                    ["DSRI", "Crediti / ricavi"],
                    ["GMI", "Margine lordo (inverso)"],
                    ["AQI", "Qualità dell'attivo"],
                    ["SGI", "Crescita dei ricavi"],
                    ["DEPI", "Ammortamenti (inverso)"],
                    ["SGAI", "SG&A / ricavi"],
                    ["LVGI", "Leva"],
                    ["TATA", "Accrual / attivo"],
                  ] as const
                ).map(([k, label]) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span className="text-ink-2">{label} <span className="text-muted text-xs">{k}</span></span>
                    <span className="num">{a.beneish!.missing.includes(k) ? <span className="text-muted" title="Dato non disponibile: indice posto a valore neutro">n.d.</span> : fmtNum(a.beneish!.indices[k], 2)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-ink-2">Servono ricavi e totale attivo di due esercizi consecutivi.</p>
          )}
        </Card>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card><Lines title="Utile contabile e cassa (margine netto e margine FCF)" data={rows} series={[{ key: "net_margin", label: "Margine netto" }, { key: "fcf_margin", label: "Margine FCF" }]} /></Card>
        <Card><Lines title="Accrual / attivo medio" data={rows} series={[{ key: "accruals", label: "Accrual" }]} /></Card>
        <Card><Lines title="Giorni di circolante" data={rows} series={[{ key: "dso", label: "Incasso" }, { key: "dio", label: "Magazzino" }, { key: "dpo", label: "Pagamento" }]} format="days" /></Card>
        <Card><Lines title="Compensi in azioni e diluizione" data={rows} series={[{ key: "sbc_pct", label: "SBC / ricavi" }, { key: "share_count_change", label: "Var. azioni" }]} /></Card>
      </div>

      {accountingFlags.length > 0 && (
        <Card title="Segnali contabili trovati nei documenti" hint="Dalla lettura qualitativa dei filing (note, principi contabili, relazione dei revisori)">
          <ul className="divide-y divide-line -my-2">
            {accountingFlags.map((f, i) => (
              <li key={i} className="py-2.5 flex gap-3">
                <div className="w-20 shrink-0 pt-0.5"><Badge tone={f.severity === "alta" ? "bad" : f.severity === "media" ? "warn" : "neutral"}>{f.severity}</Badge></div>
                <div className="min-w-0">
                  <div className="font-medium text-sm">{f.title}</div>
                  <div className="text-sm text-ink-2">{f.detail}</div>
                  <SourceLink source={{ docId: f.docId, page: f.page }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-muted">Margine FCF {fmtPct(a.annualMetrics[a.annualMetrics.length - 1].fcf_margin)} · tutti i punteggi sono calcolati sui dati GAAP caricati nella scheda Bilanci.</p>
    </div>
  );
}
