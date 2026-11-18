"use client";
// Lettura dei documenti NEL BROWSER: al server arriva solo il testo, così non ci sono limiti
// di dimensione dell'upload (Vercel accetta al massimo 4,5 MB per richiesta) e il file originale non lascia il computer.

import { layoutPage, paginate, type TextFragment } from "./layout";
import { parseHtml } from "./html";
import type { DocType, FiscalPeriod } from "../types";

export interface ParsedFile {
  fileName: string;
  pages: string[];
  charCount: number;
  /** pagine senza testo: se sono molte il PDF è probabilmente una scansione */
  emptyPages: number;
  guess: { type: DocType; fiscalYear?: number; fiscalPeriod?: FiscalPeriod; title: string };
}

async function parsePdf(file: File, onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const fragments: TextFragment[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      fragments.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height || Math.abs(item.transform[3]) });
    }
    pages.push(layoutPage(fragments));
    page.cleanup();
    onProgress?.(i, pdf.numPages);
  }
  await pdf.loadingTask.destroy();
  return pages;
}

/** Riconosce tipo di documento e periodo dalle prime pagine e dal nome del file: solo un suggerimento, modificabile. */
export function guessMeta(fileName: string, pages: string[]): ParsedFile["guess"] {
  const head = pages.slice(0, 3).join("\n").slice(0, 8000);
  const name = fileName.replace(/\.[a-z0-9]+$/i, "");
  const hay = (name + "\n" + head).toLowerCase();
  let type: DocType = "other";
  if (/form\s*10-?k\b|annual report pursuant to section 13/.test(hay) || /(?<![a-z0-9])10-?k(?![a-z0-9])/.test(name.toLowerCase())) type = "10-K";
  else if (/form\s*10-?q\b|quarterly report pursuant to section 13/.test(hay) || /(?<![a-z0-9])10-?q(?![a-z0-9])/.test(name.toLowerCase())) type = "10-Q";
  else if (/earnings call|conference call|operator:|question-and-answer/.test(hay)) type = "transcript";
  else if (/form\s*8-?k\b/.test(hay)) type = "8-K";
  else if (/reports? (first|second|third|fourth|full)[- ](quarter|year)|financial results|comunicato stampa|press release/.test(hay)) type = "earnings_release";
  else if (/investor (presentation|day)|presentazione|safe harbor/.test(hay) || pages.length > 5 && pages.slice(0, 10).every((p) => p.length < 1500)) type = "presentation";
  else if (/annual report|relazione finanziaria annuale|bilancio consolidato/.test(hay)) type = "annual_report";

  let fiscalYear: number | undefined;
  // "ended March 31, 2025" oppure "ended 31 March 2025": l'anno è l'ultimo numero della data
  const ended = /(?:fiscal year|quarterly period|period|year|quarter|months) ended\s+(?:([a-z]+)\.?\s+\d{1,2},?\s+|\d{1,2}\s+([a-z]+)\.?,?\s+)?((?:19|20)\d{2})/i.exec(head);
  const fy =
    (ended ? [ended[0], ended[3]] : null) ??
    /(?:fy|esercizio|anno)\s*'?(\d{4})/i.exec(hay) ??
    /\b(20\d{2})\b/.exec(name);
  if (fy) fiscalYear = Number(fy[1]);
  let fiscalPeriod: FiscalPeriod | undefined = type === "10-K" || type === "annual_report" ? "FY" : undefined;
  const q = /(?<![a-z0-9])q([1-4])(?![a-z0-9])/i.exec(name) ?? /\b(first|second|third|fourth)[- ]quarter/i.exec(head);
  if (q && type !== "10-K") {
    const map: Record<string, FiscalPeriod> = { "1": "Q1", "2": "Q2", "3": "Q3", "4": "Q4", first: "Q1", second: "Q2", third: "Q3", fourth: "Q4" };
    fiscalPeriod = map[q[1].toLowerCase()];
  }
  const typeLabel: Record<DocType, string> = {
    "10-K": "10-K", "10-Q": "10-Q", "8-K": "8-K", earnings_release: "Comunicato risultati", presentation: "Presentazione",
    transcript: "Trascrizione call", annual_report: "Bilancio annuale", other: "",
  };
  // 10-Q senza trimestre esplicito: lo si deduce dal mese di chiusura, ipotizzando l'esercizio solare
  // (è solo una proposta: l'utente la vede e può correggerla prima di caricare)
  if (type === "10-Q" && !fiscalPeriod && ended) {
    const month = (ended[1] ?? ended[2] ?? "").slice(0, 3).toLowerCase();
    fiscalPeriod = ({ mar: "Q1", jun: "Q2", sep: "Q3" } as Record<string, FiscalPeriod>)[month];
  }
  const title = type === "other" ? name : [typeLabel[type], fiscalPeriod && fiscalPeriod !== "FY" ? fiscalPeriod : "", fiscalYear ?? ""].filter(Boolean).join(" ");
  return { type, fiscalYear, fiscalPeriod, title: title || name };
}

export async function parseFile(file: File, onProgress?: (done: number, total: number) => void): Promise<ParsedFile> {
  const lower = file.name.toLowerCase();
  let pages: string[];
  if (lower.endsWith(".pdf") || file.type === "application/pdf") {
    pages = await parsePdf(file, onProgress);
  } else if (/\.(html?|xhtml)$/.test(lower) || file.type === "text/html") {
    pages = parseHtml(await file.text());
  } else if (/\.(txt|md|csv)$/.test(lower) || file.type.startsWith("text/")) {
    pages = paginate(await file.text());
  } else {
    throw new Error(`Formato non supportato: ${file.name}. Carica PDF, HTML o testo.`);
  }
  const emptyPages = pages.filter((p) => p.trim().length < 20).length;
  return {
    fileName: file.name,
    pages,
    charCount: pages.reduce((a, p) => a + p.length, 0),
    emptyPages,
    guess: guessMeta(file.name, pages),
  };
}
