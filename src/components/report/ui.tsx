"use client";

import { useEffect, useState } from "react";
import { CATEGORY_META, type Category } from "@/lib/report/types";
import { IconLock, IconStar } from "./icons";

// iPhone 15: 393x852 points, plus an 11px bezel each side.
const SCREEN = { w: 393, h: 852 };
const BEZEL = 11;
const FRAME = { w: SCREEN.w + BEZEL * 2, h: SCREEN.h + BEZEL * 2 };

/** True on an actual phone, where the app should fill the screen instead of sitting in a frame. */
export function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 500px) and (pointer: coarse)");
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return phone;
}

/**
 * Always an iPhone 15-sized screen. On smaller windows the whole device scales down
 * uniformly (never reflows), so the layout looks exactly as it would on the phone.
 */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const phone = useIsPhone();
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerHeight - 40) / FRAME.h, (window.innerWidth - 40) / FRAME.w));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  if (phone) {
    return (
      <div className="pointer-events-auto relative h-dvh w-full overflow-hidden bg-canvas">
        {children}
      </div>
    );
  }

  return (
    // The outer box takes the scaled size so the page layout matches what's drawn.
    <div className="pointer-events-auto relative shrink-0" style={{ width: FRAME.w * scale, height: FRAME.h * scale }}>
      <div
        className="absolute left-0 top-0 origin-top-left rounded-[58px] bg-[#0b0b0c] shadow-[0_40px_120px_rgba(0,0,0,0.55),inset_0_0_0_2px_rgba(255,255,255,0.08)]"
        style={{ width: FRAME.w, height: FRAME.h, padding: BEZEL, transform: `scale(${scale})` }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[47px] bg-canvas">
          <div className="pointer-events-none absolute left-1/2 top-[11px] z-50 h-[34px] w-[120px] -translate-x-1/2 rounded-full bg-black" />
          <StatusBar />
          {children}
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex h-[54px] items-center justify-between px-8 pt-1 text-[15px] font-semibold text-ink">
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
        {locked ? <IconLock className="h-1/2 w-1/2 text-muted" /> : <IconStar className="h-1/2 w-1/2 text-white" />}
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
