"use client";

import { useEffect, useRef, useState } from "react";
import { Answer } from "@/components/ask/Answer";
import { type Turn, useAsk } from "@/lib/ask/useAsk";
import { useVoice } from "@/lib/ask/useVoice";
import { type Player, levelFor } from "@/lib/report/game";
import type { Track } from "@/lib/report/track";
import { CATEGORY_META, type Report } from "@/lib/report/types";
import { Mascot, type MascotKind } from "./Mascot";
import { IconBin, IconCamera, IconChat, IconHome, IconMic, IconParking, IconPin, IconPound, IconSearch, IconUser, IconWrench } from "./icons";
import { CategoryIcon, Flame, Label } from "./ui";

export type Tab = "home" | "ask" | "nearby" | "me";

/* --------------------------------- Tab bar -------------------------------- */

export function TabBar({ tab, onTab, onReport }: { tab: Tab; onTab: (t: Tab) => void; onReport: () => void }) {
  const item = (t: Tab, label: string, Icon: (p: { className?: string }) => React.ReactElement) => (
    <button
      onClick={() => onTab(t)}
      className={`relative flex h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold transition ${tab === t ? "glass-pill text-hackney" : "text-ink/60 hover:text-ink"}`}
    >
      <Icon className="h-[22px] w-[22px]" />
      {label}
    </button>
  );
  return (
    // Liquid glass: a floating, blurred, saturated capsule with a specular top edge.
    <nav className="liquid-glass absolute inset-x-3 bottom-4 z-30 flex items-center gap-1 rounded-full p-1.5">
      {item("home", "Home", IconHome)}
      {item("ask", "Ask", IconChat)}
      <button
        onClick={onReport}
        aria-label="Report a problem"
        className="glass-orb mx-1 grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full text-white transition active:scale-95"
      >
        <IconCamera className="h-6 w-6" />
      </button>
      {item("nearby", "Nearby", IconPin)}
      {item("me", "Me", IconUser)}
    </nav>
  );
}

/* ------------------------------ Home front door ---------------------------- */

const QUICK = [
  { label: "Pay council tax", q: "How do I pay my council tax?", Icon: IconPound },
  { label: "Bin day", q: "When is my bin collection day and what goes in which bin?", Icon: IconBin },
  { label: "Parking permit", q: "How do I get a resident parking permit?", Icon: IconParking },
  { label: "Housing repair", q: "How do I report a repair in my council home?", Icon: IconWrench },
];

export function FrontDoor({
  player,
  mascot,
  active,
  quests,
  onAsk,
  onReport,
  onOpen,
  onTab,
}: {
  player: Player;
  mascot: MascotKind;
  active: { report: Report; track: Track } | null;
  quests: (Report & { distance: number })[];
  onAsk: (q?: string) => void;
  onReport: () => void;
  onOpen: (r: Report) => void;
  onTab: (t: Tab) => void;
}) {
  const lv = levelFor(player.xp);
  const h = new Date().getHours();
  const hello = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-3 px-4 pb-32 pt-1">
      <div className="flex items-center gap-3">
        <Mascot kind={mascot} mood="idle" className="-my-2 h-[76px] w-[76px] shrink-0" />
        <div className="min-w-0 flex-1">
          <Label>One Hackney</Label>
          <p className="text-[24px] font-semibold leading-tight tracking-[-0.025em]">{hello}.</p>
        </div>
        <button onClick={() => onTab("me")} className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 shadow-card">
          <Flame className="h-5 w-5" />
          <span className="text-[15px] font-semibold tabular-nums">{player.streak}</span>
          <span className="ml-1 rounded-full bg-hackney-tint px-1.5 font-mono text-[10px] font-semibold text-hackney">L{lv.level}</span>
        </button>
      </div>

      <button onClick={() => onAsk()} className="flex w-full items-center gap-3 rounded-[22px] bg-card px-4 py-3.5 text-left shadow-card ring-1 ring-line transition active:scale-[0.99]">
        <IconSearch className="h-5 w-5 text-hackney" />
        <span className="flex-1 text-[15.5px] text-muted">Ask the council anything…</span>
        <span className="rounded-full bg-canvas px-2 py-0.5 font-mono text-[10px] text-muted">Any language</span>
      </button>

      <button
        onClick={onReport}
        className="group relative flex w-full items-center gap-4 overflow-hidden rounded-[24px] bg-ink p-4 text-left text-white shadow-card-hover transition active:scale-[0.98]"
      >
        <span className="grid h-12 w-12 place-items-center rounded-[16px] bg-hackney-bright/20">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-hackney-lime" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </span>
        <span className="flex-1">
          <span className="block text-[17px] font-semibold">Report a problem</span>
          <span className="block text-[12.5px] text-white/60">Snap it, see it ranked, watch it get fixed</span>
        </span>
        <span className="text-[20px] text-white/50 transition group-hover:translate-x-1">→</span>
      </button>

      <div className="grid grid-cols-4 gap-2">
        {QUICK.map((q) => (
          <button key={q.label} onClick={() => onAsk(q.q)} className="flex flex-col items-center gap-1.5 rounded-[18px] bg-card px-1 py-3 shadow-card transition active:scale-95">
            <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-hackney-tint text-hackney">
              <q.Icon className="h-[22px] w-[22px]" />
            </span>
            <span className="text-center text-[11px] font-medium leading-tight">{q.label}</span>
          </button>
        ))}
      </div>

      {active && (
        <button onClick={() => onOpen(active.report)} className="w-full text-left">
          <div className="rounded-[24px] bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <Label>Your report</Label>
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] ${active.track.headline.confirmed ? "bg-hackney-tint text-hackney" : "bg-[#fff4e0] text-[#a05a00]"}`}
              >
                {active.track.headline.confirmed ? "Confirmed" : "Estimate"}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <CategoryIcon category={active.report.category} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold">{active.report.title}</p>
                <p className="text-[12.5px] text-muted">
                  {active.track.headline.title} <span className="font-semibold text-ink">{active.track.headline.value}</span>
                  {active.track.queue && <> · #{active.track.queue.category.position} in queue</>}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-1">
              {active.track.stages.map((s) => (
                <span key={s.key} className={`h-1.5 flex-1 rounded-full ${s.state === "done" ? "bg-hackney-bright" : s.state === "current" ? "stage-pulse" : "bg-line"}`} />
              ))}
            </div>
          </div>
        </button>
      )}

      <div>
        <div className="flex items-baseline justify-between px-1">
          <Label>Near you</Label>
          <button onClick={() => onTab("nearby")} className="font-mono text-[10.5px] text-hackney">
            See all →
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {quests.slice(0, 2).map((q) => (
            <ReportRow key={q.id} report={q} onOpen={onOpen} cta="Still there?" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------- Ask ---------------------------------- */

const STREET_AREAS = ["bins-and-recycling", "streets-and-roads", "parking", "environmental-health-and-noise", "community-safety"];

export function AskTab({ initial, mascot, onReport }: { initial: string | null; mascot: MascotKind; onReport: () => void }) {
  const { turns, busy, send } = useAsk();
  const voice = useVoice();
  const [draft, setDraft] = useState("");
  const sentInitial = useRef<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initial && sentInitial.current !== initial) {
      sentInitial.current = initial;
      send(initial);
    }
  }, [initial, send]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const submit = () => {
    if (!draft.trim() || busy) return;
    send(draft);
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-44 pt-1">
        {turns.length === 0 && (
          <div className="pt-6 text-center">
            <p className="text-[24px] font-semibold tracking-[-0.02em]">Ask the council</p>
            <p className="mx-auto mt-1 max-w-[260px] text-[13.5px] text-muted">Answers from Hackney&apos;s own pages, with sources. Any language.</p>
            <div className="mt-5 space-y-2">
              {["My bin wasn't collected", "Can I get help with council tax?", "There's mould in my flat", "Eski bir kanepeden nasıl kurtulurum?"].map((q) => (
                <button key={q} onClick={() => send(q)} className="block w-full rounded-[16px] bg-card px-4 py-3 text-left text-[14px] shadow-card">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t) => (t.role === "user" ? <UserMsg key={t.id} text={t.text} /> : <AssistantMsg key={t.id} turn={t} onReport={onReport} />))}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="absolute inset-x-3 bottom-[88px] z-20 flex items-center gap-2 rounded-full bg-card p-1.5 pl-4 shadow-card-hover ring-1 ring-line"
      >
        <button
          type="button"
          onClick={voice.start}
          aria-label="Talk to One Hackney"
          className="-ml-2.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-hackney transition hover:bg-hackney-tint"
        >
          <IconMic className="h-[22px] w-[22px]" />
        </button>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask anything…" aria-label="Your question" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
        <button type="submit" disabled={busy || !draft.trim()} className="h-10 rounded-full bg-ink px-4 text-[14px] font-semibold text-white disabled:bg-ink/25">
          {busy ? "…" : "Ask"}
        </button>
      </form>
      {voice.status !== "idle" && <LiveVoice voice={voice} mascot={mascot} onReport={onReport} />}
    </div>
  );
}

/** Full-screen live voice mode: a liquid glass orb, live transcript and the pages it used. */
function LiveVoice({ voice, mascot, onReport }: { voice: ReturnType<typeof useVoice>; mascot: MascotKind; onReport: () => void }) {
  const last = voice.lines.slice(-4);
  const state =
    voice.status === "connecting"
      ? "Connecting…"
      : voice.status === "error"
        ? (voice.error ?? "Voice failed to start")
        : voice.searching
          ? `Searching Hackney: ${voice.searching}`
          : voice.speaking
            ? "Speaking"
            : "Listening. Ask anything, in any language";
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-gradient-to-b from-[#eaf6f0] via-canvas to-canvas px-5 pb-28 pt-[58px]">
      <div className="flex items-center justify-between">
        <Label>One Hackney · Live</Label>
        <span className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-hackney shadow-card">
          <span className={`h-1.5 w-1.5 rounded-full ${voice.status === "live" ? "animate-pulse bg-hackney-bright" : "bg-muted"}`} />
          {voice.status === "live" ? "On air" : voice.status}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="relative">
          <span className={`absolute inset-6 rounded-full bg-hackney-bright/25 blur-2xl transition-opacity ${voice.speaking ? "opacity-100" : "opacity-40"}`} />
          <Mascot
            kind={mascot}
            mood={voice.speaking ? "talking" : voice.searching ? "scanning" : voice.status === "live" ? "listening" : "idle"}
            level={voice.level}
            className="relative h-[240px] w-[240px]"
          />
        </div>
        <p className="mt-8 max-w-[280px] text-center text-[15px] font-medium text-ink">{state}</p>
      </div>

      <div className="space-y-2">
        {last.map((l) => (
          <p
            key={l.id}
            className={`pop-in rounded-[18px] px-3.5 py-2 text-[13.5px] leading-snug ${l.role === "user" ? "ml-8 bg-ink text-white" : "mr-8 bg-card shadow-card"}`}
          >
            {l.text}
          </p>
        ))}
        {voice.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {voice.sources.slice(-3).map((src) => (
              <a key={src.url} href={src.url} target="_blank" rel="noreferrer" className="max-w-full truncate rounded-full bg-card px-2.5 py-1 text-[11.5px] shadow-card hover:bg-hackney-tint">
                {src.title}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button onClick={onReport} className="liquid-glass flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[14px] font-semibold text-ink">
          <IconCamera className="h-5 w-5" /> Report
        </button>
        <button onClick={voice.stop} className="h-12 flex-1 rounded-full bg-[#e5484d] text-[14px] font-semibold text-white shadow-card-hover">
          End
        </button>
      </div>
    </div>
  );
}

function UserMsg({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-[20px] rounded-br-[6px] bg-ink px-4 py-2.5 text-[14.5px] text-white">{text}</p>
    </div>
  );
}

function AssistantMsg({ turn, onReport }: { turn: Extract<Turn, { role: "assistant" }>; onReport: () => void }) {
  const cited = new Set([...turn.text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const sources = turn.sources.filter((s) => cited.has(s.n));
  const streetIssue = turn.status === "done" && turn.areas?.some((a) => STREET_AREAS.includes(a));
  return (
    <div className="rounded-[22px] bg-card p-4 shadow-card">
      {turn.searches.length > 0 && <p className="mb-2 flex items-center gap-1.5 truncate font-mono text-[10.5px] text-muted">
          <IconSearch className="h-3 w-3 shrink-0" />
          {turn.searches.at(-1)}
        </p>}
      {!turn.text && turn.status !== "error" && <p className="text-[14px] text-muted">Searching Hackney&apos;s pages…</p>}
      {turn.text && (
        <div className="[&_.answer]:text-[14.5px] [&_.answer]:leading-[1.55]">
          <Answer text={turn.text} sources={turn.sources} />
        </div>
      )}
      {turn.status === "error" && <p className="text-[14px] text-[#b42318]">Something went wrong. Try again.</p>}
      {sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sources.map((s) => (
            <a key={s.n} href={s.url} target="_blank" rel="noreferrer" className="max-w-full truncate rounded-full bg-canvas px-2.5 py-1 text-[11.5px] text-ink hover:bg-hackney-tint">
              <span className="font-mono text-hackney">{s.n}</span> {s.title}
            </a>
          ))}
        </div>
      )}
      {streetIssue && (
        <button onClick={onReport} className="mt-3 flex w-full items-center justify-between rounded-[16px] bg-ink px-4 py-3 text-left text-white">
          <span>
            <span className="block text-[14px] font-semibold">Report it here instead</span>
            <span className="block text-[11.5px] text-white/60">Snap a photo, we route it and track the fix</span>
          </span>
          <IconCamera className="h-6 w-6 text-hackney-lime" />
        </button>
      )}
    </div>
  );
}

/* --------------------------------- Nearby --------------------------------- */

export function NearbyTab({ reports, onOpen }: { reports: (Report & { distance: number })[]; onOpen: (r: Report) => void }) {
  const [filter, setFilter] = useState<"open" | "fixed" | "all">("open");
  const shown = reports.filter((r) => (filter === "all" ? true : filter === "fixed" ? r.status === "fixed" : r.status !== "fixed")).slice(0, 30);
  return (
    <div className="px-4 pb-32 pt-1">
      <p className="text-[24px] font-semibold tracking-[-0.02em]">Near you</p>
      <p className="text-[13px] text-muted">Real reports from FixMyStreet. Tap one to see its progress.</p>
      <div className="mt-3 flex gap-1.5">
        {(["open", "fixed", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium capitalize ${filter === f ? "bg-ink text-white" : "bg-card text-muted shadow-card"}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {shown.map((r) => (
          <ReportRow key={r.id} report={r} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function ReportRow({ report, onOpen, cta }: { report: Report & { distance: number }; onOpen: (r: Report) => void; cta?: string }) {
  const d = report.distance < 1000 ? `${Math.round(report.distance / 10) * 10} m` : `${(report.distance / 1000).toFixed(1)} km`;
  const status = report.status === "fixed" ? "Fixed" : report.status === "scheduled" ? "Scheduled" : "Open";
  return (
    <button onClick={() => onOpen(report)} className="flex w-full items-center gap-3 rounded-[18px] bg-card p-3 text-left shadow-card transition active:scale-[0.98]">
      {report.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={report.photo_url} alt="" className="h-11 w-11 shrink-0 rounded-[12px] object-cover" />
      ) : (
        <CategoryIcon category={report.category} size={44} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{report.title}</span>
        <span className="block text-[12px] text-muted">
          {CATEGORY_META[report.category].label} · {d} · {status}
        </span>
      </span>
      <span className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10.5px] font-medium ${report.status === "fixed" ? "bg-canvas text-muted" : "bg-hackney-tint text-hackney"}`}>
        {cta ?? "Track"}
      </span>
    </button>
  );
}
