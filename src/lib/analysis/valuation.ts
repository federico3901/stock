import type { ScenarioInputs, ValuationInputs } from "../types";
import { cagr, derive, div } from "./metrics";
import type { Values } from "./periods";

const ok = (v: number | undefined | null): v is number => typeof v === "number" && Number.isFinite(v);

export interface Multiples {
  marketCap?: number;
  enterpriseValue?: number;
  pe?: number;
  evEbitda?: number;
  evEbit?: number;
  evSales?: number;
  pFcf?: number;
  fcfYield?: number;
  earningsYield?: number;
  pb?: number;
  dividendYield?: number;
  buybackYield?: number;
  shareholderYield?: number;
  /** FCF al netto dei compensi in azioni / capitalizzazione */
  fcfYieldAfterSbc?: number;
}

/** Azioni da usare per la capitalizzazione: preferisce il dato puntuale di fine periodo. */
export function shareCount(v: Values): number | undefined {
  return v.shares_outstanding ?? v.shares_diluted ?? v.shares_basic;
}

/** Multipli di mercato sui dati dell'ultimo periodo (TTM o ultimo esercizio) al prezzo indicato. */
export function multiples(v: Values, price: number | undefined): Multiples {
  const shares = shareCount(v);
  if (!ok(price) || price <= 0 || !ok(shares) || shares <= 0) return {};
  const d = derive(v);
  const marketCap = price * shares;
  const enterpriseValue = marketCap + (d.netDebt ?? 0) + (v.minority_interest ?? 0);
  const pos = (x: number | undefined) => (ok(x) && x > 0 ? x : undefined);
  const out: Multiples = { marketCap, enterpriseValue };
  out.pe = div(marketCap, pos(v.net_income));
  out.evEbitda = div(enterpriseValue, pos(d.ebitda));
  out.evEbit = div(enterpriseValue, pos(v.operating_income));
  out.evSales = div(enterpriseValue, pos(v.revenue));
  out.pFcf = div(marketCap, pos(d.fcf));
  out.fcfYield = div(d.fcf, marketCap);
  out.earningsYield = div(v.net_income, marketCap);
  out.pb = div(marketCap, pos(v.total_equity));
  out.dividendYield = div(v.dividends_paid, marketCap);
  out.buybackYield = ok(v.buybacks) ? div(v.buybacks - (v.share_issuance ?? 0), marketCap) : undefined;
  if (ok(out.dividendYield) || ok(out.buybackYield)) out.shareholderYield = (out.dividendYield ?? 0) + (out.buybackYield ?? 0);
  if (ok(d.fcf) && ok(v.sbc)) out.fcfYieldAfterSbc = div(d.fcf - v.sbc, marketCap);
  return out;
}

export interface DcfBase {
  revenue: number;
  netDebt: number;
  shares: number;
  minorityInterest?: number;
}

export interface DcfYear {
  year: number;
  growth: number;
  revenue: number;
  fcfMargin: number;
  fcf: number;
  discountFactor: number;
  presentValue: number;
}

export interface DcfResult {
  years: DcfYear[];
  pvExplicit: number;
  terminalValue: number;
  pvTerminal: number;
  enterpriseValue: number;
  equityValue: number;
  valuePerShare: number;
  terminalShare: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * DCF a due stadi sul free cash flow: crescita dei ricavi e margine FCF convergono linearmente
 * dai valori iniziali a quelli finali lungo il periodo esplicito; poi valore terminale di Gordon.
 */
export function dcf(base: DcfBase, s: Pick<ScenarioInputs, "revenueGrowthStart" | "revenueGrowthEnd" | "fcfMarginStart" | "fcfMarginEnd">, p: { discountRate: number; terminalGrowth: number; years: number }): DcfResult | null {
  const n = Math.max(1, Math.round(p.years));
  if (!(p.discountRate > p.terminalGrowth) || !(base.shares > 0) || !(base.revenue > 0)) return null;
  const years: DcfYear[] = [];
  let revenue = base.revenue;
  let pvExplicit = 0;
  for (let i = 1; i <= n; i++) {
    const t = n === 1 ? 1 : (i - 1) / (n - 1);
    const g = lerp(s.revenueGrowthStart, s.revenueGrowthEnd, t);
    const margin = lerp(s.fcfMarginStart, s.fcfMarginEnd, t);
    revenue *= 1 + g;
    const fcf = revenue * margin;
    const discountFactor = 1 / Math.pow(1 + p.discountRate, i);
    const presentValue = fcf * discountFactor;
    pvExplicit += presentValue;
    years.push({ year: i, growth: g, revenue, fcfMargin: margin, fcf, discountFactor, presentValue });
  }
  const last = years[n - 1];
  const terminalValue = (last.fcf * (1 + p.terminalGrowth)) / (p.discountRate - p.terminalGrowth);
  const pvTerminal = terminalValue * last.discountFactor;
  const enterpriseValue = pvExplicit + pvTerminal;
  const equityValue = enterpriseValue - base.netDebt - (base.minorityInterest ?? 0);
  return {
    years,
    pvExplicit,
    terminalValue,
    pvTerminal,
    enterpriseValue,
    equityValue,
    valuePerShare: equityValue / base.shares,
    terminalShare: enterpriseValue !== 0 ? pvTerminal / enterpriseValue : 0,
  };
}

/** Ricerca per bisezione di x in [lo, hi] tale che f(x) = target, con f monotona crescente. */
function bisect(f: (x: number) => number, target: number, lo: number, hi: number): number | undefined {
  let flo = f(lo) - target;
  const fhi = f(hi) - target;
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return undefined;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid) - target;
    if (Math.abs(fm) < 1e-9 * Math.max(1, Math.abs(target))) return mid;
    if (flo * fm <= 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Reverse DCF: quale crescita annua dei ricavi (costante per il periodo esplicito, a margine FCF dato)
 * giustifica il prezzo attuale? È la domanda "cosa sta scontando il mercato?".
 */
export function impliedGrowth(base: DcfBase, price: number, fcfMargin: number, p: { discountRate: number; terminalGrowth: number; years: number }): number | undefined {
  if (!(price > 0) || !(fcfMargin > 0)) return undefined;
  const f = (g: number) =>
    dcf(base, { revenueGrowthStart: g, revenueGrowthEnd: g, fcfMarginStart: fcfMargin, fcfMarginEnd: fcfMargin }, p)?.valuePerShare ?? NaN;
  return bisect(f, price, -0.5, 1.5);
}

/** Reverse DCF sul margine: a crescita data, quale margine FCF a regime giustifica il prezzo? */
export function impliedMargin(base: DcfBase, price: number, s: Pick<ScenarioInputs, "revenueGrowthStart" | "revenueGrowthEnd" | "fcfMarginStart">, p: { discountRate: number; terminalGrowth: number; years: number }): number | undefined {
  if (!(price > 0)) return undefined;
  const f = (m: number) => dcf(base, { ...s, fcfMarginEnd: m }, p)?.valuePerShare ?? NaN;
  return bisect(f, price, -0.5, 0.95);
}

export interface ExpectedReturn {
  fcfPerShareExit: number;
  exitPrice: number;
  /** rendimento annuo composto dal prezzo attuale al prezzo d'uscita (dividendi esclusi) */
  annualReturn: number;
}

/**
 * Rendimento atteso con multiplo d'uscita: FCF per azione all'anno N × multiplo P/FCF, contro il prezzo di oggi.
 * Più intuitivo del DCF perché non dipende dal tasso di sconto.
 */
export function expectedReturn(base: DcfBase, price: number, s: ScenarioInputs, years: number): ExpectedReturn | null {
  const r = dcf(base, s, { discountRate: 0.1, terminalGrowth: 0, years });
  if (!r || !(price > 0)) return null;
  const n = r.years.length;
  const sharesExit = base.shares * Math.pow(1 + s.shareChange, n);
  if (!(sharesExit > 0)) return null;
  const fcfPerShareExit = r.years[n - 1].fcf / sharesExit;
  const exitPrice = fcfPerShareExit * s.exitMultiple;
  if (!(exitPrice > 0)) return { fcfPerShareExit, exitPrice, annualReturn: -1 };
  return { fcfPerShareExit, exitPrice, annualReturn: Math.pow(exitPrice / price, 1 / n) - 1 };
}

export interface SensitivityTable {
  discountRates: number[];
  terminalGrowths: number[];
  /** values[i][j] = valore per azione con discountRates[i] e terminalGrowths[j] */
  values: (number | null)[][];
}

export function sensitivity(base: DcfBase, s: ScenarioInputs, p: { discountRate: number; terminalGrowth: number; years: number }): SensitivityTable {
  const discountRates = [-0.02, -0.01, 0, 0.01, 0.02].map((d) => +(p.discountRate + d).toFixed(4));
  const terminalGrowths = [-0.01, -0.005, 0, 0.005, 0.01].map((d) => +(p.terminalGrowth + d).toFixed(4));
  const values = discountRates.map((dr) =>
    terminalGrowths.map((tg) => dcf(base, s, { discountRate: dr, terminalGrowth: tg, years: p.years })?.valuePerShare ?? null),
  );
  return { discountRates, terminalGrowths, values };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, step: number) => Math.round(v / step) * step;

/**
 * Ipotesi iniziali ricavate dalla storia dell'azienda, come punto di partenza da modificare:
 * la crescita parte da quella recente e converge verso il 3-4%; il margine FCF parte da quello attuale.
 */
export function defaultValuationInputs(companyId: string, annual: { values: Values }[], snapshot: Values): ValuationInputs {
  const revs = annual.map((a) => a.values.revenue).filter(ok);
  const n = Math.min(3, revs.length - 1);
  const hist = n > 0 ? cagr(revs[revs.length - 1 - n], revs[revs.length - 1], n) : undefined;
  const g0 = round(clamp(hist ?? 0.06, -0.05, 0.35), 0.005);
  const d = derive(snapshot);
  const m0 = round(clamp(div(d.fcf, snapshot.revenue) ?? 0.1, 0.01, 0.5), 0.005);
  const pFcf = 18;
  const mk = (gAdj: number, mAdj: number, mult: number, probability: number): ScenarioInputs => ({
    revenueGrowthStart: +(g0 + gAdj).toFixed(4),
    revenueGrowthEnd: +clamp(0.035 + gAdj / 2, 0, 0.08).toFixed(4),
    fcfMarginStart: m0,
    fcfMarginEnd: +clamp(m0 + mAdj, 0.01, 0.6).toFixed(4),
    shareChange: 0,
    exitMultiple: mult,
    probability,
  });
  return {
    id: companyId,
    companyId,
    scenarios: {
      bear: mk(-0.04, -0.03, pFcf - 5, 0.25),
      base: mk(0, 0, pFcf, 0.5),
      bull: mk(0.03, 0.03, pFcf + 6, 0.25),
    },
    discountRate: 0.09,
    terminalGrowth: 0.025,
    years: 10,
    updatedAt: new Date().toISOString(),
  };
}

export function dcfBaseFrom(v: Values): DcfBase | null {
  const shares = shareCount(v);
  if (!ok(v.revenue) || v.revenue <= 0 || !ok(shares) || shares <= 0) return null;
  return { revenue: v.revenue, netDebt: derive(v).netDebt ?? 0, shares, minorityInterest: v.minority_interest };
}
