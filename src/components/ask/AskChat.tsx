"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { type Source, type Turn, useAsk } from "@/lib/ask/useAsk";
import { Answer } from "./Answer";

const SUGGESTIONS = [
  { label: "Council tax", q: "I want to pay my council tax" },
  { label: "Bins", q: "My bin wasn't collected this week" },
  { label: "Housing repairs", q: "There's black mould in my council flat. What are my rights?" },
  { label: "Parking", q: "I got a parking ticket I don't think is fair" },
  { label: "Bulky waste", q: "How do I get rid of an old sofa?" },
  { label: "Türkçe", q: "Konut yardımına nasıl başvurabilirim?" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
}

function today() {
  return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export function AskChat() {
  const mock = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("mock");
  const { turns, busy, send, reset } = useAsk({ mock });
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const started = turns.length > 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const submit = (text = draft) => {
    if (!text.trim() || busy) return;
    send(text);
    setDraft("");
  };

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <TopBar onReset={started ? reset : undefined} />

      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col px-4 sm:px-6">
        {!started ? (
          <section className="flex flex-1 flex-col justify-center py-10 sm:py-16">
            <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted">
              London Borough of Hackney · {today()}
            </p>
            <h1 className="mt-5 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[68px]">
              {greeting()}
              <span className="block text-muted-strong">What do you need from the council?</span>
            </h1>

            <div className="mt-10">
              <Composer value={draft} onChange={setDraft} onSubmit={() => submit()} busy={busy} autoFocus large />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.q}
                  onClick={() => submit(s.q)}
                  className="group flex flex-col items-start justify-start rounded-[20px] bg-card p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
                >
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{s.label}</span>
                  <span className="mt-1.5 block text-[15px] leading-snug text-ink">{s.q}</span>
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/street-report" className="rounded-full bg-hackney px-5 py-3 text-[14px] font-medium text-white transition hover:bg-ink">Report a street issue →</Link>
              <Link href="/street-report/pipeline" className="px-3 py-2 text-[13px] text-muted hover:text-hackney">How photo decisions work ↗</Link>
            </div>
            <Stats />
          </section>
        ) : (
          <section className="flex-1 space-y-6 pb-40 pt-8">
            {turns.map((turn) =>
              turn.role === "user" ? <UserBubble key={turn.id} text={turn.text} /> : <AssistantCard key={turn.id} turn={turn} />,
            )}
            <div ref={endRef} />
          </section>
        )}
      </main>

      {started && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 bg-gradient-to-t from-canvas via-canvas/95 to-transparent pb-4 pt-10">
          <div className="pointer-events-auto mx-auto w-full max-w-[880px] px-4 sm:px-6">
            <Composer value={draft} onChange={setDraft} onSubmit={() => submit()} busy={busy} autoFocus />
            <p className="mt-2 text-center text-[12px] text-muted">
              Information, not legal advice. Always check the linked council page before you act.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function TopBar({ onReset }: { onReset?: () => void }) {
  return (
    <header className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-4 py-4 sm:px-6">
      <button onClick={onReset} disabled={!onReset} className="flex items-center gap-3 text-left disabled:cursor-default">
        <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-hackney text-white shadow-card">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M7 5v14M17 5v14M7 12h10" />
          </svg>
        </span>
        <span className="leading-tight">
          <span className="block text-[17px] font-semibold tracking-[-0.01em]">One Hackney</span>
          <span className="block font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">Ask the council</span>
        </span>
      </button>
      <div className="flex items-center gap-2">
        <Link href="/street-report" className="rounded-full bg-hackney-tint px-4 py-2 text-[13px] font-medium text-hackney transition hover:bg-hackney/15">Report an issue</Link>
        {onReset && (
          <button onClick={onReset} className="rounded-full bg-card px-4 py-2 text-[14px] font-medium shadow-card transition hover:shadow-card-hover">
            New question
          </button>
        )}
        <a
          href="https://hackney.gov.uk"
          target="_blank"
          rel="noreferrer"
          className="hidden rounded-full px-4 py-2 text-[14px] text-muted transition hover:text-ink sm:block"
        >
          hackney.gov.uk ↗
        </a>
      </div>
    </header>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  busy,
  autoFocus,
  large,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  autoFocus?: boolean;
  large?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={`flex items-end gap-2 rounded-[26px] bg-card p-2 pl-5 shadow-card ring-1 ring-line transition focus-within:ring-2 focus-within:ring-hackney/40 ${large ? "sm:p-2.5 sm:pl-6" : ""}`}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        autoFocus={autoFocus}
        rows={1}
        placeholder="Ask anything, in any language"
        aria-label="Your question"
        className={`max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 outline-none placeholder:text-muted ${large ? "text-[18px]" : "text-[16px]"}`}
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        aria-label="Ask"
        className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-white transition hover:bg-hackney disabled:bg-ink/25"
      >
        {busy ? <Dots /> : <>Ask <span aria-hidden>→</span></>}
      </button>
    </form>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-[22px] rounded-br-[8px] bg-ink px-5 py-3 text-[16px] leading-relaxed text-white">{text}</p>
    </div>
  );
}

function AssistantCard({ turn }: { turn: Extract<Turn, { role: "assistant" }> }) {
  const cited = new Set([...turn.text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const shown = turn.sources.filter((s) => cited.has(s.n));

  return (
    <article className="rounded-[28px] bg-card p-5 shadow-card sm:p-7">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">One Hackney</span>
        {turn.searches.map((q, i) => (
          <span
            key={i}
            className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-canvas px-2.5 py-1 font-mono text-[11px] text-muted"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="truncate">{q}</span>
          </span>
        ))}
      </div>

      <div className="mt-4">
        {turn.status === "thinking" && !turn.text && (
          <p className="flex items-center gap-3 text-[16px] text-muted">
            <Dots dark /> {turn.searches.length ? "Reading Hackney's pages…" : "Searching hackney.gov.uk…"}
          </p>
        )}
        {turn.text && <Answer text={turn.text} sources={turn.sources} />}
        {turn.status === "error" && (
          <p className="text-[16px] text-[#b42318]">
            Sorry, something went wrong. Please try again, or call Hackney on 020 8356 3000.
          </p>
        )}
      </div>

      {shown.length > 0 && <SourceList sources={shown} />}
    </article>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <div className="mt-6 border-t border-line pt-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Sources</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {sources.map((s) => (
          <li key={s.n}>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="group flex h-full gap-3 rounded-[16px] bg-canvas p-3 transition hover:bg-hackney-tint"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-card font-mono text-[11px] font-medium text-hackney">
                {s.n}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium text-ink group-hover:text-hackney">{s.title}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                  <KindBadge kind={s.kind} />
                  <span className="truncate">{s.heading && s.heading !== s.title ? s.heading : new URL(s.url).hostname.replace(/^www\./, "")}</span>
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KindBadge({ kind }: { kind: Source["kind"] }) {
  const label = kind === "national" ? "National" : kind === "pdf" ? "PDF" : "Hackney";
  const style = kind === "national" ? "bg-[#e8f1fb] text-[#0b5cad]" : "bg-hackney-tint text-hackney";
  return <span className={`shrink-0 rounded-full px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.08em] ${style}`}>{label}</span>;
}

function Stats() {
  const items = [
    { value: "1,000+", label: "council pages read" },
    { value: "24/7", label: "answers, with sources" },
    { value: "Any", label: "language you write in" },
  ];
  return (
    <dl className="mt-10 grid grid-cols-3 divide-x divide-line rounded-[24px] bg-card shadow-card">
      {items.map((i) => (
        <div key={i.label} className="px-4 py-4 sm:px-6 sm:py-5">
          <dt className="sr-only">{i.label}</dt>
          <dd className="text-[24px] font-semibold tracking-[-0.03em] sm:text-[32px]">{i.value}</dd>
          <dd className="mt-0.5 text-[12px] leading-snug text-muted sm:text-[13px]">{i.label}</dd>
        </div>
      ))}
    </dl>
  );
}

function Dots({ dark }: { dark?: boolean }) {
  return (
    <span className="inline-flex gap-1" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 animate-bounce rounded-full ${dark ? "bg-hackney" : "bg-white"}`}
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}
