import type { ThesisCheck } from "../types";
import { METRIC_MAP, type MetricKey, type MetricValues } from "./metrics";

export type CheckStatus = "rispettata" | "violata" | "non verificabile";

export interface CheckEval {
  check: ThesisCheck;
  label: string;
  status: CheckStatus;
  current?: number;
  previous?: number;
  /** distanza dalla soglia, positiva = margine di sicurezza, negativa = violazione */
  headroom?: number;
  /** si sta avvicinando alla soglia o allontanando rispetto al periodo precedente */
  direction?: "migliora" | "peggiora" | "stabile";
}

const holds = (op: ThesisCheck["op"], v: number, t: number) => (op === "gte" ? v >= t : v <= t);

/**
 * Verifica le condizioni della tesi sui dati più recenti (TTM o ultimo esercizio) e dice se
 * rispetto al periodo precedente ci si sta avvicinando o allontanando dalla soglia.
 */
export function evaluateChecks(checks: ThesisCheck[], current: MetricValues | undefined, previous: MetricValues | undefined): CheckEval[] {
  return checks.map((check) => {
    const def = METRIC_MAP[check.metric as MetricKey];
    const label = def?.label ?? check.metric;
    const cur = current?.[check.metric as MetricKey];
    const prev = previous?.[check.metric as MetricKey];
    if (cur === undefined || !Number.isFinite(cur)) return { check, label, status: "non verificabile", previous: prev };
    const headroom = check.op === "gte" ? cur - check.threshold : check.threshold - cur;
    let direction: CheckEval["direction"];
    if (prev !== undefined && Number.isFinite(prev)) {
      const prevHeadroom = check.op === "gte" ? prev - check.threshold : check.threshold - prev;
      const delta = headroom - prevHeadroom;
      const eps = Math.max(Math.abs(check.threshold), Math.abs(cur)) * 0.005;
      direction = delta > eps ? "migliora" : delta < -eps ? "peggiora" : "stabile";
    }
    return { check, label, status: holds(check.op, cur, check.threshold) ? "rispettata" : "violata", current: cur, previous: prev, headroom, direction };
  });
}

export function thesisSummary(evals: CheckEval[]): { ok: number; broken: number; unknown: number; atRisk: number } {
  return {
    ok: evals.filter((e) => e.status === "rispettata").length,
    broken: evals.filter((e) => e.status === "violata").length,
    unknown: evals.filter((e) => e.status === "non verificabile").length,
    atRisk: evals.filter((e) => e.status === "rispettata" && e.direction === "peggiora").length,
  };
}
