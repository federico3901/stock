// Conversione in testo di un filing HTML (formato in cui la SEC pubblica 10-K e 10-Q).
// Gira nel browser (usa il DOM). Le tabelle diventano righe con le celle separate da " | ".

import { paginate } from "./layout";

const BLOCK = new Set(["P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "SECTION", "ARTICLE", "BLOCKQUOTE", "UL", "OL", "CENTER", "PRE", "DL", "DT", "DD"]);
const SKIP = new Set(["SCRIPT", "STYLE", "HEAD", "NOSCRIPT", "IX:HEADER", "TITLE", "META", "LINK"]);
const PAGE_BREAK = "\f";

const collapse = (s: string) => s.replace(/[\s ]+/g, " ");

function isHidden(el: Element): boolean {
  const style = el.getAttribute("style") ?? "";
  return /display\s*:\s*none/i.test(style);
}

function isPageBreak(el: Element): boolean {
  const style = el.getAttribute("style") ?? "";
  return /page-break-(before|after)\s*:\s*always/i.test(style) || /break-(before|after)\s*:\s*page/i.test(style);
}

function rowText(tr: Element): string {
  const cells: string[] = [];
  for (const cell of Array.from(tr.children)) {
    if (cell.tagName !== "TD" && cell.tagName !== "TH") continue;
    if (isHidden(cell)) continue;
    const t = collapse(cell.textContent ?? "").trim();
    if (t) cells.push(t);
  }
  return cells
    .join(" | ")
    .replace(/\$ \| (?=[\d(])/g, "$")
    .replace(/ \| \)/g, ")")
    .replace(/ \| %/g, "%")
    .replace(/\( \| /g, "(");
}

export function htmlToPages(doc: Document): string[] {
  const out: string[] = [];
  let inline = "";
  const flush = () => {
    const t = collapse(inline).trim();
    if (t) out.push(t, "");
    inline = "";
  };
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      inline += node.nodeValue ?? "";
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (SKIP.has(tag) || isHidden(el)) return;
    if (tag === "HR" || isPageBreak(el)) {
      flush();
      out.push(PAGE_BREAK);
      if (tag === "HR") return;
    }
    if (tag === "BR") {
      inline += "\n";
      return;
    }
    if (tag === "TABLE") {
      flush();
      const rows = Array.from(el.querySelectorAll("tr")).filter((tr) => tr.closest("table") === el);
      const lines = rows.map(rowText).filter(Boolean);
      // le tabelle usate solo per impaginare un paragrafo (una cella per riga) restano testo normale
      if (lines.length) out.push(...lines, "");
      return;
    }
    if (BLOCK.has(tag)) {
      flush();
      el.childNodes.forEach(walk);
      flush();
      return;
    }
    el.childNodes.forEach(walk);
  };
  walk(doc.body ?? doc.documentElement);
  flush();
  const text = out.join("\n").replace(/\n{3,}/g, "\n\n");
  return paginate(text);
}

export function parseHtml(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return htmlToPages(doc);
}
