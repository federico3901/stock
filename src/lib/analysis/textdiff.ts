// Confronto testuale tra due filing: individua le sezioni standard (Item 1A, Item 7, ...) e
// trova i paragrafi nuovi, rimossi o riscritti da un anno all'altro.

export type SectionKey = "business" | "risk_factors" | "legal" | "mdna" | "market_risk" | "controls";

export const SECTION_LABELS: Record<SectionKey, string> = {
  business: "Descrizione del business (Item 1)",
  risk_factors: "Fattori di rischio (Item 1A)",
  legal: "Procedimenti legali",
  mdna: "Commento del management (MD&A)",
  market_risk: "Rischi di mercato",
  controls: "Controlli e procedure",
};

interface Heading {
  key: SectionKey | "_other";
  re: RegExp;
}

// "_other" = intestazioni che chiudono una sezione senza essere d'interesse
const HEADINGS: Heading[] = [
  { key: "risk_factors", re: /^item\s*1a\b[\s.:\-–—]*risk\s+factors/i },
  { key: "_other", re: /^item\s*1b\b/i },
  { key: "_other", re: /^item\s*1c\b/i },
  { key: "business", re: /^item\s*1\b[\s.:\-–—]*business/i },
  { key: "_other", re: /^item\s*2\b[\s.:\-–—]*properties/i },
  { key: "mdna", re: /^item\s*[27]\b[\s.:\-–—]*management[’'`s\s]*discussion/i },
  { key: "legal", re: /^item\s*[13]\b[\s.:\-–—]*legal\s+proceedings/i },
  { key: "_other", re: /^item\s*4\b[\s.:\-–—]*(mine|controls)/i },
  { key: "_other", re: /^item\s*5\b/i },
  { key: "_other", re: /^item\s*6\b/i },
  { key: "market_risk", re: /^item\s*(7a|3)\b[\s.:\-–—]*quantitative\s+and\s+qualitative/i },
  { key: "_other", re: /^item\s*8\b/i },
  { key: "_other", re: /^item\s*9\b(?!a)/i },
  { key: "controls", re: /^item\s*(9a|4)\b[\s.:\-–—]*controls\s+and\s+procedures/i },
  { key: "_other", re: /^item\s*9b\b/i },
  { key: "_other", re: /^item\s*1[0-6]\b/i },
  { key: "_other", re: /^part\s+(i{1,3}|iv)\b\s*$/i },
  { key: "_other", re: /^signatures?\s*$/i },
];

export interface Section {
  key: SectionKey;
  startPage: number;
  text: string;
}

/**
 * Individua le sezioni standard di un 10-K/10-Q. L'indice iniziale ripete gli stessi titoli:
 * per ogni sezione si tiene l'occorrenza che produce il testo più lungo.
 */
export function findSections(pages: string[]): Partial<Record<SectionKey, Section>> {
  const lines: { text: string; page: number }[] = [];
  pages.forEach((p, i) => p.split("\n").forEach((l) => lines.push({ text: l, page: i + 1 })));
  const marks: { key: Heading["key"]; line: number }[] = [];
  lines.forEach((l, i) => {
    const t = l.text.trim();
    if (t.length < 6 || t.length > 140) return;
    const h = HEADINGS.find((h) => h.re.test(t));
    if (h) marks.push({ key: h.key, line: i });
  });
  const out: Partial<Record<SectionKey, Section>> = {};
  marks.forEach((m, i) => {
    if (m.key === "_other") return;
    const end = i + 1 < marks.length ? marks[i + 1].line : lines.length;
    const text = lines.slice(m.line + 1, end).map((l) => l.text).join("\n").trim();
    const prev = out[m.key];
    if (!prev || text.length > prev.text.length) out[m.key] = { key: m.key, startPage: lines[m.line].page, text };
  });
  // scarta i frammenti dell'indice
  for (const k of Object.keys(out) as SectionKey[]) if (out[k]!.text.length < 400) delete out[k];
  return out;
}

/** Divide il testo in paragrafi significativi (righe vuote come separatore). */
export function paragraphs(text: string, minLength = 80): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= minLength);
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\d.,]+/g, "#") // i numeri cambiano ogni anno: non contano come modifica
    .replace(/[^a-zà-ÿ#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function shingles(s: string): Set<string> {
  const w = normalize(s).split(" ");
  const out = new Set<string>();
  if (w.length < 3) {
    out.add(w.join(" "));
    return out;
  }
  for (let i = 0; i + 3 <= w.length; i++) out.add(w[i] + " " + w[i + 1] + " " + w[i + 2]);
  return out;
}

/** Jaccard e "contenimento" (quota del paragrafo più corto ritrovata nell'altro). */
function similarity(a: Set<string>, b: Set<string>): { jaccard: number; containment: number } {
  if (!a.size || !b.size) return { jaccard: 0, containment: 0 };
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of s) if (l.has(x)) inter++;
  return { jaccard: inter / (a.size + b.size - inter), containment: s.size >= 8 ? inter / s.size : 0 };
}

export interface ParagraphChange {
  kind: "nuovo" | "rimosso" | "modificato";
  text: string;
  /** testo precedente (solo per "modificato") */
  before?: string;
  similarity?: number;
}

export interface SectionDiff {
  key: SectionKey;
  oldLength: number;
  newLength: number;
  unchanged: number;
  changes: ParagraphChange[];
}

/** Confronta i paragrafi di due versioni della stessa sezione. */
export function diffParagraphs(oldText: string, newText: string): { unchanged: number; changes: ParagraphChange[] } {
  const oldP = paragraphs(oldText);
  const newP = paragraphs(newText);
  const oldNorm = new Map<string, number[]>();
  oldP.forEach((p, i) => {
    const n = normalize(p);
    if (!oldNorm.has(n)) oldNorm.set(n, []);
    oldNorm.get(n)!.push(i);
  });
  const usedOld = new Set<number>();
  const pendingNew: number[] = [];
  let unchanged = 0;
  newP.forEach((p, i) => {
    const hit = oldNorm.get(normalize(p))?.find((j) => !usedOld.has(j));
    if (hit !== undefined) {
      usedOld.add(hit);
      unchanged++;
    } else pendingNew.push(i);
  });
  const oldLeft = oldP.map((_, i) => i).filter((i) => !usedOld.has(i));
  const oldSh = new Map(oldLeft.map((i) => [i, shingles(oldP[i])]));
  const changes: ParagraphChange[] = [];
  for (const i of pendingNew) {
    const sh = shingles(newP[i]);
    let best = -1;
    let bestSim = 0;
    let bestScore = 0;
    for (const j of oldLeft) {
      if (usedOld.has(j)) continue;
      const sim = similarity(sh, oldSh.get(j)!);
      // un paragrafo ampliato o accorciato resta "lo stesso" se buona parte del più corto si ritrova nell'altro
      const score = Math.max(sim.jaccard, sim.containment * 0.85);
      if (score > bestScore) {
        bestScore = score;
        bestSim = sim.jaccard;
        best = j;
      }
    }
    if (best >= 0 && bestSim >= 0.9) {
      usedOld.add(best);
      unchanged++;
    } else if (best >= 0 && bestScore >= 0.35) {
      usedOld.add(best);
      changes.push({ kind: "modificato", text: newP[i], before: oldP[best], similarity: bestSim });
    } else {
      changes.push({ kind: "nuovo", text: newP[i] });
    }
  }
  for (const j of oldLeft) if (!usedOld.has(j)) changes.push({ kind: "rimosso", text: oldP[j] });
  return { unchanged, changes };
}

/** Confronto completo tra due filing, sezione per sezione. */
export function diffFilings(oldPages: string[], newPages: string[]): SectionDiff[] {
  const a = findSections(oldPages);
  const b = findSections(newPages);
  const out: SectionDiff[] = [];
  for (const key of Object.keys(SECTION_LABELS) as SectionKey[]) {
    if (!a[key] || !b[key]) continue;
    const d = diffParagraphs(a[key]!.text, b[key]!.text);
    out.push({ key, oldLength: a[key]!.text.length, newLength: b[key]!.text.length, ...d });
  }
  return out;
}
