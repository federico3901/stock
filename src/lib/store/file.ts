import { promises as fs } from "fs";
import path from "path";
import type { Store, StoredRecord } from "./types";

// Archivio locale su file JSON: data/<collezione>/<id>.json
// Pensato per l'uso in locale (npm run dev). In produzione usare Postgres (DATABASE_URL).

const safe = (s: string) => s.replace(/[^a-zA-Z0-9_.-]/g, "_");

export class FileStore implements Store {
  constructor(private root: string) {}

  private dir(collection: string) {
    return path.join(this.root, safe(collection));
  }
  private file(collection: string, id: string) {
    return path.join(this.dir(collection), safe(id) + ".json");
  }

  private async readRecord(file: string): Promise<StoredRecord | null> {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as StoredRecord;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    const rec = await this.readRecord(this.file(collection, id));
    return rec ? (rec.data as T) : null;
  }

  private async records(collection: string): Promise<StoredRecord[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.dir(collection));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    const recs = await Promise.all(
      names.filter((n) => n.endsWith(".json")).map((n) => this.readRecord(path.join(this.dir(collection), n))),
    );
    return recs.filter((r): r is StoredRecord => r !== null);
  }

  async list<T>(collection: string, companyId?: string): Promise<T[]> {
    const recs = await this.records(collection);
    return recs.filter((r) => companyId === undefined || r.companyId === companyId).map((r) => r.data as T);
  }

  async put<T extends { id: string }>(collection: string, data: T, companyId: string | null = null): Promise<void> {
    await fs.mkdir(this.dir(collection), { recursive: true });
    const rec: StoredRecord<T> = { collection, id: data.id, companyId, data };
    const file = this.file(collection, data.id);
    const tmp = file + "." + process.pid + "." + Math.random().toString(36).slice(2) + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(rec));
    await fs.rename(tmp, file);
  }

  async delete(collection: string, id: string): Promise<void> {
    await fs.rm(this.file(collection, id), { force: true });
  }

  private async collections(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.root, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }

  async deleteByCompany(companyId: string): Promise<void> {
    for (const c of await this.collections()) {
      for (const r of await this.records(c)) {
        if (r.companyId === companyId) await this.delete(c, r.id);
      }
    }
  }

  async dump(): Promise<StoredRecord[]> {
    const out: StoredRecord[] = [];
    for (const c of await this.collections()) out.push(...(await this.records(c)));
    return out;
  }
}
