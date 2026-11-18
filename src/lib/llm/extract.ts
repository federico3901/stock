import { FIELD_MAP, type FieldKey } from "../fields";
import { periodId } from "../analysis/periods";
import * as repo from "../repo";
import type {
  Company, CustomMetric, DocInsights, DocumentMeta, FinancialPeriod, GuidanceItem, PassName, PassState,
} from "../types";
import { LlmError, MAX_DOC_TOKENS, estimateTokens, llmMock, renderPages, runStructured, type Usage } from "./client";
import { FINANCIALS_INSTRUCTION, GUIDANCE_INSTRUCTION, INSIGHTS_INSTRUCTION, SYSTEM_ANALYST } from "./prompts";
import { FinancialsSchema, GuidanceSchema, InsightsSchema, SCALE, type FinancialsOutput, type GuidanceOutput, type InsightsOutput } from "./schemas";
import { mockFinancials, mockGuidance, mockInsights } from "./mock";

const isDate = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Fonde i periodi estratti da un documento con quelli già salvati.
 * - i campi modificati a mano non vengono mai sovrascritti;
 * - un valore già presente viene sostituito solo se il nuovo documento è più recente (o lo stesso) di quello
 *   che l'aveva fornito: i comparativi di un filing successivo sono riesposti e quindi più affidabili.
 */
export function mergeFinancials(
  existing: FinancialPeriod[],
  out: FinancialsOutput,
  ctx: { companyId: string; docId: string; docDate: string; docDates: Record<string, string>; now: string },
): FinancialPeriod[] {
  const byId = new Map(existing.map((p) => [p.id, p]));
  const touched = new Map<string, FinancialPeriod>();
  const money = SCALE[out.money_scale];
  const shares = SCALE[out.shares_scale];
  for (const ep of out.periods) {
    if (!Number.isInteger(ep.fiscal_year) || ep.fiscal_year < 1900 || ep.fiscal_year > 2200) continue;
    const id = periodId(ctx.companyId, ep.fiscal_year, ep.fiscal_period);
    const base = touched.get(id) ?? byId.get(id);
    const p: FinancialPeriod = base
      ? { ...base, values: { ...base.values }, sources: { ...base.sources }, edited: { ...base.edited } }
      : { id, companyId: ctx.companyId, fiscalYear: ep.fiscal_year, fiscalPeriod: ep.fiscal_period, periodEnd: "", values: {}, sources: {}, edited: {}, updatedAt: ctx.now };
    if (isDate(ep.period_end)) p.periodEnd = ep.period_end;
    for (const item of ep.values) {
      const key = item.field as FieldKey;
      const def = FIELD_MAP[key];
      if (!def || !Number.isFinite(item.value)) continue;
      if (p.edited[key]) continue;
      const prevSrc = p.sources[key];
      if (p.values[key] !== undefined && prevSrc && prevSrc.docId !== ctx.docId) {
        const prevDate = ctx.docDates[prevSrc.docId];
        if (prevDate && prevDate > ctx.docDate) continue; // il dato esistente viene da un documento più recente
      }
      const mult = def.kind === "money" ? money : def.kind === "shares" ? shares : 1;
      p.values[key] = item.value * mult;
      p.sources[key] = { docId: ctx.docId, ...(item.page > 0 ? { page: item.page } : {}) };
    }
    if (Object.keys(p.values).length === 0) continue;
    p.updatedAt = ctx.now;
    touched.set(id, p);
  }
  return [...touched.values()];
}

export function toCustomMetrics(out: FinancialsOutput, ctx: { companyId: string; docId: string }): CustomMetric[] {
  return out.custom_metrics
    .filter((m) => Number.isFinite(m.value) && m.name.trim())
    .map((m) => ({
      // id stabile: lo stesso KPI/periodo da un documento più recente sostituisce il precedente
      id: `${ctx.companyId}_${m.category}_${repo.slug(m.name)}_${m.fiscal_year}_${m.fiscal_period}`,
      companyId: ctx.companyId,
      category: m.category,
      name: m.name.trim(),
      fiscalYear: m.fiscal_year,
      fiscalPeriod: m.fiscal_period,
      value: m.value,
      unit: m.unit === "count" ? m.unit_label.trim() || "unità" : m.unit,
      source: { docId: ctx.docId, ...(m.page > 0 ? { page: m.page } : {}) },
    }));
}

export function toGuidanceItems(out: GuidanceOutput, ctx: { companyId: string; docId: string; fallbackDate: string; now: string }): GuidanceItem[] {
  const issued = isDate(out.issued_date) ? out.issued_date : ctx.fallbackDate;
  return out.items.map((g, i) => {
    const hasNumber = g.low !== null || g.high !== null;
    return {
      id: `${ctx.docId}_g${i + 1}`,
      companyId: ctx.companyId,
      docId: ctx.docId,
      issuedDate: issued,
      metric: g.metric,
      label: g.label.trim() || g.metric,
      targetFiscalYear: g.target_fiscal_year,
      targetPeriod: g.target_period,
      ...(g.low !== null ? { low: g.low } : {}),
      ...(g.high !== null ? { high: g.high } : {}),
      unit: g.unit,
      nonGaap: g.non_gaap,
      qualitative: g.qualitative || !hasNumber,
      ...(g.text ? { text: g.text } : {}),
      ...(g.quote ? { quote: g.quote } : {}),
      ...(g.page > 0 ? { page: g.page } : {}),
      createdAt: ctx.now,
    };
  });
}

const pg = (n: number) => (n > 0 ? { page: n } : {});

export function toInsights(out: InsightsOutput, ctx: { companyId: string; docId: string; now: string }): DocInsights {
  return {
    id: ctx.docId,
    companyId: ctx.companyId,
    summary: out.summary,
    businessModel: out.business_model,
    highlights: out.highlights,
    lowlights: out.lowlights,
    risks: out.risks.map((r) => ({ title: r.title, detail: r.detail, severity: r.severity, ...pg(r.page) })),
    accountingFlags: out.accounting_flags.map((r) => ({ title: r.title, detail: r.detail, severity: r.severity, ...pg(r.page) })),
    capitalAllocation: out.capital_allocation,
    competitivePosition: out.competitive_position,
    managementTone: out.management_tone,
    nonGaapAdjustments: out.non_gaap_adjustments,
    keyQuotes: out.key_quotes.map((q) => ({ text: q.text, why: q.why, ...pg(q.page) })),
    openQuestions: out.open_questions,
    createdAt: ctx.now,
  };
}

export const PASS_LABELS: Record<PassName, string> = {
  financials: "Bilanci, segmenti e KPI",
  guidance: "Guidance",
  insights: "Analisi qualitativa",
};

async function setPass(docId: string, pass: PassName, state: PassState) {
  const doc = await repo.getDocument(docId);
  if (!doc) return;
  doc.passes = { ...doc.passes, [pass]: state };
  await repo.putDocument(doc);
}

/** Esegue un passaggio di estrazione su un documento e salva i risultati. */
export async function runPass(docId: string, pass: PassName): Promise<{ doc: DocumentMeta; summary: string; usage?: Usage }> {
  const doc = await repo.getDocument(docId);
  if (!doc) throw new LlmError("Documento non trovato.", "invalid", 404);
  const text = await repo.getDocText(docId);
  if (!text || !text.pages.some((p) => p.trim())) throw new LlmError("Il documento non contiene testo leggibile (forse è una scansione).", "invalid", 422);
  const company = await repo.getCompany(doc.companyId);
  if (!company) throw new LlmError("Azienda non trovata.", "invalid", 404);

  const context = renderPages(doc.title, text.pages);
  if (estimateTokens(context.length) > MAX_DOC_TOKENS) {
    throw new LlmError(`Documento troppo lungo (~${Math.round(estimateTokens(context.length) / 1000)} mila token): dividilo in più file.`, "too_large", 422);
  }
  await setPass(docId, pass, { status: "running" });
  const now = repo.nowIso();
  const preface = `Azienda: ${company.name} (${company.ticker}). Documento: "${doc.title}".\n\n`;
  try {
    let summary = "";
    let usage: Usage | undefined;
    if (pass === "financials") {
      const res = llmMock()
        ? { data: mockFinancials(doc), usage: undefined }
        : await runStructured({ system: SYSTEM_ANALYST, context, instruction: preface + FINANCIALS_INSTRUCTION, schema: FinancialsSchema, effort: "high", maxTokens: 64000 });
      usage = res.usage;
      summary = await saveFinancials(company, doc, res.data, now);
    } else if (pass === "guidance") {
      const res = llmMock()
        ? { data: mockGuidance(doc), usage: undefined }
        : await runStructured({ system: SYSTEM_ANALYST, context, instruction: preface + GUIDANCE_INSTRUCTION, schema: GuidanceSchema, effort: "medium", maxTokens: 24000 });
      usage = res.usage;
      const fresh = await repo.getDocument(docId);
      const items = toGuidanceItems(res.data, { companyId: company.id, docId, fallbackDate: fresh?.date ?? doc.uploadedAt.slice(0, 10), now });
      for (const g of await repo.listGuidance(company.id)) if (g.docId === docId) await repo.deleteGuidance(g.id);
      for (const g of items) await repo.putGuidance(g);
      summary = items.length ? `${items.length} indicazioni di guidance` : "Nessuna guidance nel documento";
    } else {
      const res = llmMock()
        ? { data: mockInsights(), usage: undefined }
        : await runStructured({ system: SYSTEM_ANALYST, context, instruction: preface + INSIGHTS_INSTRUCTION, schema: InsightsSchema, effort: "medium", maxTokens: 24000 });
      usage = res.usage;
      await repo.putInsights(toInsights(res.data, { companyId: company.id, docId, now }));
      summary = `${res.data.risks.length} rischi, ${res.data.accounting_flags.length} segnali contabili`;
    }
    await setPass(docId, pass, {
      status: "done",
      finishedAt: repo.nowIso(),
      ...(usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd } : {}),
    });
    return { doc: (await repo.getDocument(docId))!, summary, usage };
  } catch (e) {
    await setPass(docId, pass, { status: "error", error: e instanceof Error ? e.message : String(e), finishedAt: repo.nowIso() });
    throw e;
  }
}

async function saveFinancials(company: Company, doc: DocumentMeta, out: FinancialsOutput, now: string): Promise<string> {
  // completa i metadati del documento e dell'azienda con quanto riconosciuto
  const d = (await repo.getDocument(doc.id)) ?? doc;
  if (!d.date && isDate(out.document.publication_date)) d.date = out.document.publication_date;
  if (!d.fiscalYear && out.document.fiscal_year > 1900) d.fiscalYear = out.document.fiscal_year;
  if (!d.fiscalPeriod) d.fiscalPeriod = out.document.fiscal_period;
  if (d.type === "other") d.type = out.document.type;
  await repo.putDocument(d);

  let changed = false;
  const cur = out.company.currency.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(cur) && !company.currency) {
    company.currency = cur;
    changed = true;
  }
  if (!company.fiscalYearEndMonth && out.company.fiscal_year_end_month >= 1 && out.company.fiscal_year_end_month <= 12) {
    company.fiscalYearEndMonth = out.company.fiscal_year_end_month;
    changed = true;
  }
  if (!company.sector && out.company.sector.trim()) {
    company.sector = out.company.sector.trim();
    changed = true;
  }
  if (changed) {
    company.updatedAt = now;
    await repo.putCompany(company);
  }

  const docs = await repo.listDocuments(company.id);
  const docDates: Record<string, string> = {};
  for (const x of docs) docDates[x.id] = x.date ?? x.uploadedAt.slice(0, 10);
  const merged = mergeFinancials(await repo.listPeriods(company.id), out, {
    companyId: company.id, docId: doc.id, docDate: d.date ?? d.uploadedAt.slice(0, 10), docDates, now,
  });
  for (const p of merged) await repo.putPeriod(p);
  const custom = toCustomMetrics(out, { companyId: company.id, docId: doc.id });
  for (const m of custom) await repo.putCustom(m);
  const parts = [`${merged.length} periodi`, `${merged.reduce((a, p) => a + Object.values(p.sources).filter((s) => s?.docId === doc.id).length, 0)} valori`];
  if (custom.length) parts.push(`${custom.length} dati di segmento/KPI`);
  if (out.notes.length) parts.push(`Note: ${out.notes.join(" · ")}`);
  return parts.join(", ");
}
