import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { FileStore } from "@/lib/store/file";
import { SeededStore } from "@/lib/store/seeded";

const seed = [
  { collection: "companies", id: "acme", companyId: null, data: { id: "acme", name: "Acme" } },
  { collection: "periods", id: "acme_2025_FY", companyId: "acme", data: { id: "acme_2025_FY", revenue: 100 } },
  { collection: "periods", id: "acme_2024_FY", companyId: "acme", data: { id: "acme_2024_FY", revenue: 90 } },
  { collection: "periods", id: "beta_2025_FY", companyId: "beta", data: { id: "beta_2025_FY", revenue: 5 } },
];
const make = () => new SeededStore(new FileStore(mkdtempSync(join(tmpdir(), "seeded-"))), seed);

describe("aziende distribuite con l'app", () => {
  it("sono visibili senza aver scritto nulla", async () => {
    const s = make();
    expect(await s.get("companies", "acme")).toEqual({ id: "acme", name: "Acme" });
    expect(await s.list("periods", "acme")).toHaveLength(2);
    expect(await s.list("periods")).toHaveLength(3);
  });

  it("una correzione a mano copre il dato distribuito senza duplicarlo", async () => {
    const s = make();
    await s.put("periods", { id: "acme_2025_FY", revenue: 101 }, "acme");
    const list = await s.list<{ id: string; revenue: number }>("periods", "acme");
    expect(list).toHaveLength(2);
    expect(list.find((p) => p.id === "acme_2025_FY")?.revenue).toBe(101);
    expect(await s.get<{ revenue: number }>("periods", "acme_2025_FY")).toMatchObject({ revenue: 101 });
  });

  it("un record cancellato non ricompare, e si può ripristinare", async () => {
    const s = make();
    await s.delete("periods", "acme_2024_FY");
    expect(await s.get("periods", "acme_2024_FY")).toBeNull();
    expect(await s.list("periods", "acme")).toHaveLength(1);
    await s.put("periods", { id: "acme_2024_FY", revenue: 91 }, "acme");
    expect(await s.list("periods", "acme")).toHaveLength(2);
  });

  it("eliminare un'azienda nasconde tutti i suoi dati ma non quelli delle altre", async () => {
    const s = make();
    await s.deleteByCompany("acme");
    await s.delete("companies", "acme");
    expect(await s.list("companies")).toHaveLength(0);
    expect(await s.list("periods", "acme")).toHaveLength(0);
    expect(await s.list("periods", "beta")).toHaveLength(1);
  });
});
