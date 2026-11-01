"use client";

import ReactMarkdown from "react-markdown";
import type { Source } from "@/lib/ask/useAsk";

/** Turn bare [n] citations into #cite-n links so the markdown renderer hands them to us. */
const linkCitations = (text: string) => text.replace(/\[(\d+)\](?!\()/g, "[$1](#cite-$1)");

export function Answer({ text, sources }: { text: string; sources: Source[] }) {
  return (
    <div className="answer text-[17px] leading-[1.65] text-ink">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => {
            const cite = href?.match(/^#cite-(\d+)$/);
            if (cite) {
              const source = sources.find((s) => s.n === Number(cite[1]));
              return (
                <a
                  href={source?.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  title={source ? source.title : undefined}
                  className="mx-0.5 inline-flex h-[20px] min-w-[20px] -translate-y-[2px] items-center justify-center rounded-full bg-hackney-tint px-1.5 align-middle font-mono text-[11px] font-medium text-hackney no-underline transition hover:bg-hackney hover:text-white"
                >
                  {cite[1]}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" className="font-medium text-hackney underline decoration-hackney/30 underline-offset-[3px] hover:decoration-hackney">
                {children}
              </a>
            );
          },
        }}
      >
        {linkCitations(text)}
      </ReactMarkdown>
    </div>
  );
}
