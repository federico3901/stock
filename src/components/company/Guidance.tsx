"use client";

import { useState } from "react";
import { Badge, Button, Card, Empty, ErrorBox, Input, Label, Modal, Select, Stat } from "@/components/ui";
import type { GuidanceEvaluation } from "@/lib/analysis/guidance";
import { periodLabel } from "@/lib/analysis/periods";
import { api, errMsg } from "@/lib/client";
import { fmtDate, fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { FISCAL_PERIODS, GUIDANCE_METRIC_LABELS, type FiscalPeriod, type GuidanceItem, type GuidanceMetric, type GuidanceUnit } from "@/lib/types";
import { SourceLink } from "./DocViewer";
import type { TabProps } from "./types";

const fmtG = (g: Pick<GuidanceItem, "unit">, v: number | undefined, currency: string) =>
  g.unit === "percent" ? fmtPct(v) : g.unit === "per_share" ? fmtMoney(v, currency, 2) : g.unit === "currency" ? fmtMoney(v, currency, Math.abs(v ?? 0) >= 1e9 ? 2 : undefined) : fmtNum(v, 2);

export function fmtGuidanceRange(g: GuidanceItem, currency: string): string {
  if (g.qualitative) return "qualitativa";
  if (g.low !== undefined && g.high !== undefined) return g.low === g.high ? fmtG(g, g.low, currency) : `${fmtG(g, g.low, "")} – ${fmtG(g, g.high, currency)}`;
  if (g.low !== undefined) return `≥ ${fmtG(g, g.low, currency)}`;
  return `≤ ${fmtG(g, g.high, currency)}`;
}

const outcomeTone = { superata: "good", "in linea": "good", mancata: "bad", "in attesa": "neutral", "non confrontabile": "neutral" } as const;
const outcomeIcon = { superata: "▲", "in linea": "✓", mancata: "▼", "in attesa": "…", "non confrontabile": "" } as const;

export function GuidanceTab({ bundle, analysis: a, refresh, setTab }: TabProps) {
  const cur = bundle.company.currency;
  const [editing, setEditing] = useState<Partial<GuidanceItem> | null>(null);
  // per ogni periodo si mostra l'ultima indicazione di ogni metrica; la storia completa si apre a richiesta
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const evals = a.guidanceEvals;

  const remove = async (g: GuidanceItem) => {
    if (!confirm("Eliminare questa indicazione?")) return;
    await api(`/api/companies/${bundle.company.id}/guidance?guidanceId=${g.id}`, { method: "DELETE" });
    refresh();
  };

  if (!evals.length) {
    return (
      <>
        <Empty
          title="Nessuna guidance"
          action={
            <>
              <Button variant="primary" onClick={() => setTab("documenti")}>Carica documenti</Button>
              <Button onClick={() => setEditing({})}>Aggiungi a mano</Button>
            </>
          }
        >
          La guidance viene estratta da comunicati sui risultati, presentazioni, trascrizioni e dalla sezione MD&amp;A. Caricando i documenti in sequenza si ricostruisce la storia: cosa aveva promesso il management, come l&apos;ha rivisto e cosa ha consegnato.
        </Empty>
        <GuidanceForm item={editing} companyId={bundle.company.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
      </>
    );
  }

  // raggruppa per periodo obiettivo, dal più recente
  const groups = new Map<string, GuidanceEvaluation[]>();
  for (const e of evals) {
    const k = `${e.item.targetFiscalYear}|${e.item.targetPeriod}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  const order = (p: FiscalPeriod) => ({ FY: 5, Q4: 4, "9M": 3.5, Q3: 3, H1: 2.5, Q2: 2, Q1: 1 })[p];
  const keys = [...groups.keys()].sort((x, y) => {
    const [fx, px] = x.split("|");
    const [fy, py] = y.split("|");
    return Number(fy) - Number(fx) || order(py as FiscalPeriod) - order(px as FiscalPeriod);
  });

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Affidabilità del management" className="lg:col-span-2" hint="Sull'ultima guidance data prima di ogni risultato">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-4">
            <Stat label="Rispettate o superate" value={a.cred.hitRate !== undefined ? fmtPct(a.cred.hitRate, 0) : "–"} sub={`${a.cred.evaluated} verificabili`} tone={a.cred.hitRate !== undefined ? (a.cred.hitRate >= 0.75 ? "good" : a.cred.hitRate < 0.5 ? "bad" : undefined) : undefined} />
            <Stat label="Superate" value={a.cred.beat} />
            <Stat label="In linea" value={a.cred.inline} />
            <Stat label="Mancate" value={a.cred.miss} tone={a.cred.miss ? "bad" : undefined} />
            <Stat label="Revisioni" value={`${a.cred.raised} ▲ · ${a.cred.lowered} ▼`} sub="rialzi e tagli in corso d'anno" />
          </div>
          <p className="text-sm mt-4 pt-3 border-t border-line">{a.cred.verdict}</p>
          {a.cred.avgSurprise !== undefined && (
            <p className="text-xs text-ink-2 mt-1">
              Scostamento medio dal punto medio della guidance: {a.cred.avgSurprise >= 0 ? "+" : ""}{fmtPct(a.cred.avgSurprise)}.
            </p>
          )}
        </Card>
        <Card title="Come leggere" action={<Button size="sm" onClick={() => setEditing({})}>+ Aggiungi</Button>}>
          <ul className="text-xs text-ink-2 space-y-1.5">
            <li><b className="text-ink">In linea</b>: il dato effettivo è dentro l&apos;intervallo indicato.</li>
            <li><b className="text-ink">Superata / mancata</b>: sopra o sotto l&apos;intervallo.</li>
            <li>Le misure rettificate (EBITA, adjusted EBITDA, FOCF…) sono confrontate col dato pubblicato dalla società, non col bilancio standardizzato; se manca, restano &quot;non confrontabili&quot;.</li>
            <li>Per debito, leva e indici di costo &quot;superata&quot; vuol dire meglio dell&apos;obiettivo, cioè più basso.</li>
          </ul>
        </Card>
      </div>

      {keys.map((k) => {
        const all = groups.get(k)!;
        const [fy, fp] = k.split("|");
        const pending = all.every((e) => e.actual === undefined);
        const lastOf = new Map<string, GuidanceEvaluation>();
        const countOf = new Map<string, number>();
        const mk = (e: GuidanceEvaluation) => `${e.item.metric}|${e.item.label.toLowerCase().trim()}|${e.item.nonGaap}`;
        for (const e of all) { lastOf.set(mk(e), e); countOf.set(mk(e), (countOf.get(mk(e)) ?? 0) + 1); }
        const isOpen = expanded.has(k);
        const list = isOpen ? all : [...lastOf.values()];
        const hidden = all.length - lastOf.size;
        const toggle = () => setExpanded((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
        return (
          <Card key={k} title={`Obiettivi per ${periodLabel({ fiscalYear: Number(fy), fiscalPeriod: fp as FiscalPeriod })}`} action={<span className="flex items-center gap-2">{pending && <Badge tone="accent">periodo non ancora chiuso</Badge>}{hidden > 0 && <Button size="sm" variant="ghost" onClick={toggle}>{isOpen ? "Solo l'ultima indicazione" : `Tutta la storia (${all.length})`}</Button>}</span>} pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink-2 text-left border-b border-line [&>th]:font-medium [&>th]:px-4 [&>th]:py-2 whitespace-nowrap">
                    <th>Comunicata il</th>
                    <th>Metrica</th>
                    <th className="text-right">Guidance</th>
                    <th>Revisione</th>
                    <th className="text-right">Effettivo</th>
                    <th>Esito</th>
                    <th>Fonte</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => {
                    const g = e.item;
                    return (
                      <tr key={g.id} className="border-b border-line last:border-0 [&>td]:px-4 [&>td]:py-2 align-top">
                        <td className="whitespace-nowrap">{fmtDate(g.issuedDate)}</td>
                        <td>
                          <span className="font-medium">{g.label || GUIDANCE_METRIC_LABELS[g.metric]}</span>
                          {g.nonGaap && <span className="ml-1.5"><Badge>non-GAAP</Badge></span>}
                          {(g.text || g.quote) && <div className="text-xs text-ink-2 mt-0.5 max-w-xl">{g.text || `“${g.quote}”`}</div>}
                        </td>
                        <td className="text-right num whitespace-nowrap font-medium">{fmtGuidanceRange(g, cur)}</td>
                        <td className="whitespace-nowrap">
                          {e.revision === "alzata" && <Badge tone="good">▲ alzata{e.revisionDelta !== undefined ? ` ${fmtDelta(g, e.revisionDelta)}` : ""}</Badge>}
                          {e.revision === "abbassata" && <Badge tone="bad">▼ abbassata{e.revisionDelta !== undefined ? ` ${fmtDelta(g, e.revisionDelta)}` : ""}</Badge>}
                          {e.revision === "confermata" && <Badge>= confermata</Badge>}
                          {e.revision === "ristretta" && <Badge>intervallo ristretto</Badge>}
                          {e.revision === "prima indicazione" && <span className="text-xs text-muted">prima indicazione</span>}
                          {!isOpen && (countOf.get(mk(e)) ?? 1) > 1 && <div className="text-[11px] text-muted">{countOf.get(mk(e))} indicazioni nel tempo</div>}
                        </td>
                        <td className="text-right num whitespace-nowrap">
                          {e.actual !== undefined ? fmtG(g, e.actual, cur) : "–"}
                          {e.surprise !== undefined && <div className="text-[11px] text-muted">{fmtDelta(g, e.surprise)} vs punto medio</div>}
                          {e.actualSource && <div className="text-[11px] text-muted">{e.actualSource === "pubblicato" ? "dato pubblicato dalla società" : "dal bilancio standardizzato"}</div>}
                        </td>
                        <td className="whitespace-nowrap">
                          <Badge tone={outcomeTone[e.outcome]}>{outcomeIcon[e.outcome]} {e.outcome}</Badge>
                        </td>
                        <td>{g.docId && <SourceLink source={{ docId: g.docId, page: g.page }} highlight={g.quote?.slice(0, 40)} />}</td>
                        <td className="text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(g)}>Modifica</Button>
                          <Button size="sm" variant="ghost" className="text-critical-text" onClick={() => remove(g)}>✕</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
      <GuidanceForm item={editing} companyId={bundle.company.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
    </div>
  );
}

const isRatio = (g: Pick<GuidanceItem, "unit">) => g.unit === "percent";
function fmtDelta(g: GuidanceItem, d: number): string {
  const sign = d >= 0 ? "+" : "−";
  // per margini e tassi lo scostamento è in punti percentuali
  if (isRatio(g) || ["revenue_growth", "gross_margin", "operating_margin", "tax_rate"].includes(g.metric)) return `${sign}${fmtNum(Math.abs(d) * 100, 1)} pt`;
  return `${sign}${fmtPct(Math.abs(d))}`;
}

const UNIT_OF: Partial<Record<GuidanceMetric, GuidanceUnit>> = {
  revenue_growth: "percent", gross_margin: "percent", operating_margin: "percent", tax_rate: "percent", eps_diluted: "per_share",
};

function GuidanceForm({ item, companyId, onClose, onSaved }: { item: Partial<GuidanceItem> | null; companyId: string; onClose: () => void; onSaved: () => void }) {
  if (!item) return null;
  return <GuidanceFormInner key={item.id ?? "new"} item={item} companyId={companyId} onClose={onClose} onSaved={onSaved} />;
}

function GuidanceFormInner({ item, companyId, onClose, onSaved }: { item: Partial<GuidanceItem>; companyId: string; onClose: () => void; onSaved: () => void }) {
  const unit0 = item.unit ?? "currency";
  const toInput = (v: number | undefined, unit: GuidanceUnit) => (v === undefined ? "" : String(+(unit === "percent" ? v * 100 : unit === "currency" ? v / 1e6 : v).toFixed(4)).replace(".", ","));
  const [metric, setMetric] = useState<GuidanceMetric>(item.metric ?? "revenue");
  const [label, setLabel] = useState(item.label ?? "");
  const [unit, setUnit] = useState<GuidanceUnit>(unit0);
  const [fy, setFy] = useState(String(item.targetFiscalYear ?? new Date().getFullYear()));
  const [fp, setFp] = useState<FiscalPeriod>(item.targetPeriod ?? "FY");
  const [low, setLow] = useState(toInput(item.low, unit0));
  const [high, setHigh] = useState(toInput(item.high, unit0));
  const [date, setDate] = useState(item.issuedDate ?? new Date().toISOString().slice(0, 10));
  const [nonGaap, setNonGaap] = useState(item.nonGaap ?? false);
  const [text, setText] = useState(item.text ?? "");
  const [err, setErr] = useState("");

  const parse = (s: string) => {
    if (!s.trim()) return undefined;
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n)) return NaN;
    return unit === "percent" ? n / 100 : unit === "currency" ? n * 1e6 : n;
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const lo = parse(low);
    const hi = parse(high);
    if (Number.isNaN(lo) || Number.isNaN(hi)) return setErr("Valori non validi.");
    try {
      await api(`/api/companies/${companyId}/guidance`, {
        json: { id: item.id, metric, label, unit, targetFiscalYear: Number(fy), targetPeriod: fp, low: lo ?? hi, high: hi ?? lo, issuedDate: date, nonGaap, text },
      });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  const unitHint = unit === "percent" ? "in %" : unit === "currency" ? "in milioni" : unit === "per_share" ? "per azione" : "";
  return (
    <Modal open onClose={onClose} title={item.id ? "Modifica guidance" : "Nuova guidance"}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Label label="Metrica">
            <Select value={metric} onChange={(e) => { const m = e.target.value as GuidanceMetric; setMetric(m); setUnit(UNIT_OF[m] ?? (m === "other" ? "other" : "currency")); }}>
              {Object.entries(GUIDANCE_METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Label>
          <Label label="Etichetta (facoltativa)"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="es. Margine operativo rettificato" /></Label>
          <Label label="Esercizio obiettivo"><Input value={fy} onChange={(e) => setFy(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" required /></Label>
          <Label label="Periodo">
            <Select value={fp} onChange={(e) => setFp(e.target.value as FiscalPeriod)}>{FISCAL_PERIODS.map((p) => <option key={p}>{p}</option>)}</Select>
          </Label>
          <Label label={`Minimo ${unitHint}`}><Input value={low} onChange={(e) => setLow(e.target.value)} inputMode="decimal" /></Label>
          <Label label={`Massimo ${unitHint}`}><Input value={high} onChange={(e) => setHigh(e.target.value)} inputMode="decimal" /></Label>
          <Label label="Unità">
            <Select value={unit} onChange={(e) => setUnit(e.target.value as GuidanceUnit)}>
              <option value="currency">Importo (milioni)</option>
              <option value="percent">Percentuale</option>
              <option value="per_share">Per azione</option>
              <option value="other">Altro</option>
            </Select>
          </Label>
          <Label label="Comunicata il"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Label>
        </div>
        <Label label="Note / indicazione qualitativa"><Input value={text} onChange={(e) => setText(e.target.value)} /></Label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={nonGaap} onChange={(e) => setNonGaap(e.target.checked)} className="accent-[var(--accent)]" /> Misura non-GAAP (rettificata)</label>
        <ErrorBox>{err}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Annulla</Button>
          <Button variant="primary" type="submit">Salva</Button>
        </div>
      </form>
    </Modal>
  );
}
