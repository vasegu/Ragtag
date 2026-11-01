"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { CATEGORY_COLOURS, ORIGIN, type GameMapData, type GameReport } from "@/components/game/map-data";
import { sampleReports } from "@/components/game/sample-reports";
import "./game.css";

const HackneyGame = dynamic(() => import("@/components/game/HackneyGame"), {
  ssr: false,
  loading: () => <div className="game-load-state" role="status">Opening the night map…</div>,
});
const names: Record<GameReport["category"], string> = { pothole: "Pothole", flytip: "Fly-tipping", streetlight: "Street light", graffiti: "Graffiti", pavement: "Pavement" };

export default function GamePage() {
  const [reports, setReports] = useState<GameReport[]>([]);
  const [selected, setSelected] = useState(-1);
  const [homeFocus, setHomeFocus] = useState<{ lat: number; lng: number } | null>(null);
  const current = reports[selected] ?? null;

  const onMapReady = useCallback((data: GameMapData) => {
    setReports(sampleReports(data));
  }, []);

  function nextReport() {
    if (reports.length) setSelected((index) => (index + 1) % reports.length);
  }

  return <main className="game-stage" aria-label="Hackney interactive 3D night map">
    <HackneyGame reports={reports} focus={current ?? homeFocus} onMapReady={onMapReady} />
    <div className="game-vignette" aria-hidden="true" />
    <header className="game-header">
      <div>
        <p className="game-brand"><span className="game-brand-light" aria-hidden="true" />ONE HACKNEY <span className="game-brand-divider">·</span> GAME MODE</p>
        <h1>Our borough, <span>in a new light.</span></h1>
        <p className="game-subtitle">A little care for the streets we share.</p>
      </div>
      <button className="game-home" onClick={() => { setSelected(-1); setHomeFocus({ ...ORIGIN }); }} aria-label="Fly back to London Fields">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 7 17-7-4-7 4 7-17Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        <span>London Fields</span>
      </button>
    </header>
    <div className="game-navigation-hint" aria-hidden="true"><span>DRAG TO ORBIT</span><i />SCROLL TO EXPLORE</div>
    <footer className="game-hud">
      <section className="game-legend" aria-label="Report colour key">
        <p className="game-section-label"><span className="game-live-dot" />{reports.length ? `${reports.length} DEMO REPORTS` : "LOADING REPORTS"}</p>
        <ul>{Object.entries(CATEGORY_COLOURS).map(([category, color]) => <li key={category}><span style={{ background: color, boxShadow: `0 0 9px ${color}66` }} />{names[category as GameReport["category"]]}</li>)}<li><span style={{ background: "#d8e9e7" }} />Fixed</li></ul>
        <p className="game-demo-note">An imagined night. Real streets. Sample reports.</p>
      </section>
      <section className="game-tour" aria-label="Report tour">
        <div className="game-tour-caption" aria-live="polite" aria-atomic="true">
          <span className="game-tour-dot" style={{ background: current ? current.status === "fixed" ? "#d8e9e7" : CATEGORY_COLOURS[current.category] : "#69d8ae" }} />
          <div><span className="game-section-label">{current ? `REPORT ${String(selected + 1).padStart(2, "0")} / ${reports.length}` : "START EXPLORING"}</span><p>{current ? `${names[current.category]} · ${current.status}` : "Every pin is a place to care for."}</p></div>
        </div>
        <button className="game-next" onClick={nextReport} disabled={!reports.length}>
          <span>{current ? "Next report" : "Explore reports"}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </section>
    </footer>
  </main>;
}
