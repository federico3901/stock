import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export class LlmError extends Error {
  constructor(message: string, public code: "not_configured" | "refusal" | "truncated" | "invalid" | "too_large" | "api", public status = 500) {
    super(message);
  }
}

export const DEFAULT_MODEL = "claude-opus-5-5";

export function llmModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export function llmEffort(fallback: Effort): Effort {
  const e = process.env.ANTHROPIC_EFFORT as Effort | undefined;
  return e && ["low", "medium", "high", "xhigh", "max"].includes(e) ? e : fallback;
}

export function llmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) || llmMock();
}

/** Modalità di prova: nessuna chiamata all'API, risposte finte. Solo per sviluppo e test. */
export function llmMock(): boolean {
  return process.env.LLM_MOCK === "1";
}

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new LlmError("Chiave API di Anthropic non configurata: imposta ANTHROPIC_API_KEY nel file .env.local (o nelle variabili d'ambiente di Vercel).", "not_configured", 400);
  }
  if (!client) client = new Anthropic({ maxRetries: 3 });
  return client;
}

// Prezzi in $ per milione di token (input, output). Lettura da cache ≈ 5-10% dell'input, scrittura ≈ 125%.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-2": [8, 40],
};

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export function usageOf(model: string, u: Anthropic.Usage): Usage {
  const [pin, pout] = PRICES[model] ?? PRICES[DEFAULT_MODEL];
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const inputTokens = u.input_tokens + cacheRead + cacheWrite;
  const costUsd = (u.input_tokens * pin + cacheWrite * pin * 1.25 + cacheRead * pin * 0.1 + u.output_tokens * pout) / 1e6;
  return { inputTokens, outputTokens: u.output_tokens, costUsd };
}

/** Stima grossolana dei token di un testo (inglese/italiano: ~3,6 caratteri per token). */
export const estimateTokens = (chars: number) => Math.ceil(chars / 3.6);

/** Oltre questa soglia il documento non entra nel contesto del modello insieme al resto. */
export const MAX_DOC_TOKENS = 800_000;

function handleApiError(e: unknown): never {
  if (e instanceof LlmError) throw e;
  if (e instanceof Anthropic.AuthenticationError) throw new LlmError("Chiave API di Anthropic non valida.", "not_configured", 400);
  if (e instanceof Anthropic.PermissionDeniedError) throw new LlmError("La chiave API non ha accesso al modello richiesto.", "api", 400);
  if (e instanceof Anthropic.NotFoundError) throw new LlmError(`Modello "${llmModel()}" non trovato: controlla ANTHROPIC_MODEL.`, "api", 400);
  if (e instanceof Anthropic.RateLimitError) throw new LlmError("Limite di richieste dell'API raggiunto: riprova tra qualche minuto.", "api", 429);
  if (e instanceof Anthropic.BadRequestError) throw new LlmError("Richiesta rifiutata dall'API: " + e.message, "api", 400);
  if (e instanceof Anthropic.APIError) throw new LlmError(`Errore dell'API di Anthropic (${e.status ?? "rete"}): ${e.message}`, "api", 502);
  throw e;
}

function checkStop(msg: Anthropic.Message) {
  if (msg.stop_reason === "refusal") throw new LlmError("Il modello ha rifiutato la richiesta.", "refusal", 422);
  if (msg.stop_reason === "max_tokens") throw new LlmError("Risposta troncata: il documento produce più dati del limite di output. Riprova.", "truncated", 422);
  if (msg.stop_reason === "model_context_window_exceeded") throw new LlmError("Il documento è troppo lungo per il modello.", "too_large", 422);
}

const textOf = (msg: Anthropic.Message) => msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");

export interface StructuredRequest<S extends z.ZodType> {
  system: string;
  /** contesto lungo e stabile (il documento): messo in cache così i passaggi successivi costano ~10% */
  context: string;
  instruction: string;
  schema: S;
  effort: Effort;
  maxTokens?: number;
}

/** Chiamata con output JSON garantito dallo schema. Usa lo streaming per non incorrere in timeout su documenti lunghi. */
export async function runStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<{ data: z.infer<S>; usage: Usage }> {
  const model = llmModel();
  try {
    const stream = getClient().messages.stream({
      model,
      max_tokens: req.maxTokens ?? 48000,
      thinking: { type: "adaptive" },
      output_config: { effort: llmEffort(req.effort), format: zodOutputFormat(req.schema) },
      system: req.system,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: req.context, cache_control: { type: "ephemeral" } },
            { type: "text", text: req.instruction },
          ],
        },
      ],
    });
    const msg = await stream.finalMessage();
    checkStop(msg);
    let json: unknown;
    try {
      json = JSON.parse(textOf(msg));
    } catch {
      throw new LlmError("Il modello ha restituito un JSON non valido.", "invalid", 502);
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success) throw new LlmError("Il modello ha restituito dati non conformi allo schema: " + parsed.error.message.slice(0, 300), "invalid", 502);
    return { data: parsed.data, usage: usageOf(model, msg.usage) };
  } catch (e) {
    handleApiError(e);
  }
}

export interface TextRequest {
  system: string;
  /** blocchi di contesto stabili (in cache), poi la conversazione */
  context?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  effort: Effort;
  maxTokens?: number;
  onText?: (delta: string) => void;
}

/** Risposta testuale in streaming (chat, memo, sintesi). */
export async function runText(req: TextRequest): Promise<{ text: string; usage: Usage }> {
  const model = llmModel();
  try {
    const messages: Anthropic.MessageParam[] = [];
    if (req.context) {
      messages.push({ role: "user", content: [{ type: "text", text: req.context, cache_control: { type: "ephemeral" } }] });
      messages.push({ role: "assistant", content: "Ho letto il materiale. Sono pronto." });
    }
    for (const m of req.messages) messages.push({ role: m.role, content: m.content });
    const stream = getClient().messages.stream({
      model,
      max_tokens: req.maxTokens ?? 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: llmEffort(req.effort) },
      system: req.system,
      messages,
    });
    if (req.onText) stream.on("text", (delta) => req.onText!(delta));
    const msg = await stream.finalMessage();
    checkStop(msg);
    return { text: textOf(msg), usage: usageOf(model, msg.usage) };
  } catch (e) {
    handleApiError(e);
  }
}

/** Impagina il testo di un documento con marcatori di pagina, così il modello può citare la pagina. */
export function renderPages(title: string, pages: string[]): string {
  return `<documento titolo="${title.replace(/"/g, "'")}">\n` + pages.map((p, i) => `<pagina n="${i + 1}">\n${p}\n</pagina>`).join("\n") + "\n</documento>";
}
