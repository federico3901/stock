// Riassunto testuale compatto dei dati strutturati di un'azienda, da passare al modello
// come contesto per la chat e per il memo (molto più economico del testo dei documenti).

import { FIELDS, type FieldKey } from "../fields";
import { fmtMoney, fmtPct, fmtX, fmtMetric, fmtNum } from "../format";
import { annualSeries, latestSnapshot, periodLabel, quarterlySeries } from "../analysis/periods";
import { METRICS, computeSeriesMetrics, cagr, derive } from "../analysis/metrics";
import { altmanZ, beneishM, piotroski, redFlags } from "../analysis/quality";
import { credibility, evaluateGuidance } from "../analysis/guidance";
import { dcf, dcfBaseFrom, defaultValuationInputs, expectedReturn, impliedGrowth, multiples } from "../analysis/valuation";
import { analyze } from "../analysis/summary";
import type { CompanyBundle } from "../repo";
import { CUSTOM_CATEGORY_LABELS, GUIDANCE_METRIC_LABELS } from "../types";

const KEY_FIELDS: FieldKey[] = [
  "revenue", "gross_profit", "rd", "sga", "operating_income", "net_income", "eps_diluted", "shares_diluted", "da", "sbc", "cfo", "capex",
  "dividends_paid", "buybacks", "cash", "short_term_investments", "receivables", "inventory", "total_assets", "short_term_debt", "long_term_debt",
  "total_liabilities", "total_equity",
];

function table(headers: string[], rows: string[][]): string {
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

export function companyDigest(b: CompanyBundle): string {
  const { company, periods } = b;
  const cur = company.currency || "";
  const out: string[] = [];
  out.push(`# ${company.name} (${company.ticker})`);
  out.push([company.sector && `Settore: ${company.sector}`, cur && `Valuta: ${cur}`, company.price && `Prezzo: ${fmtNum(company.price, 2)} (${company.priceDate ?? "data n.d."})`].filter(Boolean).join(" · "));
  if (company.description) out.push(company.description);

  const annual = annualSeries(periods).slice(-6);
  if (annual.length) {
    const label = Object.fromEntries(FIELDS.map((f) => [f.key, f.label])) as Record<FieldKey, string>;
    out.push("\n## Bilanci annuali (voci principali)");
    out.push(
      table(
        ["Voce", ...annual.map(periodLabel)],
        KEY_FIELDS.filter((k) => annual.some((a) => a.values[k] !== undefined)).map((k) => [
          label[k],
          ...annual.map((a) => (k === "eps_diluted" ? fmtNum(a.values[k], 2) : fmtMoney(a.values[k]))),
        ]),
      ),
    );
    const metrics = computeSeriesMetrics(annual, { months: 12 });
    out.push("\n## Metriche annuali");
    out.push(
      table(
        ["Metrica", ...annual.map(periodLabel)],
        METRICS.filter((m) => metrics.some((x) => x[m.key] !== undefined)).map((m) => [m.label, ...metrics.map((x) => fmtMetric(x[m.key], m.format, cur))]),
      ),
    );
    if (annual.length >= 3) {
      const n = annual.length - 1;
      const first = annual[0].values;
      const last = annual[n].values;
      out.push(
        `CAGR ${n} anni — ricavi ${fmtPct(cagr(first.revenue, last.revenue, n))}, utile netto ${fmtPct(cagr(first.net_income, last.net_income, n))}, FCF ${fmtPct(cagr(derive(first).fcf, derive(last).fcf, n))}`,
      );
    }
  }

  const quarters = quarterlySeries(periods).slice(-8);
  if (quarters.length) {
    const qm = computeSeriesMetrics(quarterlySeries(periods), { months: 3 }).slice(-8);
    out.push("\n## Ultimi trimestri");
    out.push(
      table(
        ["", ...quarters.map(periodLabel)],
        [
          ["Ricavi", ...quarters.map((q) => fmtMoney(q.values.revenue))],
          ["Crescita a/a", ...qm.map((m) => fmtPct(m.revenue_growth))],
          ["Margine lordo", ...qm.map((m) => fmtPct(m.gross_margin))],
          ["Margine operativo", ...qm.map((m) => fmtPct(m.operating_margin))],
          ["Utile netto", ...quarters.map((q) => fmtMoney(q.values.net_income))],
          ["FCF", ...quarters.map((q) => fmtMoney(derive(q.values).fcf))],
        ],
      ),
    );
  }

  const snap = latestSnapshot(periods);
  if (snap) {
    const m = multiples(snap.values, company.price);
    out.push(`\n## Valutazione (dati ${snap.label})`);
    if (m.marketCap) {
      out.push(
        `Capitalizzazione ${fmtMoney(m.marketCap, cur)}, EV ${fmtMoney(m.enterpriseValue, cur)} · P/E ${fmtX(m.pe)} · EV/EBITDA ${fmtX(m.evEbitda)} · EV/EBIT ${fmtX(m.evEbit)} · EV/Ricavi ${fmtX(m.evSales)} · P/FCF ${fmtX(m.pFcf)} · FCF yield ${fmtPct(m.fcfYield)} · FCF yield al netto di SBC ${fmtPct(m.fcfYieldAfterSbc)} · P/B ${fmtX(m.pb)} · rendimento totale agli azionisti ${fmtPct(m.shareholderYield)}`,
      );
    } else out.push("Prezzo non inserito: multipli non disponibili.");
    const base = dcfBaseFrom(snap.values);
    if (base) {
      const inp = b.valuation ?? defaultValuationInputs(company.id, annualSeries(periods), snap.values);
      const lines: string[] = [];
      for (const name of ["bear", "base", "bull"] as const) {
        const s = inp.scenarios[name];
        const r = dcf(base, s, inp);
        const er = company.price ? expectedReturn(base, company.price, s, 5) : null;
        lines.push(
          `- ${name}: crescita ricavi ${fmtPct(s.revenueGrowthStart)}→${fmtPct(s.revenueGrowthEnd)}, margine FCF ${fmtPct(s.fcfMarginStart)}→${fmtPct(s.fcfMarginEnd)}, probabilità ${fmtPct(s.probability, 0)} ⇒ valore DCF ${r ? fmtNum(r.valuePerShare, 2) : "n.d."} per azione${er ? `, rendimento annuo atteso a 5 anni ${fmtPct(er.annualReturn)} (uscita a ${fmtX(s.exitMultiple, 0)} P/FCF)` : ""}`,
        );
      }
      out.push(`Scenari DCF (${b.valuation ? "ipotesi dell'investitore" : "ipotesi automatiche di partenza"}; sconto ${fmtPct(inp.discountRate)}, crescita terminale ${fmtPct(inp.terminalGrowth)}, ${inp.years} anni):\n${lines.join("\n")}`);
      const fm = derive(snap.values).fcf && snap.values.revenue ? derive(snap.values).fcf! / snap.values.revenue : undefined;
      if (company.price && fm && fm > 0) {
        const g = impliedGrowth(base, company.price, fm, inp);
        if (g !== undefined) out.push(`Reverse DCF: al prezzo attuale il mercato sconta una crescita dei ricavi del ${fmtPct(g)} annuo per ${inp.years} anni, a margine FCF costante (${fmtPct(fm)}).`);
      }
    }
  }

  if (annual.length >= 2) {
    const c = annual[annual.length - 1];
    const p = annual[annual.length - 2];
    const pio = piotroski(c.values, p.values);
    const mc = snap && company.price ? multiples(c.values, company.price).marketCap : undefined;
    const z = altmanZ(c.values, mc);
    const be = beneishM(c.values, p.values);
    out.push("\n## Qualità e segnali");
    out.push(
      [
        `Piotroski F-Score ${pio.score}/${pio.available}`,
        z && `Altman ${z.variant.split(" ")[0]} ${fmtNum(z.z, 2)} (zona ${z.zone})`,
        be && `Beneish M-Score ${fmtNum(be.m, 2)}${be.flag ? " (sopra la soglia di attenzione −1,78)" : ""}`,
      ].filter(Boolean).join(" · "),
    );
    const flags = redFlags(annual.map((a) => ({ label: periodLabel(a), values: a.values })));
    if (flags.length) out.push(flags.map((f) => `- [${f.severity}] ${f.title}: ${f.detail}`).join("\n"));
    else out.push("Nessun segnale automatico di attenzione.");
  }

  if (b.guidance.length) {
    const evals = evaluateGuidance(b.guidance, periods, b.custom);
    const cred = credibility(evals);
    out.push("\n## Guidance");
    out.push(`Affidabilità: ${cred.verdict} (${cred.beat} superate, ${cred.inline} in linea, ${cred.miss} mancate; ${cred.raised} rialzi e ${cred.lowered} tagli in corso d'anno)`);
    out.push(
      evals
        .map((e) => {
          const g = e.item;
          const f = (v?: number) => (g.unit === "percent" ? fmtPct(v) : g.unit === "per_share" ? fmtNum(v, 2) : fmtMoney(v));
          const range = g.qualitative ? (g.text ?? "") : g.low === g.high ? f(g.low) : `${f(g.low)} – ${f(g.high)}`;
          return `- ${g.issuedDate} · ${g.label || GUIDANCE_METRIC_LABELS[g.metric]}${g.nonGaap ? " (non-GAAP)" : ""} ${periodLabel({ fiscalYear: g.targetFiscalYear, fiscalPeriod: g.targetPeriod })}: ${range}${e.revision && e.revision !== "prima indicazione" ? ` [${e.revision}]` : ""}${e.actual !== undefined ? ` → effettivo ${f(e.actual)}, ${e.outcome}` : ""}`;
        })
        .join("\n"),
    );
  }

  if (b.custom.length) {
    out.push("\n## Segmenti e KPI");
    const groups = new Map<string, typeof b.custom>();
    for (const m of b.custom) {
      const k = `${m.category}|${m.name}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(m);
    }
    for (const [k, list] of groups) {
      const [cat, name] = k.split("|");
      list.sort((a, c) => a.fiscalYear - c.fiscalYear || a.fiscalPeriod.localeCompare(c.fiscalPeriod));
      const f = (m: (typeof list)[number]) => (m.unit === "currency" ? fmtMoney(m.value) : m.unit === "percent" ? fmtPct(m.value) : `${fmtNum(m.value)} ${m.unit}`);
      out.push(`- ${CUSTOM_CATEGORY_LABELS[cat as keyof typeof CUSTOM_CATEGORY_LABELS]} · ${name}: ${list.slice(-6).map((m) => `${periodLabel(m)} ${f(m)}`).join(", ")}`);
    }
  }

  const docTitle = new Map(b.documents.map((d) => [d.id, d.title]));
  const insights = [...b.insights].sort((a, c) => c.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  for (const ins of insights) {
    out.push(`\n## Analisi qualitativa — ${docTitle.get(ins.id) ?? "documento"}`);
    out.push(ins.summary);
    out.push(`Business: ${ins.businessModel}`);
    if (ins.highlights.length) out.push("Positivi:\n" + ins.highlights.map((h) => `- ${h}`).join("\n"));
    if (ins.lowlights.length) out.push("Negativi:\n" + ins.lowlights.map((h) => `- ${h}`).join("\n"));
    if (ins.risks.length) out.push("Rischi:\n" + ins.risks.map((r) => `- [${r.severity}] ${r.title}: ${r.detail}`).join("\n"));
    if (ins.accountingFlags.length) out.push("Segnali contabili:\n" + ins.accountingFlags.map((r) => `- [${r.severity}] ${r.title}: ${r.detail}`).join("\n"));
    out.push(`Allocazione del capitale: ${ins.capitalAllocation}`);
    out.push(`Posizione competitiva: ${ins.competitivePosition}`);
    out.push(`Tono del management: ${ins.managementTone.label} — ${ins.managementTone.rationale}`);
    if (ins.openQuestions.length) out.push("Domande aperte:\n" + ins.openQuestions.map((q) => `- ${q}`).join("\n"));
  }

  const checks = analyze(b).checks;
  if (checks.length) {
    out.push("\n## Condizioni della tesi fissate dall'investitore (verificate sui dati più recenti)");
    for (const c of checks) {
      const f = METRICS.find((m) => m.key === c.check.metric)?.format ?? "num";
      out.push(`- ${c.label} ${c.check.op === "gte" ? "≥" : "≤"} ${fmtMetric(c.check.threshold, f)}: ${c.status}${c.current !== undefined ? ` (attuale ${fmtMetric(c.current, f)}${c.previous !== undefined ? `, prima ${fmtMetric(c.previous, f)}` : ""})` : ""}${c.check.note ? ` — ${c.check.note}` : ""}`);
    }
  }

  const notes = b.notes.filter((n) => n.kind !== "memo").slice(0, 10);
  if (notes.length) {
    out.push("\n## Note dell'investitore");
    for (const n of notes) out.push(`### ${n.title} (${n.kind})\n${n.body}`);
  }
  return out.join("\n");
}
