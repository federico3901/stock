import type { CustomMetric, FinancialPeriod, FiscalPeriod, GuidanceItem, GuidanceMetric } from "../types";
import { computeMetrics, derive } from "./metrics";
import { quarterlySeries, sortPeriods, type Values } from "./periods";

const ok = (v: number | undefined | null): v is number => typeof v === "number" && Number.isFinite(v);

export type GuidanceOutcome = "superata" | "in linea" | "mancata" | "in attesa" | "non confrontabile";

export interface GuidanceEvaluation {
  item: GuidanceItem;
  actual?: number;
  /** da dove viene il dato effettivo: il valore pubblicato dalla società (stessa definizione della guidance) o il bilancio standardizzato */
  actualSource?: "pubblicato" | "bilancio";
  midpoint?: number;
  /** scostamento del dato effettivo dal punto medio, in % del punto medio (o in punti percentuali per i margini) */
  surprise?: number;
  outcome: GuidanceOutcome;
  /** revisione rispetto alla guidance precedente sulla stessa metrica e periodo */
  revision?: "alzata" | "abbassata" | "confermata" | "ristretta" | "prima indicazione";
  revisionDelta?: number;
}

/** Valore effettivo corrispondente a una metrica di guidance (su dati GAAP). */
export function actualFor(metric: GuidanceMetric, cur: Values, yearAgo?: Values): number | undefined {
  const d = derive(cur);
  const m = computeMetrics({ cur, yearAgo });
  switch (metric) {
    case "revenue": return cur.revenue;
    case "revenue_growth": return m.revenue_growth;
    case "gross_margin": return m.gross_margin;
    case "operating_income": return cur.operating_income;
    case "operating_margin": return m.operating_margin;
    case "net_income": return cur.net_income;
    case "eps_diluted": return cur.eps_diluted;
    case "ebitda": return d.ebitda;
    case "cfo": return cur.cfo;
    case "fcf": return d.fcf;
    case "capex": return cur.capex;
    case "tax_rate": return m.tax_rate;
    default: return undefined;
  }
}

const isRatio = (m: GuidanceMetric) => m === "revenue_growth" || m === "gross_margin" || m === "operating_margin" || m === "tax_rate";

function findPeriod(periods: FinancialPeriod[], fy: number, fp: FiscalPeriod): FinancialPeriod | undefined {
  const direct = periods.find((p) => p.fiscalYear === fy && p.fiscalPeriod === fp);
  if (direct && !["Q2", "Q3", "Q4"].includes(fp)) return direct;
  if (fp.startsWith("Q")) return quarterlySeries(periods).find((p) => p.fiscalYear === fy && p.fiscalPeriod === fp) ?? direct;
  return direct;
}

/**
 * Confronta ogni guidance con il dato effettivo (se il periodo è già stato caricato) e con la guidance
 * precedente sulla stessa metrica/periodo, per ricostruire la storia delle revisioni.
 */
const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Dato pubblicato dalla società con la stessa etichetta della guidance (es. "EBITA", "Adjusted EBITDA", "FOCF").
 * Serve per le misure rettificate, che non si possono confrontare con il bilancio standardizzato.
 */
export function reportedFor(item: GuidanceItem, reported: CustomMetric[]): number | undefined {
  const l = norm(item.label);
  if (!l) return undefined;
  // per ricavi e utile la società può usare un nome diverso dall'etichetta della guidance
  const alias = item.nonGaap ? [] : (REPORTED_ALIASES[item.metric] ?? []);
  const exact = reported.find(
    (c) => c.category === "kpi" && c.fiscalYear === item.targetFiscalYear && c.fiscalPeriod === item.targetPeriod && alias.includes(norm(c.name)) && (l === "ricavi" || l === "utile netto" || l === "risultato netto"),
  );
  if (exact) return exact.value;
  const hit = reported.find(
    (c) =>
      c.category === "kpi" &&
      c.fiscalYear === item.targetFiscalYear &&
      c.fiscalPeriod === item.targetPeriod &&
      ((n) => n === l || n === `${l} di gruppo` || n.startsWith(`${l} (`))(norm(c.name)),
  );
  return hit?.value;
}

const REPORTED_ALIASES: Partial<Record<GuidanceMetric, string[]>> = {
  revenue: ["ricavi", "ricavi di gruppo", "ricavi e proventi", "ricavi consolidati"],
  net_income: ["risultato netto", "utile netto", "utile netto di gruppo", "utile netto attribuibile agli azionisti"],
};

/** Misure per cui un valore più basso è il risultato migliore. */
const lowerIsBetter = (label: string) => /indebitamento|debito|debt|leva|care ratio|cost ratio/i.test(label);

export function evaluateGuidance(items: GuidanceItem[], periods: FinancialPeriod[], reported: CustomMetric[] = []): GuidanceEvaluation[] {
  const sorted = [...items].sort((a, b) => a.issuedDate.localeCompare(b.issuedDate) || a.createdAt.localeCompare(b.createdAt));
  const lastByKey = new Map<string, GuidanceItem>();
  const out: GuidanceEvaluation[] = [];
  for (const item of sorted) {
    const ev: GuidanceEvaluation = { item, outcome: "in attesa" };
    const lo = item.low ?? item.high;
    const hi = item.high ?? item.low;
    if (ok(lo) && ok(hi)) ev.midpoint = (lo + hi) / 2;

    // revisione rispetto all'indicazione precedente
    const key = `${item.metric}|${norm(item.label)}|${item.nonGaap}|${item.targetFiscalYear}|${item.targetPeriod}`;
    const before = lastByKey.get(key);
    if (!item.qualitative && ok(ev.midpoint)) {
      if (!before) ev.revision = "prima indicazione";
      else {
        const bLo = before.low ?? before.high;
        const bHi = before.high ?? before.low;
        if (ok(bLo) && ok(bHi)) {
          const bMid = (bLo + bHi) / 2;
          const delta = isRatio(item.metric) || bMid === 0 ? ev.midpoint - bMid : ev.midpoint / bMid - 1;
          ev.revisionDelta = delta;
          const eps = isRatio(item.metric) ? 0.0005 : 0.001;
          if (delta > eps) ev.revision = "alzata";
          else if (delta < -eps) ev.revision = "abbassata";
          else if (hi! - lo! < bHi - bLo - 1e-9) ev.revision = "ristretta";
          else ev.revision = "confermata";
        }
      }
      lastByKey.set(key, item);
    }

    // confronto con il dato effettivo: prima il valore pubblicato dalla società con la stessa definizione,
    // poi il bilancio, ma solo per le misure contabili (una misura rettificata non si confronta col bilancio)
    if (item.qualitative || !ok(ev.midpoint)) {
      ev.outcome = item.qualitative ? "non confrontabile" : "in attesa";
    } else {
      const ratio = isRatio(item.metric) || item.unit === "percent";
      let actual = reportedFor(item, reported);
      if (ok(actual)) ev.actualSource = "pubblicato";
      else if (item.metric !== "other" && !item.nonGaap) {
        const p = findPeriod(periods, item.targetFiscalYear, item.targetPeriod);
        if (p) {
          const series = item.targetPeriod.startsWith("Q") ? quarterlySeries(periods) : sortPeriods(periods);
          const ya = series.find((x) => x.fiscalYear === item.targetFiscalYear - 1 && x.fiscalPeriod === item.targetPeriod);
          actual = actualFor(item.metric, p.values, ya?.values);
          if (ok(actual)) ev.actualSource = "bilancio";
        }
      }
      if (ok(actual)) {
        ev.actual = actual;
        ev.surprise = ratio || ev.midpoint === 0 ? actual - ev.midpoint : actual / ev.midpoint - 1;
        // un valore puntuale ("circa X") ammette uno scarto più largo di un intervallo dichiarato
        const tol = ratio ? 0.001 : Math.abs(ev.midpoint) * (lo === hi && item.low !== undefined && item.high !== undefined ? 0.02 : 0.002);
        const inv = lowerIsBetter(item.label);
        if (actual > hi! + tol) ev.outcome = inv ? "mancata" : "superata";
        else if (item.low !== undefined && actual < lo! - tol) ev.outcome = inv ? "superata" : "mancata";
        else ev.outcome = "in linea";
      } else if (item.metric === "other" || item.nonGaap) {
        // esercizio già chiuso ma nessun dato pubblicato con questa definizione
        const closed = periods.some((x) => x.fiscalYear === item.targetFiscalYear && x.fiscalPeriod === "FY");
        ev.outcome = closed ? "non confrontabile" : "in attesa";
      }
    }
    out.push(ev);
  }
  return out;
}

export interface CredibilityScore {
  evaluated: number;
  beat: number;
  inline: number;
  miss: number;
  /** quota di guidance rispettate o superate */
  hitRate?: number;
  /** scostamento medio dal punto medio (solo metriche in valuta/per azione) */
  avgSurprise?: number;
  raised: number;
  lowered: number;
  verdict: string;
}

/**
 * Affidabilità del management: quante volte ha rispettato o superato la propria guidance, e con quale margine.
 * La guidance non-GAAP è confrontata coi dati GAAP caricati: lo scostamento può riflettere le rettifiche.
 */
export function credibility(evals: GuidanceEvaluation[]): CredibilityScore {
  // per ogni metrica/periodo conta solo l'ultima guidance prima del risultato
  const finalByKey = new Map<string, GuidanceEvaluation>();
  for (const e of evals) {
    if (!ok(e.actual)) continue;
    const key = `${e.item.metric}|${e.item.nonGaap}|${e.item.targetFiscalYear}|${e.item.targetPeriod}`;
    finalByKey.set(key, e);
  }
  const finals = [...finalByKey.values()];
  const count = (o: GuidanceOutcome) => finals.filter((e) => e.outcome === o).length;
  const beat = count("superata");
  const inline = count("in linea");
  const miss = count("mancata");
  const evaluated = beat + inline + miss;
  const surprises = finals.filter((e) => ok(e.surprise) && !isRatio(e.item.metric) && e.item.metric !== "capex").map((e) => e.surprise!);
  const hitRate = evaluated ? (beat + inline) / evaluated : undefined;
  let verdict = "Dati insufficienti: servono guidance e risultati dello stesso periodo.";
  if (evaluated >= 3 && ok(hitRate)) {
    if (hitRate >= 0.85 && beat >= inline) verdict = "Management prudente: tende a promettere meno di quanto consegna.";
    else if (hitRate >= 0.75) verdict = "Management affidabile: la guidance viene generalmente rispettata.";
    else if (hitRate >= 0.5) verdict = "Affidabilità discontinua: guidance mancata con una certa frequenza.";
    else verdict = "Management poco affidabile: la guidance viene spesso mancata.";
  } else if (evaluated > 0) {
    verdict = "Campione ridotto: giudizio ancora poco significativo.";
  }
  return {
    evaluated,
    beat,
    inline,
    miss,
    hitRate,
    avgSurprise: surprises.length ? surprises.reduce((a, b) => a + b, 0) / surprises.length : undefined,
    raised: evals.filter((e) => e.revision === "alzata").length,
    lowered: evals.filter((e) => e.revision === "abbassata").length,
    verdict,
  };
}

/** Guidance ancora aperte (periodo obiettivo non ancora caricato): è ciò che il mercato aspetta. */
export function openGuidance(evals: GuidanceEvaluation[]): GuidanceEvaluation[] {
  const latest = new Map<string, GuidanceEvaluation>();
  for (const e of evals) {
    if (ok(e.actual)) continue;
    const key = `${e.item.metric}|${e.item.label.toLowerCase()}|${e.item.targetFiscalYear}|${e.item.targetPeriod}`;
    latest.set(key, e);
  }
  // esclude le metriche per cui esiste già un dato effettivo nello stesso periodo
  // solo i periodi non ancora chiusi, dal più vicino; a parità di periodo prima le indicazioni numeriche più recenti
  return [...latest.values()]
    .filter((e) => e.outcome === "in attesa")
    .sort((x, y) => x.item.targetFiscalYear - y.item.targetFiscalYear || y.item.issuedDate.localeCompare(x.item.issuedDate));
}
