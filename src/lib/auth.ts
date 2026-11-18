// Protezione opzionale con password (APP_PASSWORD). Usa Web Crypto, così funziona in qualsiasi runtime.

export const AUTH_COOKIE = "stock_auth";

export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode("stock-app-v1:" + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Confronto a tempo costante. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
