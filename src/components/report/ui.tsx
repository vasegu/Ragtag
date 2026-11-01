"use client";

import { useState } from "react";
import { CATEGORY_META, type Category } from "@/lib/report/types";

/** iPhone-style frame on desktop; on phones the app fills the screen. */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-dvh w-full md:h-[min(860px,calc(100dvh-48px))] md:w-auto md:aspect-[390/844] md:rounded-[58px] md:bg-[#0b0b0c] md:p-[11px] md:shadow-[0_40px_120px_rgba(0,0,0,0.55),inset_0_0_0_2px_rgba(255,255,255,0.08)]">
      <div className="relative h-full w-full overflow-hidden bg-canvas md:rounded-[47px]">
        <div className="pointer-events-none absolute left-1/2 top-[11px] z-50 hidden h-[34px] w-[120px] -translate-x-1/2 rounded-full bg-black md:block" />
        <StatusBar />
        {children}
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 hidden h-[54px] items-center justify-between px-8 pt-1 text-[15px] font-semibold text-ink md:flex">
      <span>12:41</span>
      <span className="flex items-center gap-1.5">
        <svg viewBox="0 0 18 12" className="h-3 w-[18px]" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <span className="relative h-[13px] w-[26px] rounded-[4px] border border-ink/40 p-[1.5px]">
          <span className="block h-full w-[78%] rounded-[2px] bg-ink" />
        </span>
      </span>
    </div>
  );
}

/** 3D category icon from the Astra renders, with a coloured-dot fallback until they exist. */
export function CategoryIcon({ category, size = 44 }: { category: Category; size?: number }) {
  const [failed, setFailed] = useState(false);
  const meta = CATEGORY_META[category];
  if (failed)
    return (
      <span
        className="grid shrink-0 place-items-center rounded-[14px]"
        style={{ width: size, height: size, background: `${meta.colour}22` }}
      >
        <span className="rounded-full" style={{ width: size * 0.36, height: size * 0.36, background: meta.colour, boxShadow: `0 0 12px ${meta.colour}` }} />
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/renders/icons/${category}.png`} alt={meta.label} width={size} height={size} className="shrink-0 drop-shadow-sm" onError={() => setFailed(true)} />
  );
}

export function BadgeImage({ id, locked, size = 64 }: { id: string; locked?: boolean; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = locked ? "/renders/badges/locked.png" : `/renders/badges/${id}.png`;
  if (failed)
    return (
      <span
        className={`grid shrink-0 place-items-center rounded-full ${locked ? "bg-line" : "bg-gradient-to-br from-hackney-lime to-hackney"}`}
        style={{ width: size, height: size }}
      >
        <span className="text-[22px]">{locked ? "🔒" : "★"}</span>
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className={`shrink-0 ${locked ? "opacity-60 grayscale" : ""}`} onError={() => setFailed(true)} />
  );
}

/** Apple Fitness-style concentric rings. */
export function Rings({ values }: { values: { value: number; goal: number; colour: string }[] }) {
  const size = 96;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-[96px] w-[96px] -rotate-90">
      {values.map((v, i) => {
        const r = 40 - i * 12;
        const c = 2 * Math.PI * r;
        const p = Math.min(v.value / v.goal, 1);
        return (
          <g key={i}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={v.colour} strokeOpacity={0.18} strokeWidth={9} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={v.colour}
              strokeWidth={9}
              strokeLinecap="round"
              strokeDasharray={`${c * p} ${c}`}
              style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.8,.2,1)" }}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted ${className}`}>{children}</p>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[24px] bg-card p-4 shadow-card ${className}`}>{children}</div>;
}

export function Flame({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff5a4e" />
          <stop offset="1" stopColor="#ffc93c" />
        </linearGradient>
      </defs>
      <path
        fill="url(#flame)"
        d="M12 2c.6 3.2 3.3 4.9 4.6 7.6 1.6 3.3.4 7.6-3 9.4-3.7 2-8.5.2-9.6-3.9-.7-2.6.2-5 2-6.8.2 1.6 1 2.8 2.4 3.4-.6-3.6.9-7.3 3.6-9.7z"
      />
    </svg>
  );
}

export function formatRange(from: string, to: string) {
  const f = new Date(from);
  const t = new Date(to);
  const day = (d: Date) => d.getDate();
  const mon = (d: Date) => d.toLocaleDateString("en-GB", { month: "short" });
  return f.getMonth() === t.getMonth() ? `${day(f)}–${day(t)} ${mon(t)}` : `${day(f)} ${mon(f)} – ${day(t)} ${mon(t)}`;
}
