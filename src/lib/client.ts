"use client";

import useSWR from "swr";
import type { CompanyBundle } from "./repo";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init?: { method?: string; json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  if (res.status === 401) {
    // ricarica completa voluta: il proxy deve rivalutare il cookie
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
    throw new ApiError("Accesso richiesto.", 401);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* risposta senza corpo JSON */
  }
  if (!res.ok) {
    const d = data as { error?: string; code?: string } | null;
    throw new ApiError(d?.error ?? `Errore ${res.status}`, res.status, d?.code);
  }
  return data as T;
}

const fetcher = (path: string) => api(path);

export function useApi<T>(path: string | null) {
  return useSWR<T>(path, fetcher as (p: string) => Promise<T>, { revalidateOnFocus: false });
}

export function useCompany(id: string) {
  return useApi<CompanyBundle>(`/api/companies/${id}`);
}

export interface AppStatus {
  llm: boolean;
  mock: boolean;
  model: string;
  storage: "postgres" | "file";
  /** le modifiche fatte dall'app non sono permanenti (Vercel senza database) */
  ephemeral?: boolean;
  passwordProtected: boolean;
}

export const useStatus = () => useApi<AppStatus>("/api/status");

/** Legge una risposta di testo in streaming, chiamando onChunk a ogni frammento. Restituisce il testo completo. */
export async function streamPost(path: string, json: unknown, onChunk: (full: string) => void): Promise<string> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) });
  if (!res.ok || !res.body) {
    let msg = `Errore ${res.status}`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* ignora */
    }
    throw new ApiError(msg, res.status);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
    onChunk(full);
  }
  const marker = full.indexOf("[[ERRORE]]");
  if (marker >= 0) throw new ApiError(full.slice(marker + 10).trim(), 500);
  return full;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
