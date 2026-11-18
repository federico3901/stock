import { NextResponse } from "next/server";
import { LlmError } from "./llm/client";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const bad = (message: string) => new HttpError(400, message);
export const notFound = (what = "Elemento") => new HttpError(404, `${what} non trovato.`);

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response | object>;

/** Avvolge un route handler: converte gli errori in risposte JSON { error } con lo status adatto. */
export function route<Ctx>(handler: Handler<Ctx>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      const res = await handler(req, ctx);
      return res instanceof Response ? res : NextResponse.json(res);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof LlmError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      const readOnly = /EROFS|read-only/i.test(msg);
      return NextResponse.json(
        { error: readOnly ? "Archivio su file non scrivibile in questo ambiente: configura DATABASE_URL (Postgres/Supabase)." : "Errore interno: " + msg },
        { status: 500 },
      );
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw bad("Corpo della richiesta non valido.");
  }
}

/** Risposta di testo in streaming: `run` riceve una funzione per inviare i frammenti. Gli errori arrivano in coda al testo. */
export function streamText(run: (send: (chunk: string) => void) => Promise<void>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await run((chunk) => controller.enqueue(enc.encode(chunk)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(enc.encode(`\n\n[[ERRORE]] ${msg}`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
