import type { Store, StoredRecord } from "./types";

/** Esecutore SQL minimale, così lo stesso codice gira su `postgres` (produzione) e su PGlite (test). */
export type SqlRunner = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

const TABLE = "stock_records";

export class PgStore implements Store {
  private ready: Promise<void> | null = null;

  constructor(private run: SqlRunner) {}

  private init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        await this.run(
          `create table if not exists ${TABLE} (
            collection text not null,
            id text not null,
            company_id text,
            data jsonb not null,
            updated_at timestamptz not null default now(),
            primary key (collection, id)
          )`,
        );
        await this.run(`create index if not exists ${TABLE}_company_idx on ${TABLE} (collection, company_id)`);
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }

  private parse<T>(v: unknown): T {
    return (typeof v === "string" ? JSON.parse(v) : v) as T;
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    await this.init();
    const rows = await this.run(`select data from ${TABLE} where collection = $1 and id = $2`, [collection, id]);
    return rows.length ? this.parse<T>(rows[0].data) : null;
  }

  async list<T>(collection: string, companyId?: string): Promise<T[]> {
    await this.init();
    const rows =
      companyId === undefined
        ? await this.run(`select data from ${TABLE} where collection = $1 order by id`, [collection])
        : await this.run(`select data from ${TABLE} where collection = $1 and company_id = $2 order by id`, [
            collection,
            companyId,
          ]);
    return rows.map((r) => this.parse<T>(r.data));
  }

  async put<T extends { id: string }>(collection: string, data: T, companyId: string | null = null): Promise<void> {
    await this.init();
    await this.run(
      `insert into ${TABLE} (collection, id, company_id, data, updated_at)
       values ($1, $2, $3, $4::jsonb, now())
       on conflict (collection, id) do update set company_id = excluded.company_id, data = excluded.data, updated_at = now()`,
      [collection, data.id, companyId, JSON.stringify(data)],
    );
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.init();
    await this.run(`delete from ${TABLE} where collection = $1 and id = $2`, [collection, id]);
  }

  async deleteByCompany(companyId: string): Promise<void> {
    await this.init();
    await this.run(`delete from ${TABLE} where company_id = $1`, [companyId]);
  }

  async dump(): Promise<StoredRecord[]> {
    await this.init();
    const rows = await this.run(`select collection, id, company_id, data from ${TABLE} order by collection, id`);
    return rows.map((r) => ({
      collection: r.collection as string,
      id: r.id as string,
      companyId: (r.company_id as string | null) ?? null,
      data: this.parse(r.data),
    }));
  }
}
