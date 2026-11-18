// Formattazione numerica in stile italiano.

const nf = (digits: number) => new Intl.NumberFormat("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const ok = (v: number | undefined | null): v is number => typeof v === "number" && Number.isFinite(v);

export const DASH = "–";

export function fmtNum(v: number | undefined | null, digits = 0): string {
  return ok(v) ? nf(digits).format(v) : DASH;
}

export function fmtPct(v: number | undefined | null, digits = 1): string {
  return ok(v) ? nf(digits).format(v * 100) + "%" : DASH;
}

export function fmtX(v: number | undefined | null, digits = 1): string {
  return ok(v) ? nf(digits).format(v) + "x" : DASH;
}

/** Importo compatto con scala automatica: 1,2 Mld / 345 Mln / 12 mila. */
export function fmtMoney(v: number | undefined | null, currency = "", digits?: number): string {
  if (!ok(v)) return DASH;
  const a = Math.abs(v);
  const sym = currencySymbol(currency);
  let s: string;
  if (a >= 1e12) s = nf(digits ?? 2).format(v / 1e12) + " Bln";
  else if (a >= 1e9) s = nf(digits ?? (a >= 1e11 ? 0 : 1)).format(v / 1e9) + " Mld";
  else if (a >= 1e6) s = nf(digits ?? (a >= 1e8 ? 0 : 1)).format(v / 1e6) + " Mln";
  else if (a >= 1e4) s = nf(digits ?? 0).format(v / 1e3) + " mila";
  else s = nf(digits ?? (a < 100 ? 2 : 0)).format(v);
  return sym ? `${s} ${sym}` : s;
}

/** Importo in una scala fissa (per le tabelle di bilancio). */
export function fmtScaled(v: number | undefined | null, scale: number, digits = 0): string {
  if (!ok(v)) return DASH;
  const s = nf(digits).format(Math.abs(v) / scale);
  return v < 0 ? `(${s})` : s;
}

export function fmtPerShare(v: number | undefined | null, currency = ""): string {
  if (!ok(v)) return DASH;
  const sym = currencySymbol(currency);
  return nf(2).format(v) + (sym ? " " + sym : "");
}

export function currencySymbol(c: string): string {
  const map: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", CHF: "CHF", CAD: "C$" };
  return map[c?.toUpperCase()] ?? c ?? "";
}

export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return DASH;
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Sceglie la scala (migliaia, milioni, miliardi) più adatta a una serie di importi. */
export function pickScale(values: (number | undefined)[]): { scale: number; label: string } {
  const max = Math.max(0, ...values.filter(ok).map(Math.abs));
  if (max >= 2e10) return { scale: 1e9, label: "miliardi" };
  if (max >= 2e7) return { scale: 1e6, label: "milioni" };
  if (max >= 2e4) return { scale: 1e3, label: "migliaia" };
  return { scale: 1, label: "unità" };
}

export function fmtMetric(v: number | undefined | null, format: string, currency = ""): string {
  switch (format) {
    case "pct": return fmtPct(v);
    case "x": return fmtX(v, 2);
    case "days": return ok(v) ? nf(0).format(v) + " gg" : DASH;
    case "money": return fmtMoney(v, currency);
    case "per_share": return fmtPerShare(v, currency);
    default: return fmtNum(v, 2);
  }
}
