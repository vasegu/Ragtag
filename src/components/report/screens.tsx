"use client";

import { useEffect, useState } from "react";
import { BADGES, type BadgeId, type Player, RING_GOALS, type Reward, WARDS, levelFor } from "@/lib/report/game";
import { CATEGORY_META, type Classification, type QueueInfo, type Report } from "@/lib/report/types";
import { buildTrack } from "@/lib/report/track";
import { Mascot, type MascotKind, type MascotMood } from "./Mascot";
import { Timeline } from "./Timeline";
import { DecisionTree } from "./DecisionTree";
import { JobCard } from "./JobCard";
import type { Decision } from "@/lib/report/pipeline";
import type { WorkOrder } from "@/features/street-brain/contracts";
import { IconTrophy } from "./icons";
import { BadgeImage, Card, CategoryIcon, Flame, Label, Rings } from "./ui";

const DEMO_PHOTOS = ["pothole", "flytip", "streetlight", "graffiti"] as const;

/* ---------------------------------- Home ---------------------------------- */

export function HomeScreen({
  player,
  mascot,
  quests,
  onReport,
  onQuest,
  onTab,
  onStreak,
}: {
  player: Player;
  mascot: MascotKind;
  quests: (Report & { distance: number })[];
  onReport: () => void;
  onQuest: (r: Report) => void;
  onTab: (t: "badges" | "board") => void;
  onStreak: () => void;
}) {
  const lv = levelFor(player.xp);
  const helpedToday = player.lastActive === new Date().toISOString().slice(0, 10);
  const ward = [...WARDS].sort((a, b) => b.points - a.points);
  const myRank = ward.findIndex((w) => w.name === player.ward) + 1;

  return (
    <div className="space-y-3 px-4 pb-28 pt-2">
      <div className="flex items-center gap-3">
        <Mascot kind={mascot} mood="idle" className="-my-2 h-[84px] w-[84px] shrink-0" />
        <div className="min-w-0 flex-1">
          <Label>Hi, {player.handle}</Label>
          <p className="mt-0.5 text-[22px] font-semibold leading-tight tracking-[-0.02em]">Let&apos;s fix Hackney.</p>
        </div>
        <button onClick={onStreak} className="flex items-center gap-1 rounded-full bg-card px-3 py-1.5 shadow-card transition active:scale-95" aria-label={`${player.streak} day streak`}>
          <Flame className={`h-5 w-5 ${helpedToday ? "" : "opacity-50 grayscale"}`} />
          <span className="text-[16px] font-semibold tabular-nums">{player.streak}</span>
        </button>
      </div>

      <Card>
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-semibold">
            Level {lv.level} · {lv.name}
          </span>
          <span className="font-mono text-[11px] text-muted">{player.xp} XP</span>
        </div>
        <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-hackney-tint">
          <div className="h-full rounded-full bg-gradient-to-r from-hackney-bright to-hackney-lime transition-all duration-700" style={{ width: `${lv.progress * 100}%` }} />
        </div>
        <p className="mt-2 text-[12.5px] text-muted">
          {lv.toNext} XP to <span className="font-medium text-ink">{lv.nextName}</span>
          {!helpedToday && <> · help today to make it a {player.streak + 1}-day streak</>}
        </p>
      </Card>

      <button
        onClick={onReport}
        className="group relative flex w-full items-center gap-4 overflow-hidden rounded-[26px] bg-ink p-5 text-left text-white shadow-card-hover transition active:scale-[0.98]"
      >
        <span className="grid h-14 w-14 place-items-center rounded-[18px] bg-hackney-bright/20">
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-hackney-lime" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </span>
        <span className="flex-1">
          <span className="block text-[19px] font-semibold tracking-[-0.01em]">Report a problem</span>
          <span className="block text-[13px] text-white/60">Snap it. We&apos;ll do the rest. +50 XP</span>
        </span>
        <span className="text-[22px] text-white/50 transition group-hover:translate-x-1">→</span>
      </button>

      <Card className="flex items-center gap-4">
        <Rings
          values={[
            { value: player.rings.report, goal: RING_GOALS.report, colour: "#f08a24" },
            { value: player.rings.verify, goal: RING_GOALS.verify, colour: "#00b341" },
            { value: player.rings.fixed, goal: RING_GOALS.fixed, colour: "#7b5cff" },
          ]}
        />
        <div className="flex-1 space-y-1.5">
          <Label>This week</Label>
          {[
            ["Report", player.rings.report, RING_GOALS.report, "#f08a24"],
            ["Verify", player.rings.verify, RING_GOALS.verify, "#00b341"],
            ["Fixed", player.rings.fixed, RING_GOALS.fixed, "#7b5cff"],
          ].map(([name, v, g, c]) => (
            <div key={name as string} className="flex items-center justify-between text-[14px]">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: c as string }} />
                {name}
              </span>
              <span className="font-mono text-[12px] tabular-nums text-muted">
                {v}/{g}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div>
        <div className="flex items-baseline justify-between px-1">
          <Label>Quests near you</Label>
          <span className="font-mono text-[10.5px] text-hackney">+20 XP each</span>
        </div>
        <div className="mt-2 space-y-2">
          {quests.slice(0, 3).map((q) => (
            <button key={q.id} onClick={() => onQuest(q)} className="flex w-full items-center gap-3 rounded-[20px] bg-card p-3 text-left shadow-card transition active:scale-[0.98]">
              <CategoryIcon category={q.category} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">Still there? {q.title.split(",")[0]}</span>
                <span className="block text-[12px] text-muted">
                  {q.distance < 1000 ? `${Math.round(q.distance / 10) * 10} m` : `${(q.distance / 1000).toFixed(1)} km`} away · {q.confirmations} confirmed
                </span>
              </span>
              <span className="rounded-full bg-hackney-tint px-2.5 py-1 font-mono text-[11px] font-medium text-hackney">Check</span>
            </button>
          ))}
        </div>
      </div>

      <button onClick={() => onTab("board")} className="w-full text-left">
        <Card className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#f3efff] text-[#7b5cff]">
            <IconTrophy className="h-[22px] w-[22px]" />
          </span>
          <span className="flex-1">
            <span className="block text-[14px] font-semibold">
              {player.ward} is #{myRank} this week
            </span>
            <span className="block text-[12.5px] text-muted">{ward[0].points - (ward.find((w) => w.name === player.ward)?.points ?? 0)} pts behind {ward[0].name}. Every report counts.</span>
          </span>
          <span className="text-muted">→</span>
        </Card>
      </button>

      <button onClick={() => onTab("badges")} className="w-full text-left">
        <Card>
          <div className="flex items-baseline justify-between">
            <Label>Badges</Label>
            <span className="font-mono text-[11px] text-muted">
              {player.badges.length}/{Object.keys(BADGES).length}
            </span>
          </div>
          <div className="mt-2 flex gap-2 overflow-hidden">
            {(Object.keys(BADGES) as BadgeId[]).slice(0, 5).map((id) => (
              <BadgeImage key={id} id={id} locked={!player.badges.includes(id)} size={52} />
            ))}
          </div>
        </Card>
      </button>
    </div>
  );
}

/* --------------------------------- Capture -------------------------------- */

export function CaptureScreen({ address, onPhoto, onBack }: { address: string; onPhoto: (file: File, preview: string) => void; onBack: () => void }) {
  const [demos, setDemos] = useState<string[]>([]);

  useEffect(() => {
    // Only offer demo photos that exist (Astra renders them into public/renders/demo).
    Promise.all(DEMO_PHOTOS.map(async (d) => ((await fetch(`/renders/demo/${d}.jpg`, { method: "HEAD" })).ok ? d : null))).then((r) =>
      setDemos(r.filter(Boolean) as string[]),
    );
  }, []);

  const pickDemo = async (name: string) => {
    const blob = await (await fetch(`/renders/demo/${name}.jpg`)).blob();
    onPhoto(new File([blob], `${name}.jpg`, { type: "image/jpeg" }), URL.createObjectURL(blob));
  };

  return (
    <div className="flex h-full flex-col px-4 pb-6 pt-2">
      <TopNav title="New report" onBack={onBack} />
      <label className="mt-3 flex flex-1 cursor-pointer flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-hackney/25 bg-card text-center shadow-card transition hover:border-hackney/50">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-hackney-tint">
          <svg viewBox="0 0 24 24" className="h-9 w-9 text-hackney" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </span>
        <span className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">Take a photo</span>
        <span className="mt-1 max-w-[220px] text-[13.5px] text-muted">Get the whole problem in frame. Our AI works out what it is and who fixes it.</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPhoto(f, URL.createObjectURL(f));
          }}
        />
      </label>

      {demos.length > 0 && (
        <div className="mt-4">
          <Label className="px-1">Or try a demo photo</Label>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {demos.map((d) => (
              <button key={d} onClick={() => pickDemo(d)} className="aspect-square overflow-hidden rounded-[16px] shadow-card transition active:scale-95">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/renders/demo/${d}.jpg`} alt={d} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 rounded-[18px] bg-card px-4 py-3 shadow-card">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-hackney text-white">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-muted">Location</span>
          <span className="block truncate text-[14px] font-medium">{address}</span>
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------- Scan ---------------------------------- */

export function ScanScreen({
  preview,
  mascot,
  classification,
  error,
  onSubmit,
  onBack,
  submitting,
  pipeline,
}: {
  preview: string;
  mascot: MascotKind;
  classification: Classification | null;
  error: string | null;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
  pipeline: { trace: Decision[] | null; running: boolean; error: string | null };
}) {
  const [shown, setShown] = useState(0);
  const findings = classification
    ? [
        { k: "Category", v: CATEGORY_META[classification.category].label },
        { k: "Severity", v: `${classification.severity}/5` },
        ...classification.labels.map((l) => ({ k: "Found", v: l })),
        { k: "Goes to", v: CATEGORY_META[classification.category].owner },
      ]
    : [];

  useEffect(() => {
    if (!classification) return;
    setShown(0);
    const t = setInterval(() => setShown((s) => (s >= findings.length ? s : s + 1)), 380);
    return () => clearInterval(t);
  }, [classification, findings.length]);

  const done = classification && shown >= findings.length;
  const mood: MascotMood = done ? "happy" : "scanning";

  return (
    <div className="flex h-full flex-col px-4 pb-6 pt-2">
      <TopNav title={classification ? "Got it" : "Looking closely…"} onBack={onBack} />
      <div className="relative mt-3 h-52 shrink-0 overflow-hidden rounded-[28px] bg-black shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="Your photo" className={`h-full w-full object-cover transition duration-700 ${classification ? "" : "scale-[1.04] saturate-[0.85]"}`} />
        {!classification && !error && (
          <>
            <div className="scan-grid absolute inset-0" />
            <div className="scan-sweep absolute inset-x-0 h-24" />
          </>
        )}
        {["left-4 top-4 border-l-[3px] border-t-[3px] rounded-tl-[14px]", "right-4 top-4 border-r-[3px] border-t-[3px] rounded-tr-[14px]", "bottom-4 left-4 border-b-[3px] border-l-[3px] rounded-bl-[14px]", "bottom-4 right-4 border-b-[3px] border-r-[3px] rounded-br-[14px]"].map((c) => (
          <span key={c} className={`absolute h-9 w-9 border-hackney-lime transition-all duration-500 ${classification ? "opacity-0" : "opacity-100"} ${c}`} />
        ))}
        {classification && (
          <span className="pop-in absolute left-4 top-4 flex items-center gap-2 rounded-full bg-white/90 py-1.5 pl-1.5 pr-3 text-[13px] font-semibold backdrop-blur">
            <CategoryIcon category={classification.category} size={26} />
            {CATEGORY_META[classification.category].label} · {Math.round(classification.confidence * 100)}%
          </span>
        )}
        <Mascot kind={mascot} mood={mood} className="absolute -bottom-4 -right-3 h-[104px] w-[104px]" />
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pb-2">
        {error && <p className="rounded-[16px] bg-[#fdecea] p-3 text-[14px] text-[#b42318]">{error}</p>}
        {!classification && !error && (
          <p className="flex items-center gap-2 px-1 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-hackney-bright" /> Scanning photo · checking location
          </p>
        )}
        {findings.slice(0, shown).map((f, i) => (
          <div key={i} className="pop-in flex items-center justify-between rounded-[14px] bg-card px-3.5 py-2.5 shadow-card">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">{f.k}</span>
            <span className="text-[14px] font-medium">{f.v}</span>
          </div>
        ))}
        {(pipeline.running || pipeline.trace || pipeline.error) && (
          <div className="pt-1.5">
            <DecisionTree trace={pipeline.trace} running={pipeline.running} error={pipeline.error} />
          </div>
        )}
      </div>

      <button
        onClick={onSubmit}
        disabled={!done || submitting}
        className="mt-3 h-14 w-full rounded-full bg-ink text-[16px] font-semibold text-white transition hover:bg-hackney disabled:bg-ink/20"
      >
        {submitting ? "Sending…" : "Send to Hackney · +50 XP"}
      </button>
    </div>
  );
}

/* --------------------------------- Tracker -------------------------------- */

export function TrackerScreen({
  queue,
  classification,
  report,
  all,
  workOrder,
  mascot,
  reference,
  onDone,
}: {
  queue: QueueInfo;
  classification: Classification;
  report: Report;
  all: Report[];
  workOrder: WorkOrder | null;
  mascot: MascotKind;
  reference: string;
  onDone: () => void;
}) {
  const track = buildTrack(report, all, { classification });
  const maxPoints = Math.max(...queue.breakdown.map((b) => b.points), 1);

  return (
    <div className="space-y-3 px-4 pb-8 pt-2">
      <div className="flex items-center justify-between">
        <Label>Report {reference}</Label>
        <button onClick={onDone} className="rounded-full bg-card px-3 py-1.5 text-[13px] font-medium shadow-card">
          Done
        </button>
      </div>

      <Card className="relative overflow-hidden">
        <Mascot kind={mascot} mood="idle" className="pointer-events-none absolute -right-5 -top-4 h-[96px] w-[96px]" />
        <Timeline track={track} />
      </Card>

      {workOrder && <JobCard order={workOrder} reference={reference} address={report.title.split(", ").slice(1).join(", ") || report.title} />}

      <Card>
        <Label>Why you&apos;re here</Label>
        <div className="mt-3 space-y-2.5">
          {queue.breakdown.map((b) => (
            <div key={b.label}>
              <div className="flex justify-between text-[13.5px]">
                <span>{b.label}</span>
                <span className="font-mono text-[12px] text-muted">+{b.points}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                <div className="grow-x h-full rounded-full bg-gradient-to-r from-hackney to-hackney-bright" style={{ width: `${(b.points / maxPoints) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Label>Move it up</Label>
        <div className="mt-2 divide-y divide-line">
          {queue.boosts.map((b) => (
            <div key={b.label} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-[13.5px]">{b.label}</span>
              <span className="shrink-0 rounded-full bg-hackney-tint px-2.5 py-1 font-mono text-[11px] font-medium text-hackney">+{b.points}</span>
            </div>
          ))}
        </div>
        <ShareButton reference={reference} owner={queue.owner} />
      </Card>
    </div>
  );
}

/** Clipboard API where allowed, falling back to a hidden textarea (older browsers, iframes). */
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    el.remove();
  }
}

function ShareButton({ reference, owner }: { reference: string; owner: string }) {
  const [state, setState] = useState<"idle" | "shared" | "copied">("idle");
  const share = async () => {
    const url = `${window.location.origin}/report?r=${reference}`;
    const text = `I've reported a problem to ${owner} on One Hackney (${reference}). If you see it too, confirm it's still there so it moves up the queue.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Confirm this report", text, url });
        setState("shared");
      } else {
        await copy(`${text} ${url}`);
        setState("copied");
      }
    } catch {
      // share sheet dismissed
    }
  };
  return (
    <button onClick={share} className="mt-2 h-11 w-full rounded-full bg-ink text-[14px] font-semibold text-white transition hover:bg-hackney active:scale-[0.98]">
      {state === "copied" ? "Link copied. Send it to a neighbour" : state === "shared" ? "Shared. Thanks!" : "Ask neighbours to confirm"}
    </button>
  );
}

export function StreakSheet({ player, onClose }: { player: Player; onClose: () => void }) {
  const helpedToday = player.lastActive === new Date().toISOString().slice(0, 10);
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const todayIdx = (new Date().getDay() + 6) % 7;
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-ink/40" onClick={onClose}>
      <div className="slide-up w-full rounded-t-[32px] bg-card p-5 pb-8 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
        <Flame className="mx-auto h-16 w-16" />
        <p className="mt-2 text-[40px] font-semibold leading-none tracking-[-0.04em]">{player.streak} days</p>
        <p className="mt-2 text-[14px] text-muted">
          {helpedToday ? "You've helped today. See you tomorrow!" : "Report or confirm anything today to keep it going."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          {days.map((d, i) => {
            const lit = i < todayIdx ? i >= todayIdx - (player.streak - (helpedToday ? 1 : 0)) : i === todayIdx && helpedToday;
            return (
              <span key={i} className={`grid h-10 w-10 place-items-center rounded-full font-mono text-[12px] font-semibold ${lit ? "bg-gradient-to-b from-[#ffc93c] to-[#ff5a4e] text-white" : i === todayIdx ? "ring-2 ring-[#ffc93c] text-ink" : "bg-canvas text-muted"}`}>
                {d}
              </span>
            );
          })}
        </div>
        <div className="mt-5 rounded-[18px] bg-canvas p-3 text-left text-[13px] text-muted">
          <span className="font-semibold text-ink">{player.freezes} streak freeze</span> saved. Miss a day and it keeps your streak. Streaks count any helpful action, so you never need a new problem to keep one.
        </div>
        <button onClick={onClose} className="mt-4 h-12 w-full rounded-full bg-ink text-[15px] font-semibold text-white">
          Got it
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ Reward overlay ----------------------------- */

export function RewardOverlay({ reward, player, mascot, onClose }: { reward: Reward; player: Player; mascot: MascotKind; onClose: () => void }) {
  const lv = levelFor(player.xp);
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-ink/70 px-6 backdrop-blur-sm" onClick={onClose}>
      <Confetti />
      <div className="pop-in w-full rounded-[32px] bg-card p-6 text-center shadow-card-hover" onClick={(e) => e.stopPropagation()}>
        <Mascot kind={mascot} mood="happy" className="mx-auto -mt-20 h-[140px] w-[140px]" />
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-hackney">Report sent</p>
        <p className="mt-1 text-[44px] font-semibold leading-none tracking-[-0.04em]">+{reward.xp} XP</p>

        {reward.streakExtended && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-[18px] bg-[#fff4e8] py-2.5">
            <Flame className="h-6 w-6" />
            <span className="text-[15px] font-semibold">{reward.streak}-day streak</span>
          </div>
        )}

        {reward.badges.map((b) => (
          <div key={b} className="mt-4 flex items-center gap-3 rounded-[20px] bg-canvas p-3 text-left">
            <span className="badge-shine relative overflow-hidden rounded-full">
              <BadgeImage id={b} size={60} />
            </span>
            <span>
              <span className="block font-mono text-[10.5px] uppercase tracking-[0.14em] text-hackney">Badge unlocked</span>
              <span className="block text-[17px] font-semibold">{BADGES[b].name}</span>
              <span className="block text-[12.5px] text-muted">{BADGES[b].how}</span>
            </span>
          </div>
        ))}

        <div className="mt-4 text-left">
          <div className="flex justify-between text-[12.5px]">
            <span className="font-medium">
              Level {lv.level} · {lv.name}
            </span>
            <span className="text-muted">{lv.toNext} XP to go</span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-hackney-tint">
            <div className="h-full rounded-full bg-gradient-to-r from-hackney-bright to-hackney-lime transition-all duration-1000" style={{ width: `${lv.progress * 100}%` }} />
          </div>
        </div>

        <button onClick={onClose} className="mt-5 h-12 w-full rounded-full bg-ink text-[15px] font-semibold text-white">
          See where it is in the queue
        </button>
      </div>
    </div>
  );
}

function Confetti() {
  const colours = ["#00b341", "#a4d65e", "#f08a24", "#7b5cff", "#ffc93c", "#ff5a4e"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          className="confetti absolute top-[-10px] h-2.5 w-1.5 rounded-sm"
          style={{
            left: `${(i * 37) % 100}%`,
            background: colours[i % colours.length],
            animationDelay: `${(i % 9) * 80}ms`,
            animationDuration: `${1600 + (i % 5) * 300}ms`,
          }}
        />
      ))}
    </div>
  );
}

/* -------------------------------- Verify sheet ------------------------------ */

export function VerifySheet({
  report,
  all,
  onAnswer,
  onClose,
}: {
  report: Report;
  all: Report[];
  onAnswer: (a: "there" | "fixed") => void;
  onClose: () => void;
}) {
  const track = buildTrack(report, all);
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-ink/40" onClick={onClose}>
      <div className="slide-up max-h-[88%] w-full overflow-y-auto rounded-t-[32px] bg-card p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
        <div className="flex items-center gap-3">
          <CategoryIcon category={report.category} size={52} />
          <div className="min-w-0">
            <Label>
              {CATEGORY_META[report.category].label} · {track.owner.kind === "hackney" ? track.owner.name : track.owner.name}
            </Label>
            <p className="truncate text-[17px] font-semibold">{report.title}</p>
          </div>
        </div>
        {report.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={report.photo_url} alt="Photo from the original report" className="mt-4 h-36 w-full rounded-[18px] object-cover" />
        )}

        <div className="mt-4">
          <Timeline track={track} compact />
        </div>

        {report.status === "fixed" ? (
          <button onClick={onClose} className="mt-2 h-12 w-full rounded-full bg-hackney-tint text-[15px] font-semibold text-hackney">
            Close
          </button>
        ) : (
          <>
            <p className="mt-2 text-[14px]">Seen it too? Confirming groups your sighting with this report. +20 XP</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => onAnswer("there")} className="h-12 rounded-full bg-ink text-[15px] font-semibold text-white">
                Still there
              </button>
              <button onClick={() => onAnswer("fixed")} className="h-12 rounded-full bg-hackney-tint text-[15px] font-semibold text-hackney">
                It&apos;s fixed
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Badges & board ------------------------------ */

export function BadgesScreen({ player, onBack }: { player: Player; onBack: () => void }) {
  return (
    <div className="px-4 pb-28 pt-2">
      <TopNav title="Badges" onBack={onBack} />
      <div className="mt-4 grid grid-cols-3 gap-3">
        {(Object.keys(BADGES) as BadgeId[]).map((id) => {
          const has = player.badges.includes(id);
          return (
            <div key={id} className="flex flex-col items-center rounded-[22px] bg-card p-3 text-center shadow-card">
              <BadgeImage id={id} locked={!has} size={72} />
              <span className={`mt-2 text-[12.5px] font-semibold leading-tight ${has ? "" : "text-muted"}`}>{BADGES[id].name}</span>
              <span className="mt-0.5 text-[10.5px] leading-tight text-muted">{BADGES[id].how}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BoardScreen({ player, onBack }: { player: Player; onBack: () => void }) {
  const wards = [...WARDS].sort((a, b) => b.points - a.points);
  const max = wards[0].points;
  return (
    <div className="px-4 pb-28 pt-2">
      <TopNav title="Ward league" onBack={onBack} />
      <p className="mt-3 px-1 text-[13.5px] text-muted">Wards earn points when neighbours report, verify and get things fixed. Resets every Monday.</p>
      <div className="mt-3 space-y-2">
        {wards.map((w, i) => {
          const mine = w.name === player.ward;
          return (
            <div key={w.name} className={`rounded-[20px] p-3.5 shadow-card ${mine ? "bg-ink text-white" : "bg-card"}`}>
              <div className="flex items-center gap-3">
                <span className={`grid h-8 w-8 place-items-center rounded-full font-mono text-[13px] font-semibold ${i === 0 ? "bg-[#ffc93c] text-ink" : mine ? "bg-white/15" : "bg-canvas"}`}>{i + 1}</span>
                <span className="flex-1 text-[15px] font-semibold">{w.name}</span>
                <span className={`font-mono text-[12px] tabular-nums ${mine ? "text-white/70" : "text-muted"}`}>{w.points.toLocaleString()}</span>
              </div>
              <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${mine ? "bg-white/15" : "bg-canvas"}`}>
                <div className={`h-full rounded-full ${mine ? "bg-hackney-lime" : "bg-hackney-bright"}`} style={{ width: `${(w.points / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------- helpers -------------------------------- */

function TopNav({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onBack} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full bg-card shadow-card">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <span className="text-[17px] font-semibold">{title}</span>
    </div>
  );
}

