import path from "path";
import postgres from "postgres";
import { FileStore } from "./file";
import { PgStore } from "./pg";
import type { Store } from "./types";

export type { Store, StoredRecord } from "./types";

const g = globalThis as unknown as { __stockStore?: Store };

function create(): Store {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    // prepare:false è richiesto dal pooler di Supabase in modalità "transaction"
    const sql = postgres(url, { prepare: false, max: 3, idle_timeout: 20 });
    return new PgStore(async (text, params = []) => {
      const rows = await sql.unsafe(text, params as never[]);
      return rows as unknown as Record<string, unknown>[];
    });
  }
  return new FileStore(process.env.DATA_DIR || path.join(process.cwd(), "data"));
}

export function getStore(): Store {
  if (!g.__stockStore) g.__stockStore = create();
  return g.__stockStore;
}

export function storageKind(): "postgres" | "file" {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL ? "postgres" : "file";
}
