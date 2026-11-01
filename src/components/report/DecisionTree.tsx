"use client";

import { useEffect, useState } from "react";
import type { Decision } from "@/lib/report/pipeline";

const QUESTIONS = [
  "Is it a real issue?",
  "What kind of issue?",
  "Who is responsible?",
  "How bad, and what applies?",
  "What work is needed?",
];

const BRANCHES: { key: Decision["status"]; label: string; colour: string }[] = [
  { key: "pass", label: "Pass", colour: "#00b341" },
  { key: "review", label: "Review", colour: "#f0a020" },
  { key: "refer", label: "Refer", colour: "#4f8cff" },
  { key: "reject", label: "Reject", colour: "#e5484d" },
];

/** A fast first-look answer per question, shown until the full pipeline decides. */
export type FirstLook = (string | null)[];

/**
 * The upload's single focal point: Santiago's five pipeline decisions as a branching path.
 * The quick classifier fills in a first look straight away; the pipeline then decides each
 * question in turn, forking into its four outcomes with the branch taken lit up.
 */
export function DecisionTree({
  trace,
  running,
  error,
  firstLook,
  onDispute,
  disputed = {},
}: {
  trace: Decision[] | null;
  running: boolean;
  error: string | null;
  firstLook: FirstLook;
  /** Resident disagrees with a decided step (2-5). */
  onDispute?: (stage: number, answer: string) => void;
  disputed?: Record<number, string>;
}) {
  const [thinking, setThinking] = useState(0);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setThinking((n) => (n + 1) % QUESTIONS.length), 1400);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (!trace) return;
    setRevealed(0);
    const t = setInterval(() => setRevealed((n) => (n >= trace.length ? n : n + 1)), 700);
    return () => clearInterval(t);
  }, [trace]);

  const done = Boolean(trace) && revealed >= (trace?.length ?? 0);

  return (
    <div className="rounded-[24px] bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">The council AI is deciding</p>
        <span
          className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] ${
            done ? "bg-hackney-tint text-hackney" : error ? "bg-[#fdecea] text-[#b42318]" : "bg-canvas text-muted"
          }`}
        >
          {!done && !error && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-hackney-bright" />}
          {done ? "Decided" : error ? "First look only" : `Step ${trace ? Math.min(revealed + 1, 5) : thinking + 1} of 5`}
        </span>
      </div>

      <ol className="mt-3">
        {QUESTIONS.map((q, i) => {
          const d = trace?.[i];
          const decided = Boolean(d) && i < revealed;
          const active = (!trace && running && i === thinking) || (Boolean(trace) && i === revealed);
          const taken = decided ? BRANCHES.find((b) => b.key === d!.status) : undefined;
          const skipped = decided && d!.status === "skipped";
          const colour = skipped ? "#a3a39c" : (taken?.colour ?? "#00b341");
          const provisional = !decided ? firstLook[i] : null;
          return (
            <li key={q} className="relative flex gap-3 pb-4 last:pb-0">
              {/* Trunk to the next question, filled in the colour of the branch taken. */}
              {i < QUESTIONS.length - 1 && (
                <span className="absolute left-[13px] top-7 h-[calc(100%-22px)] w-[2px] overflow-hidden rounded-full bg-line">
                  <span className="block w-full rounded-full transition-all duration-700 ease-out" style={{ height: decided ? "100%" : "0%", background: colour }} />
                </span>
              )}
              <span
                className={`relative z-10 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold transition-all duration-300 ${
                  decided ? "text-white" : active ? "bg-white text-hackney ring-2 ring-hackney-bright" : "bg-canvas text-muted"
                }`}
                style={decided ? { background: colour, boxShadow: `0 0 0 4px ${colour}26` } : undefined}
              >
                {active && !decided && <span className="absolute inset-0 animate-ping rounded-full bg-hackney-bright/30" />}
                {i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`text-[13.5px] font-semibold leading-snug ${decided || active || provisional ? "text-ink" : "text-muted"}`}>{q}</p>
                  {decided && d!.confidence !== null && <span className="shrink-0 font-mono text-[10px] text-muted">{Math.round(d!.confidence * 100)}%</span>}
                </div>

                {decided ? (
                  <div className="pop-in">
                    <p className="mt-0.5 text-[13px] leading-snug text-ink">{d!.answer}</p>
                    {!skipped && <Fork status={d!.status} />}
                    {disputed[i + 1] ? (
                      <p className="mt-1.5 rounded-[10px] bg-[#fff4e0] px-2 py-1 text-[11.5px] text-[#a05a00]">You said: {disputed[i + 1]} · sent to a person to review</p>
                    ) : (
                      onDispute &&
                      i > 0 && (
                        <button onClick={() => onDispute(i + 1, d!.answer)} className="mt-1 text-[11.5px] font-medium text-muted underline decoration-line underline-offset-2 hover:text-ink">
                          Not right?
                        </button>
                      )
                    )}
                  </div>
                ) : provisional ? (
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] leading-snug text-muted">
                    <span className="rounded-full bg-canvas px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em]">First look</span>
                    <span className="truncate">{provisional}</span>
                  </p>
                ) : active ? (
                  <p className="mt-0.5 text-[12px] text-hackney">Checking…</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {error && !trace && <p className="mt-3 text-[12.5px] text-muted">The full assessment is unavailable right now ({error}). Your report still goes through and a person will triage it.</p>}
    </div>
  );
}

/** The four possible outcomes of a decision, drawn as a fork; the branch taken glows, the rest fade. */
function Fork({ status }: { status: Decision["status"] }) {
  const takenIdx = BRANCHES.findIndex((b) => b.key === status);
  const taken = BRANCHES[takenIdx];
  // Branch ends sit at the centre of each of four equal columns.
  const xs = [12.5, 37.5, 62.5, 87.5];
  return (
    <div className="mt-1.5">
      <svg viewBox="0 0 100 18" preserveAspectRatio="none" className="block h-[18px] w-full" aria-hidden>
        {xs.map((x, i) => {
          const on = i === takenIdx;
          return (
            <path
              key={i}
              d={`M 2 0 C 2 10, ${x} 6, ${x} 18`}
              fill="none"
              stroke={on ? taken.colour : "#d9d9d3"}
              strokeWidth={on ? 2.4 : 1.2}
              strokeDasharray={on ? undefined : "2 2"}
              vectorEffect="non-scaling-stroke"
              className={on ? "fork-draw" : ""}
            />
          );
        })}
      </svg>
      <div className="grid grid-cols-4 gap-1">
        {BRANCHES.map((b, i) => {
          const on = i === takenIdx;
          return (
            <span
              key={b.key}
              className={`rounded-full py-0.5 text-center font-mono text-[9.5px] uppercase tracking-[0.06em] transition ${on ? "text-white shadow-sm" : "bg-canvas text-muted/50"}`}
              style={on ? { background: b.colour } : undefined}
            >
              {b.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
