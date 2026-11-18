import { describe, expect, it } from "vitest";
import { mergeFinancials } from "@/lib/llm/extract";
import type { FinancialsOutput } from "@/lib/llm/schemas";
import { guessMeta } from "@/lib/parse";
import { layoutPage, paginate } from "@/lib/parse/layout";

const out = (docValues: { field: string; value: number; page?: number }[], extra: Partial<FinancialsOutput> = {}): FinancialsOutput =>
  ({
    company: { name: "Acme", ticker: "ACME", currency: "USD", fiscal_year_end_month: 12, sector: "" },
    document: { type: "10-K", fiscal_year: 2024, fiscal_period: "FY", publication_date: "2025-02-20" },
    money_scale: "millions",
    shares_scale: "thousands",
    periods: [{ fiscal_year: 2024, fiscal_period: "FY", period_end: "2024-12-31", values: docValues.map((v) => ({ page: 0, ...v })) }],
    custom_metrics: [],
    notes: [],
    ...extra,
  }) as FinancialsOutput;

const ctx = (docId: string, docDate: string, docDates: Record<string, string> = {}) => ({ companyId: "acme", docId, docDate, docDates: { ...docDates, [docId]: docDate }, now: "2025-03-01T00:00:00Z" });

describe("unione dei dati estratti", () => {
  it("applica la scala del documento a importi e azioni, non ai valori per azione", () => {
    const [p] = mergeFinancials([], out([{ field: "revenue", value: 1250, page: 44 }, { field: "shares_diluted", value: 150000 }, { field: "eps_diluted", value: 2.5 }]), ctx("d1", "2025-02-20"));
    expect(p.values.revenue).toBe(1.25e9);
    expect(p.values.shares_diluted).toBe(1.5e8);
    expect(p.values.eps_diluted).toBe(2.5);
    expect(p.sources.revenue).toEqual({ docId: "d1", page: 44 });
    expect(p.periodEnd).toBe("2024-12-31");
  });

  it("non sovrascrive i campi corretti a mano", () => {
    const [first] = mergeFinancials([], out([{ field: "revenue", value: 1250 }, { field: "net_income", value: 100 }]), ctx("d1", "2025-02-20"));
    const edited = { ...first, values: { ...first.values, revenue: 1.3e9 }, edited: { revenue: true } };
    const [p] = mergeFinancials([edited], out([{ field: "revenue", value: 1250 }, { field: "net_income", value: 110 }]), ctx("d2", "2025-06-01", { d1: "2025-02-20" }));
    expect(p.values.revenue).toBe(1.3e9);
    expect(p.values.net_income).toBe(1.1e8);
  });

  it("tra due documenti vince il più recente (dati riesposti), anche se caricato prima", () => {
    const [newer] = mergeFinancials([], out([{ field: "revenue", value: 1300 }]), ctx("nuovo", "2026-02-20"));
    // carico dopo il documento più vecchio: non deve riportare indietro il dato riesposto
    const res = mergeFinancials([newer], out([{ field: "revenue", value: 1250 }, { field: "cfo", value: 200 }]), ctx("vecchio", "2025-02-20", { nuovo: "2026-02-20" }));
    expect(res[0].values.revenue).toBe(1.3e9);
    expect(res[0].sources.revenue?.docId).toBe("nuovo");
    expect(res[0].values.cfo).toBe(2e8); // i campi mancanti vengono comunque aggiunti
  });

  it("scarta periodi con anno impossibile e campi sconosciuti", () => {
    const o = out([{ field: "non_esiste", value: 1 }]);
    o.periods.push({ fiscal_year: 20245, fiscal_period: "FY", period_end: "", values: [{ field: "revenue", value: 1, page: 0 }] });
    expect(mergeFinancials([], o, ctx("d1", "2025-02-20"))).toHaveLength(0);
  });
});

describe("lettura dei documenti", () => {
  it("riconosce tipo e periodo dal testo e dal nome del file", () => {
    const g = guessMeta("acme-q1.pdf", ["ACME CORP FORM 10-Q\nFor the quarterly period ended March 31, 2025"]);
    expect(g.type).toBe("10-Q");
    expect(g.fiscalYear).toBe(2025);
    expect(g.fiscalPeriod).toBe("Q1");
    expect(guessMeta("AAPL_10-K_2024.pdf", ["Annual report"]).type).toBe("10-K");
  });

  it("ricostruisce righe e colonne di una tabella PDF", () => {
    const f = (str: string, x: number, y: number) => ({ str, x, y, width: str.length * 5, height: 10 });
    const text = layoutPage([f("Revenue", 50, 700), f("1,250", 300, 700), f("1,100", 400, 700), f("Net income", 50, 685), f("130", 300, 685.4), f("101", 400, 685)]);
    const lines = text.split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/Revenue\s+1,250\s+1,100/);
    expect(lines[1]).toMatch(/Net income\s+130\s+101/);
  });

  it("divide il testo lungo in pagine senza perdere contenuto", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Paragrafo ${i} ` + "parola ".repeat(60)).join("\n\n");
    const pages = paginate(text, 2000);
    expect(pages.length).toBeGreaterThan(5);
    expect(pages.join(" ")).toContain("Paragrafo 39");
    expect(pages.every((p) => p.length < 4500)).toBe(true);
  });
});
