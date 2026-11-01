"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Answer } from "@/components/ask/Answer";
import { type Turn, useAsk } from "@/lib/ask/useAsk";
import { useVoice } from "@/lib/ask/useVoice";
import { type Player, levelFor } from "@/lib/report/game";
import type { Track } from "@/lib/report/track";
import { CATEGORY_META, type Report } from "@/lib/report/types";
import { DitherImage } from "./DitherImage";
import { Mascot, type MascotKind } from "./Mascot";
import { IconBin, IconCamera, IconChat, IconDroplet, IconHome, IconMic, IconMicOff, IconParking, IconPin, IconPound, IconSearch, IconSpeaker, IconUser, IconWrench } from "./icons";
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

// Tiles follow what residents complain about most (docs/reddit-complaints.md).
const QUICK = [
  { label: "Council tax", q: "How do I pay my council tax, and can I get help if I'm struggling?", Icon: IconPound },
  { label: "Missed bin", q: "My bin wasn't collected. How do I report it and when is my bin day?", Icon: IconBin },
  { label: "Damp & mould", q: "There's damp and mould in my council flat. How do I get it fixed?", Icon: IconDroplet },
  { label: "Parking fine", q: "How do I challenge a parking or LTN fine (PCN) in Hackney?", Icon: IconParking },
];

// The frustrations behind most council complaints, each with a way out.
const COMMON = [
  { title: "Repairs that never come", sub: "Top Ombudsman issue in Hackney", q: "I reported a repair weeks ago and nothing has happened. How do I chase or escalate it?", Icon: IconWrench },
  { title: "Fly-tip outside my block", sub: "31,000+ in Hackney last year", report: true, Icon: IconBin },
  { title: "Noise at night", sub: "Who to call when it's 2am", q: "My neighbours are making noise late at night. Who do I contact in Hackney?", Icon: IconSpeaker },
];

export function FrontDoor({
  player,
  mascot,
  active,
  quests,
  onAsk,
  onVoice,
  onReport,
  onOpen,
  onTab,
}: {
  player: Player;
  mascot: MascotKind;
  active: { report: Report; track: Track } | null;
  quests: (Report & { distance: number })[];
  onAsk: (q?: string) => void;
  onVoice: () => void;
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
        <Link href="/dashboard" className="rounded-full bg-hackney px-3 py-2 text-center text-[11px] font-semibold leading-tight text-white shadow-card transition hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hackney md:hidden">Council<br />workspace</Link>
      </div>

      <div className="flex w-full items-center gap-2 rounded-[22px] bg-card py-1.5 pl-4 pr-1.5 shadow-card ring-1 ring-line">
        <button onClick={() => onAsk()} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left">
          <IconSearch className="h-5 w-5 shrink-0 text-hackney" />
          <span className="flex-1 truncate text-[15.5px] text-muted">Ask the council anything…</span>
          <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 font-mono text-[10px] text-muted">Any language</span>
        </button>
        <button onClick={onVoice} aria-label="Talk to One Hackney" className="glass-orb grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition active:scale-95">
          <IconMic className="h-5 w-5" />
        </button>
      </div>

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

      <Link href="/dashboard" className="group flex items-center gap-4 rounded-[24px] bg-card p-4 text-left shadow-card ring-1 ring-line transition hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hackney">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] bg-hackney-tint text-hackney"><IconWrench className="h-6 w-6" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold">Council workspace</span><span className="block text-[12.5px] text-muted">Review priorities and plan work</span></span>
        <span aria-hidden="true" className="text-xl text-hackney transition group-hover:translate-x-1">→</span>
      </Link>

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

      <div className="rounded-[24px] bg-card p-4 shadow-card">
        <Label>Sound familiar?</Label>
        <p className="mt-1 text-[13px] leading-snug text-muted">
          No hold music, no &ldquo;we&rsquo;ll be in touch&rdquo;. Get the answer now, and every report gets a tracker and a fix date.
        </p>
        <div className="mt-2 divide-y divide-line">
          {COMMON.map((c) => (
            <button key={c.title} onClick={() => (c.report ? onReport() : onAsk(c.q))} className="flex w-full items-center gap-3 py-2.5 text-left">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-hackney-tint text-hackney">
                <c.Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold leading-tight">{c.title}</span>
                <span className="block font-mono text-[10.5px] text-muted">{c.sub}</span>
              </span>
              <span className="text-[12px] font-semibold text-hackney">{c.report ? "Report" : "Ask"} →</span>
            </button>
          ))}
        </div>
      </div>

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

export function AskTab({
  initial,
  voiceRequest,
  mascot,
  onReport,
}: {
  initial: string | null;
  /** Bumped by the Home mic button to open straight into live voice. */
  voiceRequest: number;
  mascot: MascotKind;
  onReport: () => void;
}) {
  const { turns, busy, send, importTurns } = useAsk();
  const voice = useVoice();
  const handledVoice = useRef(0);
  const { start: startVoice, stop: stopVoice } = voice;

  // The conversation so far, as plain text, to hand to voice so it continues rather than restarts.
  const textContext = () =>
    turns.filter((t) => t.text.trim()).map((t) => ({ role: t.role, text: t.text }));
  const beginVoice = () => startVoice(textContext());
  const endVoice = () => {
    importTurns(voice.lines.map((l) => ({ role: l.role, text: l.text })));
    stopVoice();
  };

  useEffect(() => {
    if (voiceRequest > handledVoice.current) {
      handledVoice.current = voiceRequest;
      startVoice();
    }
  }, [voiceRequest, startVoice]);
  const [draft, setDraft] = useState("");
  const sentInitial = useRef<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initial && sentInitial.current !== initial) {
      sentInitial.current = initial;
      send(initial);
    }
  }, [initial, send]);
  const list = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  useEffect(() => {
    if (followBottom.current) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, voice.lines]);

  const submit = () => {
    if (!draft.trim() || busy) return;
    send(draft);
    setDraft("");
  };
  const voiceOn = voice.status !== "idle";

  return (
    <div className="flex h-full flex-col">
      <div
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          followBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-44 pt-1"
      >
        {turns.length === 0 && !voiceOn && (
          <div className="pt-6 text-center">
            <p className="text-[24px] font-semibold tracking-[-0.02em]">Ask the council</p>
            <p className="mx-auto mt-1 max-w-[270px] text-[13.5px] text-muted">Answers from Hackney&apos;s own pages, with sources. Any language. No phone queue.</p>
            <div className="mt-5 space-y-2">
              {["My bin wasn't collected again", "There's damp and mould in my flat", "How do I challenge a parking fine?", "Can I get help with council tax?", "Eski bir kanepeden nasıl kurtulurum?"].map((q) => (
                <button key={q} onClick={() => send(q)} className="block w-full rounded-[16px] bg-card px-4 py-3 text-left text-[14px] shadow-card">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t) => (t.role === "user" ? <UserMsg key={t.id} text={t.text} /> : <AssistantMsg key={t.id} turn={t} onReport={onReport} />))}
        {/* Live voice continues in the same thread. */}
        {voiceOn &&
          voice.lines.map((l) =>
            l.role === "user" ? (
              <UserMsg key={l.id} text={l.text} voice />
            ) : (
              <div key={l.id} className="pop-in rounded-[22px] bg-card p-4 text-[14.5px] leading-[1.55] shadow-card">
                <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-hackney">
                  <IconMic className="h-3 w-3" /> Spoken
                </p>
                {l.text}
              </div>
            ),
          )}
        {voiceOn && voice.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {voice.sources.slice(-3).map((src) => (
              <a key={src.url} href={src.url} target="_blank" rel="noreferrer" className="max-w-full truncate rounded-full bg-card px-2.5 py-1 text-[11.5px] shadow-card hover:bg-hackney-tint">
                {src.title}
              </a>
            ))}
          </div>
        )}
        <div ref={end} />
      </div>

      {voiceOn ? (
        <VoiceDock voice={voice} mascot={mascot} onEnd={endVoice} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="absolute inset-x-3 bottom-[88px] z-20 flex items-center gap-2 rounded-full bg-card p-1.5 pl-4 shadow-card-hover ring-1 ring-line"
        >
          <button
            type="button"
            onClick={beginVoice}
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
      )}
    </div>
  );
}

/** Inline live voice: a glass bar where the text box sits, with the mascot moving to the audio. */
function VoiceDock({ voice, mascot, onEnd }: { voice: ReturnType<typeof useVoice>; mascot: MascotKind; onEnd: () => void }) {
  const state =
    voice.status === "connecting"
      ? "Connecting…"
      : voice.status === "error"
        ? (voice.error ?? "Voice failed to start")
        : voice.muted
          ? "Muted"
          : voice.searching
            ? `Searching: ${voice.searching}`
            : voice.speaking
              ? "Speaking"
              : "Listening…";
  return (
    <div className="liquid-glass absolute inset-x-3 bottom-[88px] z-20 flex items-center gap-2 rounded-[28px] p-1.5 pl-1">
      <Mascot
        kind={mascot}
        mood={voice.speaking ? "talking" : voice.searching ? "scanning" : voice.status === "live" ? "listening" : "idle"}
        level={voice.level}
        className="-my-3 h-[68px] w-[68px] shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-hackney">
          <span className={`h-1.5 w-1.5 rounded-full ${voice.status === "live" && !voice.muted ? "animate-pulse bg-hackney-bright" : "bg-muted"}`} />
          Live voice
        </p>
        <p className="truncate text-[14px] font-medium text-ink">{state}</p>
      </div>
      <button
        onClick={voice.toggleMute}
        disabled={voice.status !== "live"}
        aria-pressed={voice.muted}
        aria-label={voice.muted ? "Unmute microphone" : "Mute microphone"}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition disabled:opacity-40 ${voice.muted ? "bg-ink text-white" : "bg-white/70 text-ink"}`}
      >
        {voice.muted ? <IconMicOff className="h-5 w-5" /> : <IconMic className="h-5 w-5" />}
      </button>
      <button onClick={onEnd} className="h-10 shrink-0 rounded-full bg-[#e5484d] px-4 text-[13.5px] font-semibold text-white">
        End
      </button>
    </div>
  );
}

function UserMsg({ text, voice }: { text: string; voice?: boolean }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-[20px] rounded-br-[6px] bg-ink px-4 py-2.5 text-[14.5px] text-white">
        {voice && <IconMic className="mb-0.5 mr-1.5 inline h-3.5 w-3.5 text-hackney-lime" />}
        {text}
      </p>
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
        <DitherImage src={report.photo_url} alt="" className="h-11 w-11 shrink-0 rounded-[12px]" />
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
