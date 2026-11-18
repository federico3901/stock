import { bad, body, route } from "@/lib/api";
import * as repo from "@/lib/repo";
import { latestSnapshot } from "@/lib/analysis/periods";
import { computeMetrics } from "@/lib/analysis/metrics";
import { multiples } from "@/lib/analysis/valuation";
import type { Company } from "@/lib/types";

/** Elenco aziende con i numeri essenziali per la watchlist. */
export const GET = route(async () => {
  const companies = await repo.listCompanies();
  const rows = await Promise.all(
    companies.map(async (company) => {
      const [periods, documents] = await Promise.all([repo.listPeriods(company.id), repo.listDocuments(company.id)]);
      const snap = latestSnapshot(periods);
      const fy = periods.filter((p) => p.fiscalPeriod === "FY").sort((a, b) => a.fiscalYear - b.fiscalYear);
      const last = fy[fy.length - 1];
      const prev = fy[fy.length - 2];
      const metrics = last ? computeMetrics({ cur: last.values, prev: prev?.values, yearAgo: prev?.values }) : {};
      return {
        company,
        documents: documents.length,
        lastDocument: documents[0]?.date ?? documents[0]?.uploadedAt?.slice(0, 10),
        snapshotLabel: snap?.label,
        lastFiscalYear: last?.fiscalYear,
        revenue: snap?.values.revenue,
        metrics,
        multiples: snap ? multiples(snap.values, company.price) : {},
      };
    }),
  );
  return { companies: rows };
});

export const POST = route(async (req) => {
  const b = await body<Partial<Company>>(req);
  const ticker = String(b.ticker ?? "").trim().toUpperCase();
  const name = String(b.name ?? "").trim() || ticker;
  if (!ticker) throw bad("Indica almeno il ticker.");
  const base = repo.slug(ticker) || "azienda";
  let id = base;
  for (let i = 2; await repo.getCompany(id); i++) id = `${base}-${i}`;
  const now = repo.nowIso();
  const company: Company = {
    id,
    ticker,
    name,
    currency: String(b.currency ?? "").trim().toUpperCase(),
    ...(b.sector ? { sector: String(b.sector) } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await repo.putCompany(company);
  return { company };
});
