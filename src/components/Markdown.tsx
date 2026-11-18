"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface DocRef {
  id: string;
  title: string;
}

/**
 * Trasforma le citazioni "[Titolo documento, p. 12]" in link interni "#doc:<id>:<pagina>".
 * Il titolo deve corrispondere a uno dei documenti noti.
 */
export function linkCitations(text: string, docs: DocRef[]): string {
  if (!docs.length) return text;
  return text.replace(/\[([^\[\]]{2,120}?),\s*pp?\.\s*(\d+)(?:\s*[-–]\s*\d+)?\]/g, (whole, title: string, page: string) => {
    const t = title.trim().toLowerCase();
    const doc = docs.find((d) => d.title.toLowerCase() === t) ?? docs.find((d) => d.title.toLowerCase().includes(t) || t.includes(d.title.toLowerCase()));
    return doc ? `[${title.trim()}, p. ${page}](#doc:${doc.id}:${page})` : whole;
  });
}

export function Markdown({ children, docs, onDoc }: { children: string; docs?: DocRef[]; onDoc?: (docId: string, page: number) => void }) {
  const text = docs && onDoc ? linkCitations(children, docs) : children;
  return (
    <div className="prose-app text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: c }) => {
            if (href?.startsWith("#doc:") && onDoc) {
              const [, id, page] = href.split(":");
              return (
                <button type="button" onClick={() => onDoc(id, Number(page))} className="text-accent-ink underline decoration-dotted hover:decoration-solid text-[0.92em]">
                  {c}
                </button>
              );
            }
            return <a href={href} target="_blank" rel="noreferrer">{c}</a>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
