import { body, notFound, route } from "@/lib/api";
import * as repo from "@/lib/repo";
import type { Company } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const bundle = await repo.loadCompanyBundle(id);
  if (!bundle) throw notFound("Azienda");
  return bundle;
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const company = await repo.getCompany(id);
  if (!company) throw notFound("Azienda");
  const b = await body<Partial<Company>>(req);
  const next: Company = { ...company };
  if (typeof b.name === "string" && b.name.trim()) next.name = b.name.trim();
  if (typeof b.ticker === "string" && b.ticker.trim()) next.ticker = b.ticker.trim().toUpperCase();
  if (typeof b.currency === "string") next.currency = b.currency.trim().toUpperCase();
  if (typeof b.sector === "string") next.sector = b.sector.trim();
  if (typeof b.description === "string") next.description = b.description;
  if (b.price === null) {
    delete next.price;
    delete next.priceDate;
  } else if (typeof b.price === "number" && Number.isFinite(b.price) && b.price > 0) {
    next.price = b.price;
    next.priceDate = typeof b.priceDate === "string" ? b.priceDate : new Date().toISOString().slice(0, 10);
  }
  next.updatedAt = repo.nowIso();
  await repo.putCompany(next);
  return { company: next };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  await repo.deleteCompany(id);
  return { ok: true };
});
