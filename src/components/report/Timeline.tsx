"use client";

import type { Stage, Track } from "@/lib/report/track";
import { Label } from "./ui";

const when = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** Deliveroo-style order tracker for one report: headline, progress bar and stage list. */
export function Timeline({ track, compact = false }: { track: Track; compact?: boolean }) {
  const doneCount = track.stages.filter((s) => s.state === "done").length;
  const currentIdx = track.stages.findIndex((s) => s.state === "current");
  const progress = (doneCount + (currentIdx >= 0 ? 0.5 : 0)) / track.stages.length;

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <Label>{track.headline.title}</Label>
          <p className={`mt-0.5 font-semibold leading-none tracking-[-0.03em] ${compact ? "text-[26px]" : "text-[34px]"}`}>{track.headline.value}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${
            track.headline.confirmed ? "bg-hackney-tint text-hackney" : "bg-[#fff4e0] text-[#a05a00]"
          }`}
        >
          {track.headline.confirmed ? "Confirmed" : "Estimate"}
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas">
        <div className="relative h-full rounded-full bg-gradient-to-r from-hackney to-hackney-bright transition-all duration-700" style={{ width: `${progress * 100}%` }}>
          {currentIdx >= 0 && <span className="stage-pulse absolute right-0 top-0 h-full w-6 rounded-full" />}
        </div>
      </div>

      {track.queue && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <QueueChip label="In this category" pos={track.queue.category.position} total={track.queue.category.total} />
          <QueueChip label="Across Hackney" pos={track.queue.overall.position} total={track.queue.overall.total} />
        </div>
      )}

      <ol className="mt-4">
        {track.stages.map((s, i) => (
          <StageRow key={s.key} stage={s} last={i === track.stages.length - 1} />
        ))}
      </ol>

      {track.councilMessage && (
        <div className="mt-2 rounded-[16px] bg-canvas p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Latest from the council · {when(track.councilMessage.at)}</p>
          <p className="mt-1 line-clamp-3 text-[13px] leading-snug">{track.councilMessage.body}</p>
        </div>
      )}
    </div>
  );
}

function QueueChip({ label, pos, total }: { label: string; pos: number; total: number }) {
  return (
    <div className="rounded-[14px] bg-canvas px-3 py-2">
      <p className="text-[10.5px] text-muted">{label}</p>
      <p className="text-[17px] font-semibold tabular-nums tracking-[-0.02em]">
        #{pos} <span className="text-[12px] font-normal text-muted">of {total}</span>
      </p>
    </div>
  );
}

function StageRow({ stage, last }: { stage: Stage; last: boolean }) {
  const done = stage.state === "done";
  const current = stage.state === "current";
  return (
    <li className={`relative flex gap-3 ${current ? "pb-3" : "pb-2.5"}`}>
      {!last && <span className={`absolute left-[11px] top-6 h-[calc(100%-18px)] w-[2px] ${done ? "bg-hackney-bright" : "bg-line"}`} />}
      <span
        className={`relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
          done ? "bg-hackney-bright text-white" : current ? "bg-white ring-2 ring-hackney-bright" : "bg-white ring-2 ring-line"
        }`}
      >
        {done ? (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : current ? (
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-hackney-bright" />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`text-[14.5px] font-semibold ${stage.state === "upcoming" ? "text-muted" : ""}`}>{stage.title}</p>
          {stage.at && <span className="shrink-0 font-mono text-[10.5px] text-muted">{when(stage.at)}</span>}
        </div>
        {/* Only the stage in progress explains itself; the rest stay one line. */}
        {current &&
          stage.lines.map((l, i) => (
            <p key={i} className="mt-0.5 text-[12.5px] leading-snug text-muted">
              {l}
            </p>
          ))}
      </div>
    </li>
  );
}
