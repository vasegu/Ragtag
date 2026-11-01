"use client";

import dynamic from "next/dynamic";

/** Branded splash while the app (Mapbox, three.js) loads in the browser. */
function Splash() {
  return (
    <div className="grid h-dvh w-full place-items-center bg-canvas">
      <div className="flex flex-col items-center">
        <span className="splash-mark grid h-16 w-16 place-items-center rounded-[20px] bg-hackney text-white shadow-card-hover">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M7 5v14M17 5v14M7 12h10" />
          </svg>
        </span>
        <p className="mt-4 text-[20px] font-semibold tracking-[-0.02em] text-ink">One Hackney</p>
        <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">Loading your borough</p>
        <span className="mt-5 h-1 w-28 overflow-hidden rounded-full bg-hackney-tint">
          <span className="splash-bar block h-full w-1/3 rounded-full bg-hackney-bright" />
        </span>
      </div>
    </div>
  );
}

// Mapbox and three.js need the browser.
const ReportApp = dynamic(() => import("@/components/report/ReportApp").then((m) => m.ReportApp), {
  ssr: false,
  loading: Splash,
});

export function ReportLoader() {
  return <ReportApp />;
}
