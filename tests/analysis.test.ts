import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/demo";
import { annualSeries, latestSnapshot, quarterlySeries, ttm } from "@/lib/analysis/periods";
import { cagr, computeMetrics, computeSeriesMetrics, derive } from "@/lib/analysis/metrics";
import { altmanZ, beneishM, coherenceChecks, piotroski, redFlags } from "@/lib/analysis/quality";
import { dcf, dcfBaseFrom, defaultValuationInputs, expectedReturn, impliedGrowth, impliedMargin, multiples, sensitivity } from "@/lib/analysis/valuation";
import { credibility, evaluateGuidance, openGuidance } from "@/lib/analysis/guidance";
import { diffFilings, diffParagraphs, findSections } from "@/lib/analysis/textdiff";
import type { FinancialPeriod } from "@/lib/types";

const demo = buildDemo();
const annual = annualSeries(demo.periods);

describe("dati demo", () => {
  it("i bilanci quadrano in ogni periodo", () => {
    for (const p of demo.periods) {
      const checks = coherenceChecks(p.values);
      expect(checks.length).toBeGreaterThanOrEqual(4);
      for (const c of checks) expect(c.ok, `${p.fiscalYear} ${p.fiscalPeriod} ${c.label}: ${c.detail}`).toBe(true);
    }
  });
  it("ha 4 esercizi e 5 trimestri", () => {
    expect(annual.map((a) => a.fiscalYear)).toEqual([2021, 2022, 2023, 2024]);
    expect(demo.periods.filter((p) => p.fiscalPeriod !== "FY")).toHaveLength(5);
  });
});

describe("periodi", () => {
  it("ricava il Q4 per differenza dall'anno intero", () => {
    const q = quarterlySeries(demo.periods);
    const q4 = q.find((p) => p.fiscalYear === 2024 && p.fiscalPeriod === "Q4")!;
    expect(q4.derived).toBe(true);
    const fy = annual[3].values;
    const sum = q.filter((p) => p.fiscalYear === 2024).reduce((a, p) => a + p.values.revenue!, 0);
    expect(sum).toBeCloseTo(fy.revenue!, -1);
    expect(q4.values.total_assets).toBe(fy.total_assets);
    expect(q4.periodEnd).toBe("2024-12-31");
  });

  it("ricava Q2 e Q3 dai cumulati (H1, 9M) voce per voce", () => {
    const mk = (fp: FinancialPeriod["fiscalPeriod"], values: FinancialPeriod["values"]): FinancialPeriod => ({
      id: fp, companyId: "c", fiscalYear: 2024, fiscalPeriod: fp, periodEnd: "2024-01-01", values, sources: {}, edited: {}, updatedAt: "",
    });
    const q = quarterlySeries([
      mk("Q1", { revenue: 100, cfo: 10, net_income: 5 }),
      mk("Q2", { revenue: 120, net_income: 7, cash: 50 }), // il 10-Q dà il CE del trimestre...
      mk("H1", { revenue: 220, cfo: 35, net_income: 12 }), // ...ma il rendiconto solo cumulato
      mk("9M", { revenue: 350, cfo: 60, net_income: 20, cash: 70 }),
      mk("FY", { revenue: 500, cfo: 100, net_income: 30, cash: 90, shares_diluted: 10 }),
    ]);
    expect(q.map((p) => p.fiscalPeriod)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(q[1].values.cfo).toBe(25);
    expect(q[1].values.revenue).toBe(120);
    expect(q[2].values.revenue).toBe(130);
    expect(q[2].values.cfo).toBe(25);
    expect(q[2].values.cash).toBe(70);
    expect(q[3].values.revenue).toBe(150);
    expect(q[3].values.cfo).toBe(40);
    expect(q[3].values.cash).toBe(90);
    expect(q[3].values.shares_diluted).toBe(10);
  });

  it("calcola il TTM sugli ultimi 4 trimestri consecutivi", () => {
    const q = quarterlySeries(demo.periods);
    const t = ttm(q)!;
    expect(t.quarters).toEqual(["Q3 2024", "Q4 2024", "Q1 2025", "Q2 2025"]);
    const expected = q.slice(-4).reduce((a, p) => a + p.values.revenue!, 0);
    expect(t.values.revenue).toBe(expected);
    expect(t.values.cash).toBe(q[q.length - 1].values.cash);
    expect(latestSnapshot(demo.periods)!.isTtm).toBe(true);
  });

  it("niente TTM se i trimestri non sono consecutivi", () => {
    const q = quarterlySeries(demo.periods).filter((p) => !(p.fiscalYear === 2025 && p.fiscalPeriod === "Q1"));
    expect(ttm(q)).toBeNull();
  });
});

describe("metriche", () => {
  const m = computeSeriesMetrics(annual, { months: 12 });
  it("margini e crescita", () => {
    const v = annual[3].values;
    expect(m[3].gross_margin).toBeCloseTo(v.gross_profit! / v.revenue!, 10);
    expect(m[3].revenue_growth).toBeCloseTo(v.revenue! / annual[2].values.revenue! - 1, 10);
    expect(m[0].revenue_growth).toBeUndefined();
    expect(m[3].fcf_margin).toBeCloseTo((v.cfo! - v.capex!) / v.revenue!, 10);
  });
  it("ROIC usa il capitale investito medio", () => {
    const d1 = derive(annual[3].values);
    const d0 = derive(annual[2].values);
    expect(m[3].roic).toBeCloseTo(d1.nopat! / ((d1.investedCapital! + d0.investedCapital!) / 2), 10);
    expect(m[3].roic!).toBeGreaterThan(0.05);
    expect(m[3].roic!).toBeLessThan(0.6);
  });
  it("annualizza i rendimenti trimestrali", () => {
    const v = annual[3].values;
    const quarterLike = { ...v, net_income: v.net_income! / 4, revenue: v.revenue! / 4, cost_of_revenue: v.cost_of_revenue! / 4 };
    const mq = computeMetrics({ cur: quarterLike, months: 3 });
    const my = computeMetrics({ cur: v, months: 12 });
    expect(mq.roe).toBeCloseTo(my.roe!, 10);
    expect(mq.dso).toBeCloseTo(my.dso!, 6);
  });
  it("non divide per zero e ignora le basi negative", () => {
    const x = computeMetrics({ cur: { revenue: 0, net_income: -5, cfo: 3 }, yearAgo: { revenue: 0, net_income: -10 } });
    expect(x.net_margin).toBeUndefined();
    expect(x.net_income_growth).toBeUndefined();
    expect(x.fcf_conversion).toBeUndefined();
  });
  it("CAGR", () => {
    expect(cagr(100, 121, 2)).toBeCloseTo(0.1, 10);
    expect(cagr(-1, 5, 2)).toBeUndefined();
  });
});

describe("qualità", () => {
  it("Piotroski tra 0 e 9 con tutti i criteri valutati", () => {
    const p = piotroski(annual[3].values, annual[2].values);
    expect(p.available).toBe(9);
    expect(p.score).toBeGreaterThanOrEqual(0);
    expect(p.score).toBeLessThanOrEqual(9);
    expect(p.items.find((i) => i.label === "Utile netto positivo")!.pass).toBe(true);
  });
  it("Altman usa la capitalizzazione quando c'è il prezzo", () => {
    const v = annual[3].values;
    expect(altmanZ(v)!.variant).toMatch(/Z'/);
    const z = altmanZ(v, 48.5 * v.shares_outstanding!)!;
    expect(z.variant).toMatch(/capitalizzazione/);
    expect(z.zone).toBe("sicura");
  });
  it("Beneish: azienda stabile non segnalata, crediti gonfiati sì", () => {
    const b = beneishM(annual[2].values, annual[1].values)!;
    expect(b.flag).toBe(false);
    const cur = { ...annual[3].values, receivables: annual[3].values.receivables! * 2.5, cfo: annual[3].values.cfo! * 0.2 };
    expect(beneishM(cur, annual[2].values)!.m).toBeGreaterThan(b.m);
  });
  it("segnala crediti e magazzino che crescono più dei ricavi nel 2024", () => {
    const flags = redFlags(annual.map((a) => ({ label: `FY${a.fiscalYear}`, values: a.values })));
    const ids = flags.map((f) => f.id);
    expect(ids).toContain("receivables");
    expect(ids).toContain("inventory");
    // ordinati per gravità
    const sev = flags.map((f) => f.severity);
    expect([...sev].sort((a, b) => ["alta", "media", "info"].indexOf(a) - ["alta", "media", "info"].indexOf(b))).toEqual(sev);
  });
  it("nessun segnale con un solo esercizio", () => {
    expect(redFlags([{ label: "FY", values: annual[0].values }])).toEqual([]);
  });
  it("i controlli di coerenza rilevano un errore di estrazione", () => {
    const bad = { ...annual[3].values, total_assets: annual[3].values.total_assets! * 1.2 };
    expect(coherenceChecks(bad).find((c) => c.label.startsWith("Attivo"))!.ok).toBe(false);
  });
});

describe("valutazione", () => {
  const snap = latestSnapshot(demo.periods)!.values;
  const base = dcfBaseFrom(snap)!;
  const p = { discountRate: 0.09, terminalGrowth: 0.025, years: 10 };
  it("DCF: caso analitico a crescita costante", () => {
    // crescita = crescita terminale e margine costante => rendita crescente: EV = FCF1 / (r - g)
    const r = dcf({ revenue: 1000, netDebt: 0, shares: 100 }, { revenueGrowthStart: 0.02, revenueGrowthEnd: 0.02, fcfMarginStart: 0.1, fcfMarginEnd: 0.1 }, { discountRate: 0.1, terminalGrowth: 0.02, years: 7 })!;
    expect(r.enterpriseValue).toBeCloseTo((1000 * 1.02 * 0.1) / (0.1 - 0.02), 6);
    expect(r.valuePerShare).toBeCloseTo(r.enterpriseValue / 100, 8);
    expect(r.years).toHaveLength(7);
  });
  it("DCF: il debito netto riduce il valore, tasso ≤ crescita non è valido", () => {
    const a = dcf(base, { revenueGrowthStart: 0.1, revenueGrowthEnd: 0.03, fcfMarginStart: 0.1, fcfMarginEnd: 0.12 }, p)!;
    const b = dcf({ ...base, netDebt: base.netDebt + 1e9 }, { revenueGrowthStart: 0.1, revenueGrowthEnd: 0.03, fcfMarginStart: 0.1, fcfMarginEnd: 0.12 }, p)!;
    expect(a.equityValue - b.equityValue).toBeCloseTo(1e9, 0);
    expect(dcf(base, { revenueGrowthStart: 0.1, revenueGrowthEnd: 0.03, fcfMarginStart: 0.1, fcfMarginEnd: 0.1 }, { ...p, discountRate: 0.02 })).toBeNull();
  });
  it("reverse DCF è l'inverso del DCF", () => {
    const g = 0.08;
    const v = dcf(base, { revenueGrowthStart: g, revenueGrowthEnd: g, fcfMarginStart: 0.12, fcfMarginEnd: 0.12 }, p)!.valuePerShare;
    expect(impliedGrowth(base, v, 0.12, p)).toBeCloseTo(g, 6);
    const s = { revenueGrowthStart: 0.1, revenueGrowthEnd: 0.03, fcfMarginStart: 0.08 };
    const v2 = dcf(base, { ...s, fcfMarginEnd: 0.17 }, p)!.valuePerShare;
    expect(impliedMargin(base, v2, s, p)).toBeCloseTo(0.17, 6);
  });
  it("multipli", () => {
    const m = multiples(snap, 48.5);
    expect(m.marketCap).toBeCloseTo(48.5 * snap.shares_outstanding!, 0);
    expect(m.pe).toBeCloseTo(m.marketCap! / snap.net_income!, 8);
    expect(m.enterpriseValue).toBeCloseTo(m.marketCap! + derive(snap).netDebt!, 0);
    expect(multiples(snap, undefined)).toEqual({});
    expect(multiples({ ...snap, net_income: -1 }, 10).pe).toBeUndefined();
  });
  it("ipotesi predefinite sensate e rendimento atteso", () => {
    const inp = defaultValuationInputs("x", annual, snap);
    expect(inp.scenarios.base.revenueGrowthStart).toBeGreaterThan(0.05);
    expect(inp.scenarios.bear.revenueGrowthStart).toBeLessThan(inp.scenarios.base.revenueGrowthStart);
    const probs = Object.values(inp.scenarios).reduce((a, s) => a + s.probability, 0);
    expect(probs).toBeCloseTo(1, 10);
    const er = expectedReturn(base, 48.5, inp.scenarios.base, 5)!;
    expect(er.exitPrice).toBeGreaterThan(0);
    expect(Math.pow(1 + er.annualReturn, 5) * 48.5).toBeCloseTo(er.exitPrice, 6);
    const t = sensitivity(base, inp.scenarios.base, inp);
    expect(t.values).toHaveLength(5);
    // più alto il tasso di sconto, più basso il valore
    expect(t.values[0][2]!).toBeGreaterThan(t.values[4][2]!);
  });
});

describe("guidance", () => {
  const evals = evaluateGuidance(demo.guidance, demo.periods);
  const find = (fy: number, fp: string, metric: string, date: string) =>
    evals.find((e) => e.item.targetFiscalYear === fy && e.item.targetPeriod === fp && e.item.metric === metric && e.item.issuedDate === date)!;
  it("confronta con i dati effettivi", () => {
    const rev24 = find(2024, "FY", "revenue", "2024-02-20");
    expect(rev24.actual).toBe(annual[3].values.revenue);
    expect(rev24.outcome).toBe("in linea");
    const om24 = find(2024, "FY", "operating_margin", "2024-02-20");
    expect(["in linea", "superata", "mancata"]).toContain(om24.outcome);
    expect(om24.surprise).toBeCloseTo(om24.actual! - 0.14, 10);
  });
  it("usa i trimestri discreti per la guidance trimestrale", () => {
    const q2 = find(2025, "Q2", "revenue", "2025-02-18");
    expect(q2.actual).toBe(demo.periods.find((p) => p.fiscalYear === 2025 && p.fiscalPeriod === "Q2")!.values.revenue);
    expect(q2.outcome).toBe("in linea");
  });
  it("riconosce le revisioni", () => {
    expect(find(2025, "FY", "revenue", "2025-02-18").revision).toBe("prima indicazione");
    const raised = find(2025, "FY", "revenue", "2025-07-29");
    expect(raised.revision).toBe("alzata");
    expect(raised.revisionDelta).toBeCloseTo(2725 / 2700 - 1, 10);
    expect(find(2025, "FY", "operating_margin", "2025-07-29").revision).toBe("confermata");
  });
  it("guidance aperte e punteggio di affidabilità", () => {
    const open = openGuidance(evals);
    expect(open.some((e) => e.item.targetPeriod === "Q3")).toBe(true);
    expect(open.filter((e) => e.item.metric === "revenue" && e.item.targetPeriod === "FY" && e.item.targetFiscalYear === 2025)).toHaveLength(1);
    const c = credibility(evals);
    expect(c.evaluated).toBe(3);
    expect(c.raised).toBe(1);
    expect(c.beat + c.inline + c.miss).toBe(3);
  });
  it("una guidance mancata è segnalata", () => {
    const item = { ...demo.guidance[0], id: "x", low: 3000e6, high: 3100e6 };
    expect(evaluateGuidance([item], demo.periods)[0].outcome).toBe("mancata");
  });
});

describe("confronto tra filing", () => {
  const t23 = demo.texts.find((t) => t.id === "demo-10k-2023")!.pages;
  const t24 = demo.texts.find((t) => t.id === "demo-10k-2024")!.pages;
  it("trova le sezioni saltando l'indice", () => {
    const s = findSections(t24);
    expect(Object.keys(s).sort()).toEqual(["business", "mdna", "risk_factors"]);
    expect(s.risk_factors!.startPage).toBe(3);
    expect(s.risk_factors!.text).toMatch(/^La domanda/);
    expect(s.risk_factors!.text).not.toMatch(/Item 7/);
  });
  it("trova rischi nuovi, rimossi e riscritti", () => {
    const d = diffFilings(t23, t24).find((x) => x.key === "risk_factors")!;
    const kinds = (k: string) => d.changes.filter((c) => c.kind === k);
    expect(kinds("nuovo").some((c) => /intelligenza artificiale/.test(c.text))).toBe(true);
    expect(kinds("nuovo").some((c) => /termini di pagamento/.test(c.text))).toBe(true);
    expect(kinds("rimosso").some((c) => /ristrutturazione/.test(c.text))).toBe(true);
    expect(kinds("modificato").some((c) => /scorte di sicurezza/.test(c.text))).toBe(true);
    expect(d.unchanged).toBeGreaterThanOrEqual(4);
  });
  it("i soli numeri diversi non contano come modifica", () => {
    const a = "I ricavi dell'esercizio sono stati pari a 2.120 milioni di dollari, in crescita rispetto all'anno precedente per la forte domanda.";
    const b = a.replace("2.120", "2.415");
    expect(diffParagraphs(a, b)).toEqual({ unchanged: 1, changes: [] });
  });
});

import { evaluateChecks, thesisSummary } from "@/lib/analysis/thesis";
import { quarterBrief } from "@/lib/analysis/quarter";
import type { ThesisCheck } from "@/lib/types";

describe("tesi sotto controllo", () => {
  const chk = (metric: string, op: "gte" | "lte", threshold: number): ThesisCheck => ({ id: metric, companyId: "x", metric, op, threshold, createdAt: "" });
  it("distingue condizioni rispettate, violate e non verificabili", () => {
    const evals = evaluateChecks(
      [chk("operating_margin", "gte", 0.18), chk("dso", "lte", 52), chk("roic", "gte", 0.2)],
      { operating_margin: 0.19, dso: 56 },
      { operating_margin: 0.21, dso: 50 },
    );
    expect(evals.map((e) => e.status)).toEqual(["rispettata", "violata", "non verificabile"]);
    // il margine è ancora sopra soglia ma il cuscinetto si è ridotto
    expect(evals[0].direction).toBe("peggiora");
    expect(evals[0].headroom).toBeCloseTo(0.01);
    expect(evals[1].headroom).toBeCloseTo(-4);
    expect(thesisSummary(evals)).toEqual({ ok: 1, broken: 1, unknown: 1, atRisk: 1 });
  });
});

describe("ultimo trimestre", () => {
  const q = (fy: number, fp: "Q1" | "Q2", revenue: number, op: number): FinancialPeriod => ({
    id: `${fy}${fp}`, companyId: "x", fiscalYear: fy, fiscalPeriod: fp, periodEnd: `${fy}-0${fp === "Q1" ? 3 : 6}-30`,
    values: { revenue, operating_income: op }, sources: {}, edited: {}, updatedAt: "",
  });
  it("confronta con l'anno prima e col trimestre precedente", () => {
    const b = quarterBrief([q(2024, "Q1", 100, 10), q(2024, "Q2", 110, 11), q(2025, "Q1", 120, 15), q(2025, "Q2", 121, 18.15)])!;
    expect(b.label).toBe("Q2 2025");
    const rev = b.rows.find((r) => r.label === "Ricavi")!;
    expect(rev.yoy).toBeCloseTo(0.1);
    expect(rev.qoq).toBeCloseTo(1 / 120);
    const m = b.rows.find((r) => r.label === "Margine operativo")!;
    expect(m.value).toBeCloseTo(0.15);
    expect(m.yoy).toBeCloseTo(0.05); // punti di margine, non variazione relativa
    // crescita passata dal 20% al 10%: rallentamento di 10 punti
    expect(b.growthChange).toBeCloseTo(-0.1);
  });
  it("senza trimestri non produce nulla", () => expect(quarterBrief([])).toBeNull());
});
