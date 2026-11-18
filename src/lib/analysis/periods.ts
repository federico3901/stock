import { FIELD_KEYS, isAdditive, isStock, type FieldKey } from "../fields";
import type { FinancialPeriod, FiscalPeriod } from "../types";

export type Values = Partial<Record<FieldKey, number>>;

export const periodId = (companyId: string, fy: number, fp: FiscalPeriod) => `${companyId}_${fy}_${fp}`;

export const periodLabel = (p: { fiscalYear: number; fiscalPeriod: FiscalPeriod | "TTM" }) =>
  p.fiscalPeriod === "FY" ? `FY${p.fiscalYear}` : p.fiscalPeriod === "TTM" ? "TTM" : `${p.fiscalPeriod} ${p.fiscalYear}`;

const ORDER: Record<FiscalPeriod, number> = { Q1: 1, H1: 2, Q2: 2.5, "9M": 3, Q3: 3.5, Q4: 4, FY: 5 };

export function sortPeriods<T extends { fiscalYear: number; fiscalPeriod: FiscalPeriod }>(ps: T[]): T[] {
  return [...ps].sort((a, b) => a.fiscalYear - b.fiscalYear || ORDER[a.fiscalPeriod] - ORDER[b.fiscalPeriod]);
}

/** Esercizi annuali in ordine cronologico. */
export function annualSeries(periods: FinancialPeriod[]): FinancialPeriod[] {
  return sortPeriods(periods.filter((p) => p.fiscalPeriod === "FY"));
}

const num = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);

function sub(a: number | undefined, ...rest: (number | undefined)[]): number | undefined {
  if (!num(a)) return undefined;
  let out = a;
  for (const r of rest) {
    if (!num(r)) return undefined;
    out -= r;
  }
  return out;
}

/**
 * Trimestri "discreti" in ordine cronologico.
 * I 10-Q riportano il rendiconto finanziario solo cumulato (YTD) e il 10-K solo l'anno intero:
 * i trimestri mancanti si ricavano per differenza, voce per voce
 * (Q2 = H1 − Q1, Q3 = 9M − H1, Q4 = FY − 9M).
 */
export function quarterlySeries(periods: FinancialPeriod[]): FinancialPeriod[] {
  const byYear = new Map<number, Partial<Record<FiscalPeriod, FinancialPeriod>>>();
  for (const p of periods) {
    if (!byYear.has(p.fiscalYear)) byYear.set(p.fiscalYear, {});
    byYear.get(p.fiscalYear)![p.fiscalPeriod] = p;
  }
  const out: FinancialPeriod[] = [];
  for (const [fy, y] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    const flow: Record<"Q1" | "Q2" | "Q3" | "Q4", Values> = { Q1: {}, Q2: {}, Q3: {}, Q4: {} };
    const derivedAny = { Q1: false, Q2: false, Q3: false, Q4: false };
    for (const k of FIELD_KEYS) {
      const v = (fp: FiscalPeriod) => y[fp]?.values[k];
      if (isStock(k)) {
        flow.Q1[k] = v("Q1");
        flow.Q2[k] = v("Q2") ?? v("H1");
        flow.Q3[k] = v("Q3") ?? v("9M");
        flow.Q4[k] = v("Q4") ?? v("FY");
        continue;
      }
      if (!isAdditive(k)) {
        // medie (azioni): si usa il dato del trimestre o, in mancanza, quello del cumulato
        flow.Q1[k] = v("Q1");
        flow.Q2[k] = v("Q2") ?? v("H1");
        flow.Q3[k] = v("Q3") ?? v("9M");
        flow.Q4[k] = v("Q4") ?? v("FY");
        continue;
      }
      const q1 = v("Q1");
      let q2 = v("Q2");
      if (!num(q2)) {
        q2 = sub(v("H1"), q1);
        if (num(q2)) derivedAny.Q2 = true;
      }
      let q3 = v("Q3");
      if (!num(q3)) {
        q3 = sub(v("9M"), v("H1")) ?? sub(v("9M"), q1, q2);
        if (num(q3)) derivedAny.Q3 = true;
      }
      let q4 = v("Q4");
      if (!num(q4)) {
        q4 = sub(v("FY"), v("9M")) ?? sub(v("FY"), q1, q2, q3);
        if (num(q4)) derivedAny.Q4 = true;
      }
      flow.Q1[k] = q1;
      flow.Q2[k] = q2;
      flow.Q3[k] = q3;
      flow.Q4[k] = q4;
    }
    const endOf: Record<"Q1" | "Q2" | "Q3" | "Q4", FinancialPeriod | undefined> = {
      Q1: y.Q1,
      Q2: y.Q2 ?? y.H1,
      Q3: y.Q3 ?? y["9M"],
      Q4: y.Q4 ?? y.FY,
    };
    for (const q of ["Q1", "Q2", "Q3", "Q4"] as const) {
      const values: Values = {};
      for (const k of FIELD_KEYS) if (num(flow[q][k])) values[k] = flow[q][k];
      // un trimestre esiste solo se ha almeno i ricavi o l'utile netto
      if (!num(values.revenue) && !num(values.net_income)) continue;
      const base = y[q];
      out.push({
        id: base?.id ?? `derived_${fy}_${q}`,
        companyId: (base ?? endOf[q] ?? Object.values(y)[0]!).companyId,
        fiscalYear: fy,
        fiscalPeriod: q,
        periodEnd: (base ?? endOf[q])?.periodEnd ?? "",
        values,
        sources: base?.sources ?? {},
        edited: base?.edited ?? {},
        derived: !base || derivedAny[q],
        updatedAt: base?.updatedAt ?? "",
      });
    }
  }
  return out;
}

export interface TtmPeriod {
  fiscalYear: number;
  fiscalPeriod: "TTM";
  periodEnd: string;
  values: Values;
  /** trimestri usati */
  quarters: string[];
}

/**
 * Ultimi dodici mesi: somma degli ultimi 4 trimestri consecutivi per i flussi, ultimo dato per lo stato patrimoniale.
 * Restituisce null se non ci sono 4 trimestri consecutivi.
 */
export function ttm(quarters: FinancialPeriod[]): TtmPeriod | null {
  if (quarters.length < 4) return null;
  const last4 = quarters.slice(-4);
  const idx = (p: FinancialPeriod) => p.fiscalYear * 4 + Number(p.fiscalPeriod[1]);
  for (let i = 1; i < 4; i++) if (idx(last4[i]) - idx(last4[i - 1]) !== 1) return null;
  const latest = last4[3];
  const values: Values = {};
  for (const k of FIELD_KEYS) {
    if (isStock(k) || !isAdditive(k)) {
      if (num(latest.values[k])) values[k] = latest.values[k];
      continue;
    }
    const vs = last4.map((q) => q.values[k]);
    if (vs.every(num)) values[k] = (vs as number[]).reduce((a, b) => a + b, 0);
  }
  return {
    fiscalYear: latest.fiscalYear,
    fiscalPeriod: "TTM",
    periodEnd: latest.periodEnd,
    values,
    quarters: last4.map((q) => `${q.fiscalPeriod} ${q.fiscalYear}`),
  };
}

/** Stesso periodo dell'anno precedente (per crescita anno su anno). */
export function yearAgo<T extends { fiscalYear: number; fiscalPeriod: FiscalPeriod }>(series: T[], p: T): T | undefined {
  return series.find((x) => x.fiscalYear === p.fiscalYear - 1 && x.fiscalPeriod === p.fiscalPeriod);
}

/** Il periodo più recente utile per l'analisi "a oggi": TTM se disponibile e più recente dell'ultimo FY, altrimenti ultimo FY. */
export function latestSnapshot(periods: FinancialPeriod[]): { label: string; values: Values; periodEnd: string; isTtm: boolean } | null {
  const fy = annualSeries(periods);
  const lastFy = fy[fy.length - 1];
  const t = ttm(quarterlySeries(periods));
  if (t && (!lastFy || t.periodEnd > lastFy.periodEnd)) {
    return { label: `TTM (${t.quarters[3]})`, values: t.values, periodEnd: t.periodEnd, isTtm: true };
  }
  if (lastFy) return { label: `FY${lastFy.fiscalYear}`, values: lastFy.values, periodEnd: lastFy.periodEnd, isTtm: false };
  if (t) return { label: `TTM (${t.quarters[3]})`, values: t.values, periodEnd: t.periodEnd, isTtm: true };
  return null;
}
