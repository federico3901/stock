import { afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { FileStore } from "@/lib/store/file";
import { PgStore } from "@/lib/store/pg";
import type { Store } from "@/lib/store/types";

const dir = mkdtempSync(path.join(tmpdir(), "stock-store-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const pglite = new PGlite();
const stores: [string, Store][] = [
  ["FileStore", new FileStore(dir)],
  ["PgStore (PGlite)", new PgStore(async (text, params) => (await pglite.query(text, params as unknown[])).rows as Record<string, unknown>[])],
];

describe.each(stores)("%s", (_name, store) => {
  it("salva, legge, elenca, filtra per azienda ed elimina", async () => {
    await store.put("companies", { id: "a", name: "Alfa" });
    await store.put("docs", { id: "d1", n: 1, nested: { x: [1, 2] } }, "a");
    await store.put("docs", { id: "d2", n: 2 }, "b");
    await store.put("docs", { id: "d1", n: 10, nested: { x: [3] } }, "a"); // sovrascrive
    expect(await store.get("docs", "d1")).toEqual({ id: "d1", n: 10, nested: { x: [3] } });
    expect(await store.get("docs", "nope")).toBeNull();
    expect((await store.list<{ id: string }>("docs")).map((d) => d.id).sort()).toEqual(["d1", "d2"]);
    expect(await store.list("docs", "a")).toHaveLength(1);
    expect(await store.list("vuota")).toEqual([]);
    expect(await store.dump()).toHaveLength(3);
    await store.deleteByCompany("a");
    expect(await store.list("docs")).toHaveLength(1);
    expect(await store.get("companies", "a")).not.toBeNull(); // il record azienda non ha companyId
    await store.delete("docs", "d2");
    await store.delete("docs", "d2"); // idempotente
    expect(await store.list("docs")).toEqual([]);
  });
  it("gestisce id con caratteri speciali e testo lungo", async () => {
    const big = "x".repeat(300_000) + " àèì \"quote\" \n newline";
    await store.put("text", { id: "c1_2024_FY", body: big }, "c1");
    expect((await store.get<{ body: string }>("text", "c1_2024_FY"))!.body).toBe(big);
  });
});
