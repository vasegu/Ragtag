"use client";

import { useEffect, useState } from "react";
import type { Decision } from "@/lib/report/pipeline";

const QUESTIONS = [
  "Does the photo show a real issue?",
  "What kind of issue is it?",
  "Who is responsible?",
  "How bad is it, and what applies?",
  "What work is needed?",
];

const BRANCHES: { key: Decision["status"]; label: string; colour: string }[] = [
  { key: "pass", label: "Pass", colour: "#00b341" },
  { key: "review", label: "Review", colour: "#f0a020" },
  { key: "refer", label: "Refer", colour: "#4f8cff" },
  { key: "reject", label: "Reject", colour: "#e5484d" },
];

/**
 * Santiago's five pipeline decisions as a branching path. While the pipeline runs, each
 * node "thinks" in turn; when results arrive they're revealed one by one with the branch
 * taken lit up and the others dimmed.
 */
export function DecisionTree({ trace, running, error }: { trace: Decision[] | null; running: boolean; error: string | null }) {
  const [thinking, setThinking] = useState(0);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setThinking((n) => (n + 1) % QUESTIONS.length), 1600);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (!trace) return;
    setRevealed(0);
    const t = setInterval(() => setRevealed((n) => (n >= trace.length ? n : n + 1)), 650);
    return () => clearInterval(t);
  }, [trace]);

  return (
    <div className="rounded-[24px] bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">How the council AI decides</p>
        <span className={`rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] ${trace ? "bg-hackney-tint text-hackney" : error ? "bg-[#fdecea] text-[#b42318]" : "bg-canvas text-muted"}`}>
          {trace ? "Decided" : error ? "Unavailable" : "Thinking"}
        </span>
      </div>
      {error && !trace && <p className="mt-3 text-[13px] text-muted">{error} Your report still goes through; a person will triage it.</p>}

      <ol className="mt-3">
        {QUESTIONS.map((q, i) => {
          const d = trace?.[i];
          const shown = Boolean(d) && i < revealed;
          const active = !trace && running && i === thinking;
          const taken = shown ? BRANCHES.find((b) => b.key === d!.status) : undefined;
          const skipped = shown && d!.status === "skipped";
          return (
            <li key={q} className="relative flex gap-3 pb-3 last:pb-0">
              {i < QUESTIONS.length - 1 && (
                <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-[2px] overflow-hidden rounded-full bg-line">
                  <span className="block w-full rounded-full transition-all duration-500" style={{ height: shown ? "100%" : "0%", background: taken?.colour ?? "#00b341" }} />
                </span>
              )}
              <span
                className={`relative z-10 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold transition-all duration-300 ${
                  shown ? "text-white" : active ? "bg-white text-hackney ring-2 ring-hackney-bright" : "bg-canvas text-muted"
                }`}
                style={shown ? { background: skipped ? "#a3a39c" : taken?.colour, boxShadow: `0 0 0 4px ${taken?.colour ?? "#a3a39c"}22` } : undefined}
              >
                {active && <span className="absolute inset-0 animate-ping rounded-full bg-hackney-bright/30" />}
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-[13.5px] font-semibold leading-snug ${shown || active ? "text-ink" : "text-muted"}`}>{q}</p>
                {shown ? (
                  <div className="pop-in">
                    <p className="mt-0.5 text-[13px] leading-snug text-ink">{d!.answer}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {BRANCHES.map((b) => {
                        const on = b.key === d!.status;
                        return (
                          <span
                            key={b.key}
                            className={`rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] transition ${on ? "text-white" : "bg-canvas text-muted/60 line-through decoration-muted/30"}`}
                            style={on ? { background: b.colour } : undefined}
                          >
                            {b.label}
                          </span>
                        );
                      })}
                      {d!.confidence !== null && <span className="ml-auto font-mono text-[10px] text-muted">{Math.round(d!.confidence * 100)}% sure</span>}
                    </div>
                    <p className="mt-1 font-mono text-[9.5px] leading-snug text-muted">{d!.method}</p>
                  </div>
                ) : active ? (
                  <p className="mt-0.5 text-[12px] text-hackney">Checking…</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
