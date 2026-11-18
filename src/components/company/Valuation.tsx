"use client";

import { useMemo, useState } from "react";
import { Bars } from "@/components/charts";
import { Badge, Button, Card, Empty, ErrorBox, Hint, InfoBox, Stat, cx } from "@/components/ui";
import { cagr } from "@/lib/analysis/metrics";
import { dcf, defaultValuationInputs, expectedReturn, impliedGrowth, impliedMargin, sensitivity } from "@/lib/analysis/valuation";
import { api, errMsg } from "@/lib/client";
import { fmtMoney, fmtNum, fmtPct, fmtX } from "@/lib/format";
import type { ScenarioInputs, ValuationInputs } from "@/lib/types";
import type { TabProps } from "./types";

type ScenarioName = "bear" | "base" | "bull";
const NAMES: { key: ScenarioName; label: string }[] = [
  { key: "bear", label: "Pessimistico" },
  { key: "base", label: "Base" },
  { key: "bull", label: "Ottimistico" },
];

const ROWS: { key: keyof ScenarioInputs; label: string; hint: string; kind: "pct" | "x" }[] = [
  { key: "revenueGrowthStart", label: "Crescita ricavi, anno 1", hint: "Crescita dei ricavi nel primo anno di proiezione", kind: "pct" },
  { key: "revenueGrowthEnd", label: "Crescita ricavi, ultimo anno", hint: "La crescita converge linearmente verso questo valore", kind: "pct" },
  { key: "fcfMarginStart", label: "Margine FCF, anno 1", hint: "Free cash flow / ricavi nel primo anno", kind: "pct" },
  { key: "fcfMarginEnd", label: "Margine FCF a regime", hint: "Il margine converge linearmente verso questo valore", kind: "pct" },
  { key: "shareChange", label: "Variazione annua n. azioni", hint: "Negativo = riacquisti netti; usato nel rendimento atteso", kind: "pct" },
  { key: "exitMultiple", label: "Multiplo d'uscita (P/FCF)", hint: "Multiplo a cui ipotizzi di poter vendere tra 5 anni; usato nel rendimento atteso", kind: "x" },
  { key: "probability", label: "Probabilità", hint: "Peso dello scenario nel valore medio ponderato", kind: "pct" },
];

export function ValuationTab({ bundle, analysis: a, refresh }: TabProps) {
  const { company } = bundle;
  const cur = company.currency;
  const price = company.price;
  const [inputs, setInputs] = useState<ValuationInputs | null>(a.valuationInputs);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const base = a.dcfBase;

  const results = useMemo(() => {
    if (!inputs || !base) return null;
    return Object.fromEntries(
      NAMES.map(({ key }) => [key, { dcf: dcf(base, inputs.scenarios[key], inputs), ret: price ? expectedReturn(base, price, inputs.scenarios[key], 5) : null }]),
    ) as Record<ScenarioName, { dcf: ReturnType<typeof dcf>; ret: ReturnType<typeof expectedReturn> }>;
  }, [inputs, base, price]);

  if (!a.snapshot || !inputs || !base || !results) {
    return <Empty title="Dati insufficienti per la valutazione">Servono almeno ricavi e numero di azioni dell&apos;ultimo periodo. Carica un 10-K o inseriscili nella scheda Bilanci.</Empty>;
  }
  const s = a.snapshot.values;
  const m = a.mult;
  const fcfMargin = a.snapMetrics?.fcf_margin;
  const histN = Math.min(3, a.annual.length - 1);
  const hist = histN > 0 ? cagr(a.annual[a.annual.length - 1 - histN].values.revenue, a.annual[a.annual.length - 1].values.revenue, histN) : undefined;
  const impliedG = price && fcfMargin && fcfMargin > 0 ? impliedGrowth(base, price, fcfMargin, inputs) : undefined;
  const impliedM = price ? impliedMargin(base, price, inputs.scenarios.base, inputs) : undefined;
  const probSum = NAMES.reduce((x, n) => x + inputs.scenarios[n.key].probability, 0);
  const weighted = NAMES.every((n) => results[n.key].dcf) && probSum > 0 ? NAMES.reduce((x, n) => x + results[n.key].dcf!.valuePerShare * inputs.scenarios[n.key].probability, 0) / probSum : undefined;
  const sens = sensitivity(base, inputs.scenarios.base, inputs);

  const setScenario = (name: ScenarioName, key: keyof ScenarioInputs, v: number) => {
    setInputs({ ...inputs, scenarios: { ...inputs.scenarios, [name]: { ...inputs.scenarios[name], [key]: v } } });
    setDirty(true);
  };
  const setGlobal = (key: "discountRate" | "terminalGrowth" | "years", v: number) => {
    setInputs({ ...inputs, [key]: v });
    setDirty(true);
  };
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/companies/${company.id}/valuation`, { method: "PUT", json: inputs });
      setDirty(false);
      refresh();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!confirm("Tornare alle ipotesi automatiche ricavate dalla storia?")) return;
    await api(`/api/companies/${company.id}/valuation`, { method: "DELETE" });
    setInputs(defaultValuationInputs(company.id, a.annual, s));
    setDirty(false);
    refresh();
  };
  const upside = (v: number | undefined) => (v !== undefined && price ? v / price - 1 : undefined);
  const baseProjection = results.base.dcf?.years.map((y) => ({ label: `A${y.year}`, fcf: y.fcf })) ?? [];

  return (
    <div className="space-y-4">
      {!price && <InfoBox tone="warn">Inserisci il prezzo dell&apos;azione (in alto a destra) per vedere multipli, reverse DCF e rendimento atteso.</InfoBox>}

      <Card title="Multipli attuali" hint={`Prezzo corrente sui dati ${a.snapshot.label}`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-6 gap-y-4">
          <Stat label="P/E" value={fmtX(m.pe)} sub={m.earningsYield !== undefined ? `rend. utili ${fmtPct(m.earningsYield)}` : undefined} />
          <Stat label="EV/EBITDA" value={fmtX(m.evEbitda)} />
          <Stat label="EV/EBIT" value={fmtX(m.evEbit)} />
          <Stat label="EV/Ricavi" value={fmtX(m.evSales)} />
          <Stat label="P/FCF" value={fmtX(m.pFcf)} sub={m.fcfYield !== undefined ? `FCF yield ${fmtPct(m.fcfYield)}` : undefined} />
          <Stat label="FCF yield netto SBC" value={fmtPct(m.fcfYieldAfterSbc)} title="Free cash flow meno compensi in azioni, sulla capitalizzazione" />
          <Stat label="P/B" value={fmtX(m.pb)} />
          <Stat label="Rend. agli azionisti" value={fmtPct(m.shareholderYield)} sub={m.dividendYield !== undefined ? `dividendo ${fmtPct(m.dividendYield)}` : undefined} title="Dividendi + riacquisti netti, sulla capitalizzazione" />
        </div>
      </Card>

      {price && (
        <Card title="Cosa sconta il prezzo (reverse DCF)" hint="Invece di stimare un valore, si parte dal prezzo e si ricava quali risultati futuri lo giustificano">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-ink-2">Crescita annua dei ricavi implicita per {inputs.years} anni</div>
              <div className="text-2xl font-semibold num mt-0.5">{impliedG !== undefined ? fmtPct(impliedG) : "–"}</div>
              <p className="text-sm text-ink-2 mt-1">
                {impliedG === undefined
                  ? "Non calcolabile: serve un free cash flow positivo."
                  : <>A margine FCF costante ({fmtPct(fcfMargin)}).{hist !== undefined && <> Negli ultimi {histN} anni i ricavi sono cresciuti del <b className="text-ink">{fmtPct(hist)}</b> l&apos;anno: il mercato sconta {impliedG > hist + 0.02 ? "un'accelerazione" : impliedG < hist - 0.02 ? "un rallentamento" : "una crescita simile"}.</>}</>}
              </p>
            </div>
            <div>
              <div className="text-xs text-ink-2">Margine FCF a regime implicito</div>
              <div className="text-2xl font-semibold num mt-0.5">{impliedM !== undefined ? fmtPct(impliedM) : "–"}</div>
              <p className="text-sm text-ink-2 mt-1">
                Con la crescita dello scenario base ({fmtPct(inputs.scenarios.base.revenueGrowthStart)} → {fmtPct(inputs.scenarios.base.revenueGrowthEnd)}), è il margine che l&apos;azienda deve raggiungere perché il prezzo sia corretto.
                {fcfMargin !== undefined && <> Oggi è al <b className="text-ink">{fmtPct(fcfMargin)}</b>.</>}
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card
        title="Scenari"
        hint={bundle.valuation && !dirty ? "Ipotesi salvate" : dirty ? "Modifiche non salvate" : "Ipotesi automatiche ricavate dalla storia: sono solo un punto di partenza, modificale"}
        action={
          <>
            {bundle.valuation && <Button size="sm" variant="ghost" onClick={reset}>Ripristina automatiche</Button>}
            <Button size="sm" variant="primary" onClick={save} disabled={!dirty || busy}>Salva ipotesi</Button>
          </>
        }
        pad={false}
      >
        <div className="px-4 pb-3 flex flex-wrap gap-x-6 gap-y-2 items-end">
          <NumField label="Tasso di sconto" kind="pct" value={inputs.discountRate} onChange={(v) => setGlobal("discountRate", v)} hint="Rendimento annuo che richiedi per questo investimento" />
          <NumField label="Crescita terminale" kind="pct" value={inputs.terminalGrowth} onChange={(v) => setGlobal("terminalGrowth", v)} hint="Crescita perpetua dopo il periodo esplicito (di norma 2-3%)" />
          <NumField label="Anni di proiezione" kind="int" value={inputs.years} onChange={(v) => setGlobal("years", Math.min(20, Math.max(3, Math.round(v))))} hint="Durata del periodo esplicito" />
          <div className="text-xs text-ink-2 pb-2">
            Base di partenza: ricavi {fmtMoney(base.revenue, cur)} ({a.snapshot.label}), {base.netDebt >= 0 ? "debito netto" : "cassa netta"} {fmtMoney(Math.abs(base.netDebt))}, {fmtMoney(base.shares)} azioni
          </div>
        </div>
        <ErrorBox>{err}</ErrorBox>
        {inputs.discountRate <= inputs.terminalGrowth && <div className="px-4 pb-3"><ErrorBox>Il tasso di sconto deve essere maggiore della crescita terminale.</ErrorBox></div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm num">
            <thead>
              <tr className="text-xs text-ink-2 border-y border-line [&>th]:font-medium [&>th]:px-4 [&>th]:py-2">
                <th className="text-left">Ipotesi</th>
                {NAMES.map((n) => <th key={n.key} className="text-right w-40">{n.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.key} className="border-b border-line">
                  <td className="px-4 py-1.5 text-left">{r.label}<Hint text={r.hint} /></td>
                  {NAMES.map((n) => (
                    <td key={n.key} className="px-4 py-1 text-right">
                      <NumInput kind={r.kind} value={inputs.scenarios[n.key][r.key]} onChange={(v) => setScenario(n.key, r.key, v)} label={`${r.label} — ${n.label}`} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-b border-line bg-surface-2 font-semibold">
                <td className="px-4 py-2 text-left">Valore DCF per azione</td>
                {NAMES.map((n) => <td key={n.key} className="px-4 py-2 text-right">{results[n.key].dcf ? fmtMoney(results[n.key].dcf!.valuePerShare, cur, 2) : "–"}</td>)}
              </tr>
              <tr className="border-b border-line">
                <td className="px-4 py-1.5 text-left">Scostamento dal prezzo</td>
                {NAMES.map((n) => {
                  const u = upside(results[n.key].dcf?.valuePerShare);
                  return <td key={n.key} className={cx("px-4 py-1.5 text-right", u !== undefined && (u >= 0 ? "text-good-text" : "text-critical-text"))}>{u !== undefined ? `${u >= 0 ? "▲ +" : "▼ "}${fmtPct(u, 0)}` : "–"}</td>;
                })}
              </tr>
              <tr className="border-b border-line">
                <td className="px-4 py-1.5 text-left">Quota del valore dal periodo terminale<Hint text="Se supera il 75-80% il valore dipende quasi tutto da ipotesi lontane nel tempo: trattalo con prudenza" /></td>
                {NAMES.map((n) => <td key={n.key} className="px-4 py-1.5 text-right">{results[n.key].dcf ? fmtPct(results[n.key].dcf!.terminalShare, 0) : "–"}</td>)}
              </tr>
              <tr className="border-b border-line">
                <td className="px-4 py-1.5 text-left">FCF per azione tra 5 anni</td>
                {NAMES.map((n) => <td key={n.key} className="px-4 py-1.5 text-right">{results[n.key].ret ? fmtMoney(results[n.key].ret!.fcfPerShareExit, cur, 2) : "–"}</td>)}
              </tr>
              <tr>
                <td className="px-4 py-2 text-left font-semibold">Rendimento annuo atteso a 5 anni<Hint text="FCF per azione tra 5 anni × multiplo d'uscita, rispetto al prezzo di oggi. Dividendi esclusi. Non dipende dal tasso di sconto." /></td>
                {NAMES.map((n) => {
                  const r = results[n.key].ret?.annualReturn;
                  return <td key={n.key} className={cx("px-4 py-2 text-right font-semibold", r !== undefined && (r >= inputs.discountRate ? "text-good-text" : r < 0 ? "text-critical-text" : ""))}>{r !== undefined ? fmtPct(r) : "–"}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-line flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-ink-2">Valore medio ponderato: </span>
            <b className="num">{weighted !== undefined ? fmtMoney(weighted, cur, 2) : "–"}</b>
            {upside(weighted) !== undefined && <span className={cx("ml-2 num", upside(weighted)! >= 0 ? "text-good-text" : "text-critical-text")}>{upside(weighted)! >= 0 ? "+" : ""}{fmtPct(upside(weighted), 0)} sul prezzo</span>}
          </div>
          {Math.abs(probSum - 1) > 0.005 && <Badge tone="warn">Le probabilità sommano a {fmtPct(probSum, 0)}: il valore è normalizzato</Badge>}
          {price && weighted !== undefined && (
            <div className="text-ink-2">
              Prezzo d&apos;acquisto con margine di sicurezza del 25%: <b className="text-ink num">{fmtMoney(weighted * 0.75, cur, 2)}</b>
            </div>
          )}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Sensibilità (scenario base)" hint="Valore per azione al variare di tasso di sconto e crescita terminale" pad={false}>
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full text-sm num">
              <thead>
                <tr className="text-xs text-ink-2">
                  <th className="text-left font-medium py-1.5">Sconto ↓ / Crescita term. →</th>
                  {sens.terminalGrowths.map((g) => <th key={g} className="text-right font-medium px-2">{fmtPct(g)}</th>)}
                </tr>
              </thead>
              <tbody>
                {sens.discountRates.map((dr, i) => (
                  <tr key={dr} className="border-t border-line">
                    <td className="text-left py-1.5 text-ink-2">{fmtPct(dr)}</td>
                    {sens.values[i].map((v, j) => {
                      const center = i === 2 && j === 2;
                      const above = v !== null && price !== undefined && v >= price;
                      return (
                        <td key={j} className={cx("text-right px-2 py-1.5", center && "font-semibold outline outline-1 outline-axis rounded", price !== undefined && v !== null && (above ? "bg-good-wash" : "bg-crit-wash"))} title={price && v !== null ? (above ? "Sopra il prezzo attuale" : "Sotto il prezzo attuale") : undefined}>
                          {v === null ? "–" : fmtNum(v, 2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {price && <p className="text-xs text-muted mt-2">Sfondo verde: valore sopra il prezzo attuale ({fmtNum(price, 2)}); rosso: sotto.</p>}
          </div>
        </Card>
        <Card title="Free cash flow proiettato (scenario base)" hint={results.base.dcf ? `Valore attuale dei flussi espliciti ${fmtMoney(results.base.dcf.pvExplicit)} + valore terminale ${fmtMoney(results.base.dcf.pvTerminal)} = EV ${fmtMoney(results.base.dcf.enterpriseValue)}` : undefined}>
          <Bars data={baseProjection} series={[{ key: "fcf", label: "Free cash flow" }]} height={210} />
        </Card>
      </div>
      <p className="text-xs text-muted">Strumento di analisi personale: i valori dipendono interamente dalle ipotesi inserite e non costituiscono una raccomandazione d&apos;investimento.</p>
    </div>
  );
}

function NumInput({ kind, value, onChange, label }: { kind: "pct" | "x" | "int"; value: number; onChange: (v: number) => void; label: string }) {
  const show = (v: number) => String(+(kind === "pct" ? v * 100 : v).toFixed(2)).replace(".", ",");
  const [text, setText] = useState(show(value));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setText(show(value));
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={text}
        aria-label={label}
        inputMode="decimal"
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value.replace(",", "."));
          if (e.target.value.trim() !== "" && Number.isFinite(n)) {
            const v = kind === "pct" ? n / 100 : n;
            setLast(v);
            onChange(v);
          }
        }}
        onBlur={() => setText(show(value))}
        className="w-20 h-7 text-right rounded border border-edge bg-surface px-1.5 text-sm num focus:outline-2 focus:outline-accent"
      />
      <span className="text-xs text-muted w-3 text-left">{kind === "pct" ? "%" : kind === "x" ? "x" : ""}</span>
    </span>
  );
}

function NumField({ label, hint, ...p }: { label: string; hint: string; kind: "pct" | "x" | "int"; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-2 font-medium">
      <span>{label}<Hint text={hint} /></span>
      <NumInput {...p} label={label} />
    </label>
  );
}
