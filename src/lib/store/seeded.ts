import type { Store, StoredRecord } from "./types";

const TOMBSTONES = "_deleted";
const key = (collection: string, id: string) => `${collection}:${id}`;

/**
 * Sovrappone l'archivio modificabile ai dati distribuiti con l'app (le aziende già caricate).
 * In lettura vince sempre l'archivio: una correzione a mano copre il dato distribuito.
 * Cancellare un record distribuito lascia un segnaposto, così non ricompare.
 */
export class SeededStore implements Store {
  private byKey = new Map<string, StoredRecord>();

  constructor(private inner: Store, seed: StoredRecord[]) {
    for (const r of seed) this.byKey.set(key(r.collection, r.id), r);
  }

  private async hidden(): Promise<Set<string>> {
    const rows = await this.inner.list<{ id: string }>(TOMBSTONES);
    return new Set(rows.map((r) => r.id));
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    const own = await this.inner.get<T>(collection, id);
    if (own) return own;
    const seeded = this.byKey.get(key(collection, id));
    if (!seeded || (await this.hidden()).has(key(collection, id))) return null;
    return seeded.data as T;
  }

  async list<T>(collection: string, companyId?: string): Promise<T[]> {
    const own = await this.inner.list<T & { id: string }>(collection, companyId);
    const seen = new Set(own.map((r) => r.id));
    const hidden = await this.hidden();
    const out: T[] = [...own];
    for (const r of this.byKey.values()) {
      if (r.collection !== collection || seen.has(r.id) || hidden.has(key(collection, r.id))) continue;
      if (companyId !== undefined && r.companyId !== companyId) continue;
      out.push(r.data as T);
    }
    return out;
  }

  async put<T extends { id: string }>(collection: string, data: T, companyId?: string | null): Promise<void> {
    await this.inner.put(collection, data, companyId);
    // ripristinare un record cancellato lo rende di nuovo visibile
    const k = key(collection, data.id);
    if (this.byKey.has(k)) await this.inner.delete(TOMBSTONES, k);
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.inner.delete(collection, id);
    const k = key(collection, id);
    if (this.byKey.has(k)) await this.inner.put(TOMBSTONES, { id: k }, this.byKey.get(k)!.companyId);
  }

  async deleteByCompany(companyId: string): Promise<void> {
    await this.inner.deleteByCompany(companyId); // toglie anche i segnaposto vecchi dell'azienda
    for (const r of this.byKey.values()) {
      if (r.companyId === companyId || (r.collection === "companies" && r.id === companyId)) {
        await this.inner.put(TOMBSTONES, { id: key(r.collection, r.id) }, r.collection === "companies" ? null : companyId);
      }
    }
  }

  dump(): Promise<StoredRecord[]> {
    return this.inner.dump();
  }
}
