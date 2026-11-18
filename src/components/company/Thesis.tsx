"use client";

import { useState } from "react";
import { Badge, Button, Card, ErrorBox, Input, Select } from "@/components/ui";
import { METRICS, METRIC_MAP, type MetricKey } from "@/lib/analysis/metrics";
import type { QuarterBrief } from "@/lib/analysis/quarter";
import type { CheckEval } from "@/lib/analysis/thesis";
import { api, errMsg } from "@/lib/client";
import { fmtMetric, fmtMoney, fmtPct, fmtPerShare } from "@/lib/format";

const GROUPS = [...new Set(METRICS.map((m) => m.group))];

/** Soglia nell'unità in cui la si scrive a mano: percentuali in %, importi in milioni. */
const unitOf = (key: string) => {
  const f = METRIC_MAP[key as MetricKey]?.format;
  return f === "pct" ? { suffix: "%", k: 100 } : f === "money" ? { suffix: "Mln", k: 1e-6 } : f === "days" ? { suffix: "gg", k: 1 } : f === "x" ? { suffix: "x", k: 1 } : { suffix: "", k: 1 };
};

const statusTone = { rispettata: "good", violata: "bad", "non verificabile": "neutral" } as const;
const statusIcon = { rispettata: "✓", violata: "✕", "non verificabile": "?" } as const;

/**
 * Le condizioni della tesi: "cosa deve restare vero" tradotto in numeri, ricontrollato da solo
 * ogni volta che si carica un nuovo documento.
 */
export function ThesisChecks({ companyId, currency, evals, snapshotLabel, refresh, compact, onManage }: {
  companyId: string; currency: string; evals: CheckEval[]; snapshotLabel?: string; refresh: () => void; compact?: boolean; onManage?: () => void;
}) {
  const [metric, setMetric] = useState<string>("operating_margin");
  const [op, setOp] = useState<"gte" | "lte">("gte");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const u = unitOf(metric);

  const add = async () => {
    const n = Number(value.replace(",", "."));
    if (!value.trim() || !Number.isFinite(n)) return setErr("Inserisci una soglia numerica.");
    setBusy(true);
    setErr("");
    try {
      await api(`/api/companies/${companyId}/checks`, { json: { metric, op, threshold: n / u.k, note } });
      setValue("");
      setNote("");
      refresh();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    try {
      await api(`/api/companies/${companyId}/checks?checkId=${id}`, { method: "DELETE" });
      refresh();
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  const fmt = (key: string, v: number | undefined) => fmtMetric(v, METRIC_MAP[key as MetricKey]?.format ?? "num", currency);

  return (
    <Card
      title="Tesi sotto controllo"
      hint={compact ? (snapshotLabel ? `Verificata sui dati ${snapshotLabel}` : undefined) : `Le condizioni che devono restare vere perché l'investimento funzioni. Vengono ricontrollate da sole a ogni nuovo documento${snapshotLabel ? ` (ora sui dati ${snapshotLabel})` : ""}.`}
      action={compact && onManage ? <Button size="sm" onClick={onManage}>{evals.length ? "Gestisci" : "Imposta"}</Button> : undefined}
    >
      {evals.length ? (
        <ul className="divide-y divide-line -my-1">
          {evals.map((e) => (
            <li key={e.check.id} className="py-2 flex items-start gap-3 text-sm">
              <Badge tone={statusTone[e.status]}>{statusIcon[e.status]} {e.status}</Badge>
              <div className="min-w-0 flex-1">
                <div>
                  <span className="font-medium">{e.label}</span>{" "}
                  <span className="text-ink-2 num">{e.check.op === "gte" ? "≥" : "≤"} {fmt(e.check.metric, e.check.threshold)}</span>
                </div>
                {e.check.note && <div className="text-xs text-ink-2 mt-0.5">{e.check.note}</div>}
              </div>
              <div className="text-right num shrink-0">
                <div className="font-medium">{fmt(e.check.metric, e.current)}</div>
                {e.previous !== undefined && e.direction && (
                  <div className={e.direction === "peggiora" ? "text-xs text-critical-text" : "text-xs text-muted"}>
                    da {fmt(e.check.metric, e.previous)}{e.direction === "peggiora" ? (e.status === "violata" ? " · in peggioramento" : " · si avvicina alla soglia") : e.direction === "migliora" ? " · più margine" : ""}
                  </div>
                )}
              </div>
              {!compact && (
                <button type="button" className="text-muted hover:text-critical-text px-1" aria-label={`Elimina la condizione su ${e.label}`} onClick={() => remove(e.check.id)}>×</button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-2">
          {compact
            ? "Nessuna condizione impostata. Traduci la tesi in due o tre numeri (es. margine operativo ≥ 18%, giorni di incasso ≤ 55) e a ogni trimestrale saprai subito se regge ancora."
            : "Nessuna condizione. Aggiungine una qui sotto: ad esempio margine operativo ≥ 18%, debito netto / EBITDA ≤ 2x, giorni di incasso ≤ 55."}
        </p>
      )}
      {!compact && (
        <div className="mt-4 pt-4 border-t border-line">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Metrica">
              {GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {METRICS.filter((m) => m.group === g).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </optgroup>
              ))}
            </Select>
            <Select value={op} onChange={(e) => setOp(e.target.value as "gte" | "lte")} aria-label="Condizione">
              <option value="gte">almeno (≥)</option>
              <option value="lte">al massimo (≤)</option>
            </Select>
            <span className="inline-flex items-center gap-1">
              <Input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} inputMode="decimal" placeholder="soglia" className="w-24 text-right num" aria-label="Soglia" />
              <span className="text-xs text-ink-2 w-7">{u.suffix}</span>
            </span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Perché conta (facoltativo)" className="flex-1 min-w-40" aria-label="Nota" />
            <Button variant="primary" onClick={add} disabled={busy}>Aggiungi</Button>
          </div>
          <p className="text-xs text-muted mt-2">{METRIC_MAP[metric as MetricKey]?.description}</p>
          <ErrorBox>{err}</ErrorBox>
        </div>
      )}
    </Card>
  );
}

/** L'ultimo trimestre contro lo stesso trimestre dell'anno prima e contro il precedente. */
export function QuarterCard({ q, currency }: { q: QuarterBrief; currency: string }) {
  const val = (r: QuarterBrief["rows"][number]) => (r.kind === "pct" ? fmtPct(r.value) : r.kind === "per_share" ? fmtPerShare(r.value, currency) : fmtMoney(r.value, currency));
  const delta = (r: QuarterBrief["rows"][number], d: number | undefined) => {
    if (d === undefined) return <span className="text-muted">–</span>;
    if (Math.abs(d) < (r.kind === "pct" ? 0.0005 : 0.0005)) return <span className="text-ink-2">invariato</span>;
    const txt = r.kind === "pct" ? `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1).replace(".", ",")} pt` : `${d >= 0 ? "+" : ""}${fmtPct(d)}`;
    const flat = Math.abs(d) < (r.kind === "pct" ? 0.001 : 0.005);
    return <span className={flat ? "text-ink-2" : d > 0 ? "text-good-text" : "text-critical-text"}>{flat ? "" : d > 0 ? "▲ " : "▼ "}{txt}</span>;
  };
  const g = q.growthChange;
  return (
    <Card
      title={`Ultimo trimestre: ${q.label}`}
      hint={g === undefined ? undefined : Math.abs(g) < 0.01 ? "Crescita dei ricavi stabile rispetto al trimestre precedente" : g > 0 ? `Crescita dei ricavi in accelerazione di ${(g * 100).toFixed(1).replace(".", ",")} punti sul trimestre precedente` : `Crescita dei ricavi in rallentamento di ${(-g * 100).toFixed(1).replace(".", ",")} punti sul trimestre precedente`}
      pad={false}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-ink-2 border-y border-line">
            <th className="text-left font-medium px-4 py-1.5">Voce</th>
            <th className="text-right font-medium px-3 py-1.5">{q.label}</th>
            <th className="text-right font-medium px-3 py-1.5">{q.compareLabel ? `vs ${q.compareLabel}` : "a/a"}</th>
            <th className="text-right font-medium px-4 py-1.5">{q.previousLabel ? `vs ${q.previousLabel}` : "t/t"}</th>
          </tr>
        </thead>
        <tbody>
          {q.rows.map((r) => (
            <tr key={r.label} className="border-b border-line last:border-0">
              <td className="px-4 py-1.5">{r.label}</td>
              <td className="px-3 py-1.5 text-right num font-medium">{val(r)}</td>
              <td className="px-3 py-1.5 text-right num">{delta(r, r.yoy)}</td>
              <td className="px-4 py-1.5 text-right num">{delta(r, r.qoq)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
