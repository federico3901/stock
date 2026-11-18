"use client";

import { useMemo, useState } from "react";
import { Spark } from "@/components/charts";
import { Badge, Button, Card, Empty, ErrorBox, Input, Label, Modal, Segmented, Select, cx } from "@/components/ui";
import { growth } from "@/lib/analysis/metrics";
import { periodLabel, sortPeriods } from "@/lib/analysis/periods";
import { coherenceChecks } from "@/lib/analysis/quality";
import { api, errMsg } from "@/lib/client";
import { FIELD_MAP, STATEMENT_LABELS, fieldsOf, type FieldDef, type FieldKey, type Statement } from "@/lib/fields";
import { DASH, fmtDate, fmtMoney, fmtNum, fmtPct, fmtScaled, pickScale } from "@/lib/format";
import { CUSTOM_CATEGORY_LABELS, type CustomMetric, type CustomMetricCategory, type FinancialPeriod, type FiscalPeriod } from "@/lib/types";
import { useDocViewer } from "./DocViewer";
import type { TabProps } from "./types";

type View = Statement | "custom";
type Mode = "valori" | "percento" | "variazione";

export function Financials({ bundle, analysis: a, refresh, setTab }: TabProps) {
  const { company } = bundle;
  const [view, setView] = useState<View>("income");
  const [freq, setFreq] = useState<"annuale" | "trimestrale">("annuale");
  const [mode, setMode] = useState<Mode>("valori");
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");
  const viewer = useDocViewer();

  const series = freq === "annuale" ? a.annual : a.quarters;
  const shown = series.slice(-10);

  if (!bundle.periods.length) {
    return (
      <>
        <Empty
          title="Nessun bilancio caricato"
          action={
            <>
              <Button variant="primary" onClick={() => setTab("documenti")}>Carica documenti</Button>
              <Button onClick={() => setAdding(true)}>Inserisci a mano</Button>
            </>
          }
        >
          I prospetti vengono estratti automaticamente dai 10-K e 10-Q. Puoi anche inserire o correggere i valori a mano.
        </Empty>
        <AddPeriod open={adding} onClose={() => setAdding(false)} companyId={company.id} onDone={() => { setAdding(false); setEditing(true); refresh(); }} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: "income", label: "Conto economico" },
            { value: "balance", label: "Stato patrimoniale" },
            { value: "cashflow", label: "Rendiconto finanziario" },
            { value: "custom", label: "Segmenti e KPI" },
          ]}
        />
        <Segmented value={freq} onChange={setFreq} options={[{ value: "annuale", label: "Annuale" }, { value: "trimestrale", label: "Trimestrale" }]} />
        {view !== "custom" && (
          <Segmented<Mode>
            value={mode}
            onChange={(m) => { setMode(m); setEditing(false); }}
            options={[
              { value: "valori", label: "Valori" },
              { value: "percento", label: view === "balance" ? "% dell'attivo" : "% dei ricavi" },
              { value: "variazione", label: "Var. a/a" },
            ]}
          />
        )}
        <div className="flex-1" />
        {view !== "custom" && mode === "valori" && (
          <Button size="sm" variant={editing ? "primary" : "secondary"} onClick={() => setEditing((e) => !e)}>{editing ? "Fine modifiche" : "Modifica valori"}</Button>
        )}
        <Button size="sm" onClick={() => setAdding(true)}>+ Periodo</Button>
        <a href={`/api/companies/${company.id}/export?frequenza=${freq}`} className="inline-flex items-center h-7 px-2.5 text-xs font-medium rounded-md border border-edge bg-surface hover:bg-surface-2">
          Esporta CSV
        </a>
      </div>
      <ErrorBox>{err}</ErrorBox>

      {view === "custom" ? (
        <CustomTable metrics={bundle.custom} quarterly={freq === "trimestrale"} currency={company.currency} />
      ) : shown.length === 0 ? (
        <Empty title={freq === "trimestrale" ? "Nessun dato trimestrale" : "Nessun dato annuale"}>
          {freq === "trimestrale" ? "Carica i 10-Q per vedere i trimestri. Il quarto trimestre viene ricavato per differenza dal 10-K." : "Carica un 10-K per vedere gli esercizi annuali."}
        </Empty>
      ) : (
        <StatementTable
          statement={view}
          periods={shown}
          all={series}
          mode={mode}
          editing={editing}
          currency={company.currency}
          onOpenSource={(docId, page) => viewer.open(docId, page)}
          onSave={async (p, key, value) => {
            setErr("");
            try {
              await api(`/api/companies/${company.id}/periods`, { method: "PUT", json: { fiscalYear: p.fiscalYear, fiscalPeriod: p.fiscalPeriod, values: { [key]: value } } });
              refresh();
            } catch (e) {
              setErr(errMsg(e));
            }
          }}
        />
      )}

      {view !== "custom" && shown.length > 0 && <Checks periods={shown} />}
      <AddPeriod open={adding} onClose={() => setAdding(false)} companyId={company.id} onDone={() => { setAdding(false); setEditing(true); setMode("valori"); refresh(); }} />
    </div>
  );
}

function StatementTable({
  statement, periods, all, mode, editing, currency, onOpenSource, onSave,
}: {
  statement: Statement;
  periods: FinancialPeriod[];
  all: FinancialPeriod[];
  mode: Mode;
  editing: boolean;
  currency: string;
  onOpenSource: (docId: string, page?: number) => void;
  onSave: (p: FinancialPeriod, key: FieldKey, value: number | null) => Promise<void>;
}) {
  const fields = fieldsOf(statement).filter((f) => editing || periods.some((p) => p.values[f.key as FieldKey] !== undefined));
  const money = useMemo(() => pickScale(periods.flatMap((p) => fields.filter((f) => f.kind === "money").map((f) => p.values[f.key as FieldKey]))), [periods, fields]);
  const shares = useMemo(() => pickScale(periods.flatMap((p) => fields.filter((f) => f.kind === "shares").map((f) => p.values[f.key as FieldKey]))), [periods, fields]);
  const scaleOf = (f: FieldDef) => (f.kind === "money" ? money.scale : f.kind === "shares" ? shares.scale : 1);
  const digitsOf = (f: FieldDef) => (f.kind === "per_share" ? 2 : scaleOf(f) === 1e9 ? 2 : scaleOf(f) === 1 ? 0 : money.scale === 1e6 || f.kind === "shares" ? 1 : 0);
  const base = (p: FinancialPeriod) => (statement === "balance" ? p.values.total_assets : p.values.revenue);
  const yearAgo = (p: FinancialPeriod) => all.find((x) => x.fiscalYear === p.fiscalYear - 1 && x.fiscalPeriod === p.fiscalPeriod);

  return (
    <Card
      title={STATEMENT_LABELS[statement]}
      hint={
        mode === "valori"
          ? `${currency || "Valuta"} in ${money.label}${fields.some((f) => f.kind === "shares") ? `, azioni in ${shares.label}` : ""}, valori per azione in unità. Clic su un numero per aprire la fonte.`
          : mode === "percento"
            ? "Ogni voce in percentuale " + (statement === "balance" ? "del totale attivo" : "dei ricavi")
            : "Variazione rispetto allo stesso periodo dell'anno precedente"
      }
      pad={false}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm num border-separate border-spacing-0">
          <thead>
            <tr className="text-xs text-ink-2 [&>th]:font-medium [&>th]:px-3 [&>th]:py-2 [&>th]:border-b [&>th]:border-line">
              <th className="text-left sticky left-0 bg-surface z-10 min-w-56">Voce</th>
              {periods.map((p) => (
                <th key={p.id} className="text-right whitespace-nowrap" title={p.periodEnd ? `Chiusura ${fmtDate(p.periodEnd)}` : undefined}>
                  {periodLabel(p)}
                  {p.derived && <span className="text-muted font-normal" title="Ricavato per differenza dai dati cumulati"> *</span>}
                </th>
              ))}
              <th className="text-right">Andamento</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => {
              const key = f.key as FieldKey;
              return (
                <tr key={key} className={cx("group", f.total && "font-semibold")}>
                  <td className={cx("text-left sticky left-0 bg-surface z-10 px-3 py-1.5 border-b border-line", !f.total && "pl-6 font-normal")} title={f.hint}>
                    {f.label}
                  </td>
                  {periods.map((p) => {
                    const v = p.values[key];
                    const src = p.sources[key];
                    let content: React.ReactNode;
                    if (mode === "percento") {
                      const b = base(p);
                      content = f.kind === "money" && v !== undefined && b ? fmtPct(v / b) : DASH;
                    } else if (mode === "variazione") {
                      const g = growth(v, yearAgo(p)?.values[key]);
                      content = g === undefined ? DASH : <span className={g < 0 ? "text-critical-text" : undefined}>{(g > 0 ? "+" : "") + fmtPct(g)}</span>;
                    } else if (editing && !p.derived) {
                      content = <EditCell key={String(v)} value={v} scale={scaleOf(f)} digits={digitsOf(f)} onSave={(nv) => onSave(p, key, nv)} label={`${f.label} ${periodLabel(p)}`} />;
                    } else if (v === undefined) {
                      content = <span className="text-muted">{DASH}</span>;
                    } else {
                      const text = fmtScaled(v, scaleOf(f), digitsOf(f));
                      content = src ? (
                        <button type="button" className="hover:underline hover:text-accent-ink" onClick={() => onOpenSource(src.docId, src.page)} title={src.page ? `Apri la fonte a pagina ${src.page}` : "Apri il documento di origine"}>
                          {text}
                        </button>
                      ) : (
                        <span title={p.edited[key] ? "Inserito a mano" : p.derived ? "Ricavato per differenza" : undefined}>{text}</span>
                      );
                    }
                    return (
                      <td key={p.id} className={cx("text-right px-3 py-1.5 border-b border-line whitespace-nowrap", p.edited[key] && mode === "valori" && "bg-accent-wash/50")}>
                        {content}
                      </td>
                    );
                  })}
                  <td className="text-right px-3 py-1 border-b border-line">
                    <Spark values={periods.map((p) => p.values[key])} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-xs text-muted flex flex-wrap gap-x-4">
        {periods.some((p) => p.derived) && <span>* trimestre ricavato per differenza (es. Q4 = anno − nove mesi)</span>}
        {periods.some((p) => Object.keys(p.edited).length > 0) && mode === "valori" && <span><span className="inline-block size-2.5 bg-accent-wash align-middle mr-1 rounded-sm" />valore inserito a mano</span>}
        {FIELD_MAP.capex && statement === "cashflow" && <span>Capex, dividendi e buyback sono riportati come valori positivi (uscite).</span>}
      </div>
    </Card>
  );
}

function EditCell({ value, scale, digits, onSave, label }: { value: number | undefined; scale: number; digits: number; onSave: (v: number | null) => Promise<void>; label: string }) {
  const initial = value === undefined ? "" : String(+(value / scale).toFixed(Math.max(digits, 2))).replace(".", ",");
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const commit = async () => {
    if (text.trim() === initial.trim()) return;
    const raw = text.trim().replace(/\./g, "").replace(",", ".").replace(/^\((.*)\)$/, "-$1");
    if (raw === "") {
      setSaving(true);
      await onSave(null);
      setSaving(false);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return setText(initial);
    setSaving(true);
    await onSave(n * scale);
    setSaving(false);
  };
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      aria-label={label}
      inputMode="decimal"
      className={cx("w-24 h-7 text-right rounded border border-edge bg-surface px-1.5 text-sm num focus:outline-2 focus:outline-accent", saving && "opacity-50")}
    />
  );
}

function Checks({ periods }: { periods: FinancialPeriod[] }) {
  const rows = periods.map((p) => ({ p, checks: coherenceChecks(p.values) }));
  const failed = rows.flatMap((r) => r.checks.filter((c) => !c.ok).map((c) => ({ ...c, period: periodLabel(r.p) })));
  const total = rows.reduce((n, r) => n + r.checks.length, 0);
  if (!total) return null;
  return (
    <Card title="Controlli di coerenza" hint="Verifiche aritmetiche sui dati estratti: se un controllo fallisce, conviene aprire la fonte e correggere il valore">
      {failed.length === 0 ? (
        <div className="text-sm flex items-center gap-2">
          <Badge tone="good">✓ {total} controlli superati</Badge>
          <span className="text-ink-2">Utile lordo, quadratura dello stato patrimoniale, utile netto, variazione di cassa ed EPS tornano in tutti i periodi mostrati.</span>
        </div>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {failed.map((c, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <Badge tone="bad">✕ {c.period}</Badge>
              <span className="font-medium">{c.label}</span>
              <span className="text-ink-2 num">{c.detail}</span>
            </li>
          ))}
          <li className="text-xs text-muted pt-1">{total - failed.length} controlli superati su {total}.</li>
        </ul>
      )}
    </Card>
  );
}

function CustomTable({ metrics, quarterly, currency }: { metrics: CustomMetric[]; quarterly: boolean; currency: string }) {
  const viewer = useDocViewer();
  const list = metrics.filter((m) => (quarterly ? m.fiscalPeriod !== "FY" : m.fiscalPeriod === "FY"));
  if (!list.length)
    return (
      <Empty title="Nessun dato di segmento o KPI">
        Ricavi per segmento, per area geografica e KPI operativi (clienti, abbonati, backlog…) vengono estratti dai documenti quando il management li riporta.
      </Empty>
    );
  const periods = sortPeriods([...new Map(list.map((m) => [`${m.fiscalYear}|${m.fiscalPeriod}`, { fiscalYear: m.fiscalYear, fiscalPeriod: m.fiscalPeriod }])).values()]).slice(-8);
  const cats = (Object.keys(CUSTOM_CATEGORY_LABELS) as CustomMetricCategory[]).filter((c) => list.some((m) => m.category === c));
  const fmt = (m: CustomMetric | undefined) => (!m ? DASH : m.unit === "currency" ? fmtMoney(m.value) : m.unit === "percent" ? fmtPct(m.value) : fmtNum(m.value));
  return (
    <div className="space-y-4">
      {cats.map((cat) => {
        const names = [...new Set(list.filter((m) => m.category === cat).map((m) => m.name))];
        const get = (name: string, p: { fiscalYear: number; fiscalPeriod: FiscalPeriod }) => list.find((m) => m.category === cat && m.name === name && m.fiscalYear === p.fiscalYear && m.fiscalPeriod === p.fiscalPeriod);
        const isMoney = cat !== "kpi";
        // i sottosegmenti ("Segmento - Dettaglio") non entrano nel totale, altrimenti sarebbero contati due volte
        const top = names.filter((n) => !names.some((o) => o !== n && n.startsWith(`${o} - `)));
        const totals = periods.map((p) => top.reduce((a, n) => a + (get(n, p)?.value ?? 0), 0));
        return (
          <Card key={cat} title={CUSTOM_CATEGORY_LABELS[cat]} hint={isMoney && currency ? (cat === "segment_profit" ? `${currency}; misura usata dalla società per i segmenti, con la crescita a/a` : `${currency}; sotto ogni valore il peso sul totale e la crescita a/a`) : undefined} pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm num">
                <thead>
                  <tr className="text-xs text-ink-2 border-b border-line [&>th]:font-medium [&>th]:px-3 [&>th]:py-2">
                    <th className="text-left min-w-56">{cat === "kpi" ? "Indicatore" : "Segmento"}</th>
                    {periods.map((p) => <th key={periodLabel(p)} className="text-right whitespace-nowrap">{periodLabel(p)}</th>)}
                    <th className="text-right">Andamento</th>
                  </tr>
                </thead>
                <tbody>
                  {names.map((name) => (
                    <tr key={name} className="border-b border-line last:border-0 align-top">
                      <td className="text-left px-3 py-1.5">
                        {name}
                        {cat === "kpi" && (() => { const u = list.find((m) => m.category === cat && m.name === name)?.unit; return u && u !== "currency" && u !== "percent" ? <span className="text-muted text-xs"> ({u})</span> : null; })()}
                      </td>
                      {periods.map((p, i) => {
                        const m = get(name, p);
                        const prev = get(name, { fiscalYear: p.fiscalYear - 1, fiscalPeriod: p.fiscalPeriod });
                        const g = m && prev && m.unit !== "percent" ? growth(m.value, prev.value) : undefined;
                        return (
                          <td key={periodLabel(p)} className="text-right px-3 py-1.5 whitespace-nowrap">
                            {m?.source ? (
                              <button type="button" className="hover:underline hover:text-accent-ink" onClick={() => viewer.open(m.source!.docId, m.source!.page)}>{fmt(m)}</button>
                            ) : fmt(m)}
                            {m && (isMoney || g !== undefined) && (
                              <div className="text-[11px] text-muted">
                                {isMoney && cat !== "segment_profit" && totals[i] ? fmtPct(m.value / totals[i], 0) : ""}
                                {isMoney && cat !== "segment_profit" && g !== undefined ? " · " : ""}
                                {g !== undefined ? (g > 0 ? "+" : "") + fmtPct(g) : ""}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-right px-3 py-1"><Spark values={periods.map((p) => get(name, p)?.value)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function AddPeriod({ open, onClose, companyId, onDone }: { open: boolean; onClose: () => void; companyId: string; onDone: () => void }) {
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [period, setPeriod] = useState<FiscalPeriod>("FY");
  const [revenue, setRevenue] = useState("");
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rev = Number(revenue.replace(/\./g, "").replace(",", "."));
    if (!(rev > 0)) return setErr("Indica i ricavi del periodo (in milioni) per creare la colonna.");
    try {
      await api(`/api/companies/${companyId}/periods`, { method: "PUT", json: { fiscalYear: Number(year), fiscalPeriod: period, values: { revenue: rev * 1e6 } } });
      setRevenue("");
      setErr("");
      onDone();
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Aggiungi un periodo a mano">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Label label="Esercizio"><Input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" required /></Label>
          <Label label="Periodo">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as FiscalPeriod)}>
              {(["FY", "Q1", "Q2", "Q3", "Q4", "H1", "9M"] as FiscalPeriod[]).map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Label>
          <Label label="Ricavi (milioni)"><Input value={revenue} onChange={(e) => setRevenue(e.target.value)} inputMode="decimal" placeholder="1.250" /></Label>
        </div>
        <p className="text-xs text-ink-2">Dopo la creazione potrai compilare le altre voci direttamente nella tabella.</p>
        <ErrorBox>{err}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Annulla</Button>
          <Button variant="primary" type="submit">Aggiungi</Button>
        </div>
      </form>
    </Modal>
  );
}
