// Ricostruzione del testo di una pagina PDF a partire dai frammenti posizionati:
// raggruppa per riga, mantiene separate le colonne delle tabelle e individua i paragrafi.

export interface TextFragment {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Line {
  y: number;
  height: number;
  items: TextFragment[];
}

export function layoutPage(fragments: TextFragment[]): string {
  const items = fragments.filter((f) => f.str.trim().length > 0);
  if (!items.length) return "";
  // dall'alto verso il basso (nel PDF l'asse y cresce verso l'alto)
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of items) {
    const h = it.height || 10;
    const line = lines.length ? lines[lines.length - 1] : undefined;
    if (line && Math.abs(line.y - it.y) <= Math.max(2, Math.min(line.height, h) * 0.45)) {
      line.items.push(it);
      line.height = Math.max(line.height, h);
    } else {
      lines.push({ y: it.y, height: h, items: [it] });
    }
  }
  const out: string[] = [];
  let prev: Line | undefined;
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    let text = "";
    let endX: number | undefined;
    for (const it of line.items) {
      if (endX !== undefined) {
        const gap = it.x - endX;
        const h = it.height || line.height;
        if (gap > h * 1.1) text += "   "; // colonna di una tabella
        else if (gap > h * 0.12 && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
      }
      text += it.str;
      endX = it.x + it.width;
    }
    text = text.replace(/\s+$/g, "");
    // i simboli staccati dai numeri ($ 1.234 / 1.234 ) / 12 %) vengono riattaccati
    text = text.replace(/\$\s+(?=[\d(])/g, "$").replace(/(\d)\s+\)/g, "$1)").replace(/(\d)\s+%/g, "$1%");
    if (prev && prev.y - line.y > Math.max(prev.height, line.height) * 1.75) out.push("");
    out.push(text);
    prev = line;
  }
  return out.join("\n").trim();
}

/** Divide un testo semplice in "pagine" di dimensione gestibile, senza spezzare i paragrafi. */
export function paginate(text: string, target = 4500): string[] {
  const byFormFeed = text.split("\f").map((p) => p.trim()).filter(Boolean);
  const pages: string[] = [];
  for (const chunk of byFormFeed) {
    if (chunk.length <= target * 1.5) {
      pages.push(chunk);
      continue;
    }
    let cur = "";
    for (const para of chunk.split(/\n\s*\n/)) {
      if (cur && cur.length + para.length > target) {
        pages.push(cur.trim());
        cur = "";
      }
      cur += (cur ? "\n\n" : "") + para.trim();
    }
    if (cur.trim()) pages.push(cur.trim());
  }
  return pages;
}
