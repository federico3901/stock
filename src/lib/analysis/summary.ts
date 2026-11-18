// Vista d'insieme calcolata una volta sola per tutta la pagina azienda,
// più le "conclusioni automatiche": frasi deterministiche ricavate dai numeri.

import type { CompanyBundle } from "../repo";
import { fmtMoney, fmtPct, fmtX } from "../format";
import { credibility, evaluateGuidance, openGuidance } from "./guidance";
import { cagr, computeMetrics, computeSeriesMetrics, derive } from "./metrics";
import { annualSeries, latestSnapshot, periodLabel, quarterlySeries, ttm, ttmFromHalves, ttmQuarters } from "./periods";
import { altmanZ, beneishM, piotroski, redFlags } from "./quality";
import { halfBrief, quarterBrief } from "./quarter";
import { evaluateChecks, thesisSummary } from "./thesis";
import { dcf, dcfBaseFrom, defaultValuationInputs, impliedGrowth, multiples } from "./valuation";

export function analyze(b: CompanyBundle) {
  const annual = annualSeries(b.periods);
  const quarters = quarterlySeries(b.periods);
  const annualMetrics = computeSeriesMetrics(annual, { months: 12 });
  const quarterMetrics = computeSeriesMetrics(quarters, { months: 3 });
  const snapshot = latestSnapshot(b.periods);
  const trailing = ttm(ttmQuarters(quarters)) ?? ttmFromHalves(b.periods);
  const lastFy = annual[annual.length - 1];
  const prevFy = annual[annual.length - 2];
  // metriche "a oggi": sul TTM se c'è, confrontato con l'ultimo esercizio
  const snapMetrics = snapshot
    ? snapshot.isTtm
      ? computeMetrics({ cur: snapshot.values, prev: lastFy?.values, yearAgo: ttmYearAgo(ttmQuarters(quarters)) ?? ttmFromHalves(b.periods, 1)?.values })
      : annualMetrics[annualMetrics.length - 1]
    : undefined;
  const mult = snapshot ? multiples(snapshot.values, b.company.price) : {};
  const flags = redFlags(annual.map((a) => ({ label: periodLabel(a), values: a.values })));
  const pio = lastFy && prevFy ? piotroski(lastFy.values, prevFy.values) : null;
  const altman = lastFy ? altmanZ(lastFy.values, b.company.price ? multiples(lastFy.values, b.company.price).marketCap : undefined) : null;
  const beneish = lastFy && prevFy ? beneishM(lastFy.values, prevFy.values) : null;
  const guidanceEvals = evaluateGuidance(b.guidance, b.periods);
  const cred = credibility(guidanceEvals);
  const open = openGuidance(guidanceEvals);
  const valuationInputs = snapshot ? (b.valuation ?? defaultValuationInputs(b.company.id, annual, snapshot.values)) : null;
  const dcfBase = snapshot ? dcfBaseFrom(snapshot.values) : null;
  // la tesi si verifica sui dati "a oggi", confrontati con l'ultimo esercizio chiuso (o col precedente)
  const checks = evaluateChecks(b.checks ?? [], snapMetrics, snapshot?.isTtm ? annualMetrics[annualMetrics.length - 1] : annualMetrics[annualMetrics.length - 2]);
  const quarter = quarterBrief(quarters) ?? halfBrief(b.periods);
  return { checks, quarter, annual, quarters, annualMetrics, quarterMetrics, snapshot, trailing, snapMetrics, lastFy, prevFy, mult, flags, pio, altman, beneish, guidanceEvals, cred, open, valuationInputs, dcfBase };
}

export type Analysis = ReturnType<typeof analyze>;

/** Somma dei 4 trimestri che precedono l'attuale TTM (per la crescita TTM su TTM). */
function ttmYearAgo(quarters: ReturnType<typeof quarterlySeries>) {
  if (quarters.length < 8) return undefined;
  return ttm(quarters.slice(0, -4))?.values;
}

export interface Takeaway {
  tone: "good" | "bad" | "neutral";
  text: string;
}

/** Conclusioni automatiche in linguaggio naturale: cosa dicono i numeri, senza usare il modello. */
export function takeaways(b: CompanyBundle, a: Analysis): Takeaway[] {
  const out: Takeaway[] = [];
  const push = (tone: Takeaway["tone"], text: string) => out.push({ tone, text });
  const { annual, annualMetrics } = a;
  if (annual.length >= 2) {
    const n = Math.min(annual.length - 1, 5);
    const first = annual[annual.length - 1 - n];
    const last = annual[annual.length - 1];
    const g = cagr(first.values.revenue, last.values.revenue, n);
    const mFirst = annualMetrics[annualMetrics.length - 1 - n];
    const mLast = annualMetrics[annualMetrics.length - 1];
    if (g !== undefined) {
      const lastG = mLast.revenue_growth;
      let t = `Ricavi cresciuti del ${fmtPct(g)} ${n === 1 ? "nell'ultimo esercizio" : `l'anno negli ultimi ${n} anni`}`;
      if (lastG !== undefined && n > 1) t += lastG > g + 0.02 ? `, in accelerazione nell'ultimo esercizio (${fmtPct(lastG)})` : lastG < g - 0.02 ? `, in rallentamento nell'ultimo esercizio (${fmtPct(lastG)})` : "";
      push(g > 0.08 ? "good" : g < 0 ? "bad" : "neutral", t + ".");
    }
    if (mFirst.operating_margin !== undefined && mLast.operating_margin !== undefined) {
      const d = mLast.operating_margin - mFirst.operating_margin;
      const pts = `${(Math.abs(d) * 100).toFixed(1).replace(".", ",")} punti`;
      if (Math.abs(d) >= 0.01) push(d > 0 ? "good" : "bad", `Margine operativo ${d > 0 ? "salito" : "sceso"} di ${pts}, dal ${fmtPct(mFirst.operating_margin)} al ${fmtPct(mLast.operating_margin)}: ${d > 0 ? "c'è leva operativa" : "i costi crescono più dei ricavi"}.`);
      else push("neutral", `Margine operativo stabile intorno al ${fmtPct(mLast.operating_margin)}.`);
    }
    if (mLast.roic !== undefined) {
      push(mLast.roic > 0.15 ? "good" : mLast.roic < 0.07 ? "bad" : "neutral", `ROIC al ${fmtPct(mLast.roic)}: ${mLast.roic > 0.15 ? "il business crea valore ben sopra il costo del capitale" : mLast.roic < 0.07 ? "rendimento sul capitale probabilmente sotto il costo del capitale" : "rendimento sul capitale discreto"}.`);
    }
    const convs = annualMetrics.slice(-3).map((m) => m.fcf_conversion).filter((v): v is number => v !== undefined);
    if (convs.length) {
      const avg = convs.reduce((x, y) => x + y, 0) / convs.length;
      push(avg >= 0.9 ? "good" : avg < 0.7 ? "bad" : "neutral", `In media il ${fmtPct(avg, 0)} dell'utile netto si trasforma in free cash flow (ultimi ${convs.length} esercizi)${avg < 0.7 ? ": utili poco sostenuti dalla cassa" : ""}.`);
    }
    if (mLast.net_debt_to_ebitda !== undefined) {
      const nd = mLast.net_debt_to_ebitda;
      push(nd < 1 ? "good" : nd > 3 ? "bad" : "neutral", nd < 0 ? `Bilancio con cassa netta (${fmtMoney(-(derive(last.values).netDebt ?? 0), b.company.currency)}).` : `Debito netto pari a ${fmtX(nd)} l'EBITDA.`);
    }
    if (mLast.share_count_change !== undefined && Math.abs(mLast.share_count_change) > 0.01) {
      push(mLast.share_count_change < 0 ? "good" : "bad", `Numero di azioni ${mLast.share_count_change < 0 ? "ridotto" : "aumentato"} del ${fmtPct(Math.abs(mLast.share_count_change))} nell'ultimo esercizio.`);
    }
  }
  if (a.snapshot && a.dcfBase && a.valuationInputs && b.company.price) {
    const fm = a.snapMetrics?.fcf_margin;
    if (fm !== undefined && fm > 0) {
      const g = impliedGrowth(a.dcfBase, b.company.price, fm, a.valuationInputs);
      const hist = a.annual.length >= 3 ? cagr(a.annual[Math.max(0, a.annual.length - 4)].values.revenue, a.annual[a.annual.length - 1].values.revenue, Math.min(3, a.annual.length - 1)) : undefined;
      if (g !== undefined) {
        let t = `Al prezzo attuale il mercato sconta una crescita dei ricavi di circa il ${fmtPct(g)} l'anno per ${a.valuationInputs.years} anni (a margine FCF costante)`;
        if (hist !== undefined) t += `, contro il ${fmtPct(hist)} realizzato di recente`;
        push(hist !== undefined && g < hist - 0.03 ? "good" : hist !== undefined && g > hist + 0.03 ? "bad" : "neutral", t + ".");
      }
    }
    const base = dcf(a.dcfBase, a.valuationInputs.scenarios.base, a.valuationInputs);
    if (base) {
      const up = base.valuePerShare / b.company.price - 1;
      push(up > 0.15 ? "good" : up < -0.15 ? "bad" : "neutral", `Scenario base del DCF: ${fmtMoney(base.valuePerShare, b.company.currency, 2)} per azione, ${up >= 0 ? "+" : ""}${fmtPct(up, 0)} rispetto al prezzo${b.valuation ? "" : " (ipotesi automatiche: rivedile nella scheda Valutazione)"}.`);
    }
  }
  if (a.cred.evaluated >= 2) {
    push(a.cred.hitRate !== undefined && a.cred.hitRate >= 0.75 ? "good" : "bad", `Guidance: ${a.cred.beat + a.cred.inline} obiettivi su ${a.cred.evaluated} rispettati o superati. ${a.cred.verdict}`);
  }
  const high = a.flags.filter((f) => f.severity === "alta");
  if (high.length) push("bad", `${high.length} ${high.length === 1 ? "segnale" : "segnali"} di attenzione ad alta priorità: ${high.map((f) => f.title.toLowerCase()).join("; ")}.`);
  if (a.checks.length) {
    const t = thesisSummary(a.checks);
    const known = t.ok + t.broken;
    if (known) {
      const broken = a.checks.filter((c) => c.status === "violata").map((c) => c.label);
      push(t.broken ? "bad" : "good", t.broken
        ? `Tesi: ${t.broken} ${t.broken === 1 ? "condizione non è più rispettata" : "condizioni non sono più rispettate"} su ${known} (${broken.join(", ")}).`
        : `Tesi: tutte le ${known === 1 ? "condizioni verificabili sono rispettate (1)" : `${known} condizioni verificabili sono rispettate`}${t.atRisk ? `, ma ${t.atRisk} ${t.atRisk === 1 ? "si sta avvicinando" : "si stanno avvicinando"} alla soglia` : ""}.`);
    }
  }
  return out;
}

export interface Todo {
  text: string;
  tab?: string;
}

/** Cosa manca per un'analisi completa. */
export function dataGaps(b: CompanyBundle, a: Analysis): Todo[] {
  const out: Todo[] = [];
  if (!b.documents.length) out.push({ text: "Carica il primo documento (l'ultimo 10-K è il punto di partenza migliore).", tab: "documenti" });
  const pending = b.documents.filter((d) => d.pageCount > 0 && (!d.passes.financials || d.passes.financials.status !== "done")).length;
  if (pending) out.push({ text: `${pending} ${pending === 1 ? "documento non ancora analizzato" : "documenti non ancora analizzati"}.`, tab: "documenti" });
  if (b.documents.length && a.annual.length < 3) out.push({ text: `Solo ${a.annual.length} ${a.annual.length === 1 ? "esercizio annuale" : "esercizi annuali"}: servono almeno 4-5 anni di storia per vedere le tendenze.`, tab: "bilanci" });
  if (a.annual.length && !b.company.price) out.push({ text: "Inserisci il prezzo dell'azione per calcolare multipli e valutazione." });
  if (a.annual.length && !a.trailing) out.push({ text: "Mancano i dati infrannuali: l'analisi si ferma all'ultimo esercizio chiuso.", tab: "bilanci" });
  if (b.documents.length && !b.guidance.length) out.push({ text: "Nessuna guidance registrata: puoi aggiungerla a mano nella scheda Guidance.", tab: "guidance" });
  if (a.annual.length && !b.valuation) out.push({ text: "Rivedi le ipotesi di valutazione: quelle attuali sono automatiche.", tab: "valutazione" });
  if (b.documents.length && !b.notes.some((n) => n.kind === "tesi")) out.push({ text: "Scrivi la tua tesi d'investimento, per poterla verificare a ogni trimestrale.", tab: "note" });
  return out;
}
