"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Hotspot } from "@/lib/council/hotspots";
import { SUPPLY_TO_PLANNER, type OpsJob, type SupplyUnit } from "@/lib/council/ops";
import { type CrewRoute, DEFAULT_CREWS, TRADES, type Trade, planDay } from "@/lib/council/plan";
import { CATEGORY_META } from "@/lib/report/types";
import { CouncilNav } from "./CouncilNav";

// A flat, quiet OpenStreetMap basemap for back-office use (Mapbox Light renders OSM data).
const OSM_STYLE = "mapbox://styles/mapbox/light-v11";

const TRADE_ORDER: Trade[] = ["waste", "cleansing", "highways", "electrician", "enforcement"];
const DEPOT: [number, number] = [-0.0382, 51.5536];
const SHIFT_START = 8 * 60;
const SHIFT_MIN = 450;
const SLOTS = SHIFT_MIN / 30 + 1;
const PERSIST = {
  chronic: { label: "Chronic", hint: "3+ weeks", colour: "#b8573f" },
  recurring: { label: "Recurring", hint: "2 weeks or 3+ days", colour: "#d99a2b" },
  "one-off": { label: "One-off", hint: "Single burst", colour: "#9aa39d" },
} as const;

type RoadRoute = { geometry: GeoJSON.LineString; minutes: number; km: number; legs: number[] };
export type View = "dispatch" | "hotspots";

const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
const hatch = (c: string) => `repeating-linear-gradient(135deg, rgba(255,255,255,.28) 0 2px, transparent 2px 7px), ${c}`;

export function OpsWorkspace({
  view,
  jobs,
  supply,
  hotspots,
  withWorkOrders,
  error,
}: {
  view: View;
  jobs: OpsJob[];
  supply: SupplyUnit[];
  hotspots: Hotspot[];
  withWorkOrders: number;
  error: string | null;
}) {

  // Crews per trade start from the available supply units.
  const unitsByTrade = useMemo(() => {
    const m = new Map<Trade, SupplyUnit[]>();
    for (const u of supply.filter((s) => s.available)) {
      const t = SUPPLY_TO_PLANNER[u.trade];
      if (t) m.set(t, [...(m.get(t) ?? []), u]);
    }
    return m;
  }, [supply]);
  const [crews, setCrews] = useState<Record<Trade, number>>(() => {
    const base = { ...DEFAULT_CREWS };
    for (const t of TRADE_ORDER) base[t] = unitsByTrade.get(t)?.length ?? base[t];
    return base;
  });

  const plan = useMemo(() => planDay(jobs, { crews }), [jobs, crews]);
  const [selected, setSelected] = useState<string | null>(null);
  const [road, setRoad] = useState<RoadRoute | null>(null);
  const [hotspot, setHotspot] = useState<Hotspot | null>(null);
  const [dispatched, setDispatched] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const crew = plan.crews.find((c) => c.id === selected) ?? null;
  const unitFor = (c: CrewRoute) => unitsByTrade.get(c.trade)?.[c.index] ?? null;

  // Real road route and drive times for the selected crew (OSRM over OpenStreetMap roads).
  useEffect(() => {
    setRoad(null);
    if (!crew || crew.stops.length === 0) return;
    const depot = unitFor(crew);
    const start: [number, number] = depot?.depot_lon && depot.depot_lat ? [depot.depot_lon, depot.depot_lat] : DEPOT;
    const pts = [start, ...crew.stops.map((s) => [s.job.lng, s.job.lat] as [number, number]), start].slice(0, 90);
    const ctrl = new AbortController();
    fetch(`https://router.project-osrm.org/route/v1/driving/${pts.map((p) => p.join(",")).join(";")}?overview=full&geometries=geojson`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        const r = d.routes?.[0];
        if (r) setRoad({ geometry: r.geometry, minutes: r.duration / 60, km: r.distance / 1000, legs: r.legs.map((l: { duration: number }) => l.duration / 60) });
      })
      .catch(() => {});
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, crews]);

  const dispatch = async () => {
    setSending(true);
    const assignments = plan.crews.flatMap((c) => {
      const unit = unitFor(c);
      return unit ? c.stops.flatMap((s) => ((s.job as OpsJob).problemId ? [{ problemId: (s.job as OpsJob).problemId!, supplyUnitId: unit.id }] : [])) : [];
    });
    try {
      const res = await fetch("/api/council/dispatch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assignments }) });
      const d = await res.json();
      setDispatched(res.ok ? `${d.updated} work orders sent to ${d.crews} crews` : (d.error ?? "Dispatch failed"));
    } finally {
      setSending(false);
    }
  };

  const scheduled = plan.crews.reduce((n, c) => n + c.stops.length, 0);
  const finish = plan.crews.reduce((m, c) => Math.max(m, c.finish), 0);
  const travel = plan.crews.reduce((n, c) => n + c.travelMin, 0);
  const onSite = plan.crews.reduce((n, c) => n + c.stops.reduce((a, s) => a + s.minutes, 0), 0);
  const repeat = hotspots.filter((h) => h.persistence !== "one-off");
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex min-h-dvh bg-canvas text-ink">
        <CouncilNav active={view} counts={{ dispatch: { n: scheduled }, hotspots: { n: repeat.length, tone: "terra" } }} />
        <main className="min-w-0 flex-1 px-6 py-6">
          <header className="flex flex-wrap items-end gap-3">
            <div>
              <p className="text-[12px] text-muted">London Borough of Hackney · {today} · {withWorkOrders} of {jobs.length} jobs have an AI work order</p>
              <h1 className="mt-0.5 text-[28px] font-medium tracking-[-0.03em]">{view === "dispatch" ? "Dispatch" : "Hotspots"}</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Chip icon={<IconCalendar />}>{view === "dispatch" ? "Tomorrow · 08:00 to 15:30" : "Last 6 weeks"}</Chip>
              {view === "dispatch" ? (
                <button onClick={dispatch} disabled={sending} className="flex h-10 items-center gap-2 rounded-full bg-[#10261f] pl-4 pr-3 text-[13px] font-semibold text-white transition hover:bg-hackney disabled:opacity-60">
                  {sending ? "Sending" : "Dispatch to crews"}
                  <IconChevron />
                </button>
              ) : (
                <button onClick={() => setHotspot(hotspots[0] ?? null)} className="flex h-10 items-center gap-2 rounded-full bg-[#10261f] pl-4 pr-3 text-[13px] font-semibold text-white transition hover:bg-hackney">
                  Open worst hotspot
                  <IconChevron />
                </button>
              )}
            </div>
          </header>
          {error && <p className="mt-3 rounded-[14px] bg-[#fbe9e5] px-4 py-2.5 text-[13px] text-[#9b3a26]">{error}</p>}
          {dispatched && (
            <p className="mt-3 flex items-center gap-2 rounded-[14px] bg-hackney-tint px-4 py-2.5 text-[13px] font-medium text-hackney">
              <span className="h-2 w-2 rounded-full bg-hackney-bright" />
              {dispatched}. Residents will see &ldquo;Crew on the way&rdquo; on their tracker.
            </p>
          )}

          {view === "dispatch" ? (
            <div className="mt-4 grid grid-cols-12 gap-3">
              <Card className="col-span-12 grid grid-cols-2 divide-line p-0 lg:grid-cols-4 lg:divide-x [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-line lg:[&>*]:border-r-0">
                <Kpi label="Jobs planned" value={`${scheduled}`} sub={`of ${jobs.length} open`} badge={plan.overflow.length ? `${plan.overflow.length} roll over` : "All covered"} tone={plan.overflow.length ? "terra" : "green"} />
                <Kpi label="Crews out" value={`${plan.crews.filter((c) => c.stops.length).length}`} sub="from the supply list" badge={`${supply.filter((s) => s.available).length} units free`} tone="grey" />
                <Kpi label="Driving, depot to depot" value={`${Math.floor(travel / 60)}h ${Math.round(travel % 60)}m`} sub={`${Math.round((travel / Math.max(1, travel + onSite)) * 100)}% of crew time`} badge="Clustered stops" tone="green" />
                <Kpi label="Last crew back" value={finish ? hm(finish) : "–"} sub="shift ends 15:30" badge={finish <= SHIFT_START + SHIFT_MIN ? "On target" : "Overtime"} tone={finish <= SHIFT_START + SHIFT_MIN ? "green" : "terra"} />
              </Card>

              <Card className="col-span-12 overflow-hidden p-0 xl:col-span-7">
                <div className="flex items-center gap-3 px-5 pb-3 pt-4">
                  <h2 className="text-[15px] font-semibold">Routes</h2>
                  <span className="text-[12px] text-muted">{crew ? `${unitFor(crew)?.name ?? crew.label} · ${crew.stops.length} stops` : "All crews from the Millfields depot"}</span>
                  {crew && (
                    <button onClick={() => setSelected(null)} className="ml-auto rounded-full bg-canvas px-3 py-1 text-[12px] font-medium hover:bg-line">
                      Show all
                    </button>
                  )}
                </div>
                <div className="relative mx-3 mb-3 h-[468px] overflow-hidden rounded-[18px]">
                  <OpsMap view="dispatch" jobs={jobs} crews={plan.crews} selected={crew} road={road} hotspots={hotspots} focus={null} onPickHotspot={() => {}} />
                  {road && crew && (
                    <div className="absolute left-3 top-3 rounded-[14px] bg-card/95 px-3.5 py-2.5 shadow-card backdrop-blur">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">On real roads</p>
                      <p className="text-[15px] font-semibold tabular-nums">
                        {road.km.toFixed(1)} km · {Math.round(road.minutes)} min
                      </p>
                      <p className="text-[11px] text-muted">Planner estimate {Math.round(crew.travelMin)} min</p>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="col-span-12 flex max-h-[548px] flex-col xl:col-span-5">
                {crew ? (
                  <RunSheet crew={crew} unit={unitFor(crew)} road={road} onBack={() => setSelected(null)} />
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <h2 className="text-[15px] font-semibold">Load per crew</h2>
                      <span className="text-[12px] text-muted">Bar is the 7.5 hour shift</span>
                    </div>
                    <div className="-mx-2 mt-3 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
                      {plan.crews.map((c) => {
                        const unit = unitFor(c);
                        const used = Math.min(1, (c.finish - SHIFT_START) / SHIFT_MIN);
                        const late = c.finish > SHIFT_START + SHIFT_MIN;
                        return (
                          <button key={c.id} onClick={() => setSelected(c.id)} className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left transition hover:bg-canvas">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10.5px] font-bold text-white" style={{ background: c.colour }}>
                              {initials(unit?.name ?? c.label)}
                            </span>
                            <span className="w-[132px] shrink-0 truncate text-[13px] font-medium">{unit?.name ?? `${c.label} agency`}</span>
                            <span className="relative h-6 flex-1 rounded-full bg-canvas">
                              <span className="absolute inset-y-0 left-0 flex items-center justify-end rounded-full pr-0.5" style={{ width: `${Math.max(22, used * 100)}%`, background: hatch(c.colour) }}>
                                <span className="rounded-full bg-[#10261f] px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-white">{c.stops.length} jobs</span>
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-[11px] tabular-nums">
                              <span className={`h-1.5 w-1.5 rounded-full ${late ? "bg-[#b8573f]" : "bg-hackney-bright"}`} />
                              back {hm(c.finish)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </Card>

              <Card className="col-span-12 xl:col-span-7">
                <Coverage crews={plan.crews} />
              </Card>

              <Card className="col-span-12 xl:col-span-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold">Crews by trade</h2>
                  <span className="text-[12px] text-muted">Change it and the plan reruns</span>
                </div>
                <div className="mt-3 space-y-2">
                  {TRADE_ORDER.map((t) => {
                    const placed = plan.crews.filter((c) => c.trade === t).reduce((n, c) => n + c.stops.length, 0);
                    const left = plan.overflow.filter((j) => (j as { trade?: string }).trade === t).length;
                    return (
                      <div key={t} className="flex items-center gap-3 rounded-[14px] bg-canvas px-3 py-2.5">
                        <span className="h-7 w-1.5 rounded-full" style={{ background: TRADES[t].shades[0] }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold">{TRADES[t].label}</span>
                          <span className="block text-[11.5px] text-muted">
                            {placed} placed{left ? `, ${left} roll over` : ""} · {unitsByTrade.get(t)?.length ?? 0} in supply
                          </span>
                        </span>
                        <span className="flex items-center rounded-full bg-card p-0.5 shadow-card">
                          <button onClick={() => setCrews((c) => ({ ...c, [t]: Math.max(0, c[t] - 1) }))} className="grid h-7 w-7 place-items-center rounded-full hover:bg-canvas" aria-label={`Remove ${TRADES[t].label} crew`}>
                            <IconMinus />
                          </button>
                          <span className="w-6 text-center text-[13px] font-semibold tabular-nums">{crews[t]}</span>
                          <button onClick={() => setCrews((c) => ({ ...c, [t]: c[t] + 1 }))} className="grid h-7 w-7 place-items-center rounded-full hover:bg-canvas" aria-label={`Add ${TRADES[t].label} crew`}>
                            <IconPlus />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          ) : (
            <HotspotsView hotspots={hotspots} selected={hotspot} onSelect={setHotspot} jobs={jobs} />
          )}
        </main>
    </div>
  );
}

/* ------------------------------- Dispatch -------------------------------- */

function RunSheet({ crew, unit, road, onBack }: { crew: CrewRoute; unit: SupplyUnit | null; road: RoadRoute | null; onBack: () => void }) {
  return (
    <>
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-canvas hover:bg-line" aria-label="Back to all crews">
          <IconChevron className="rotate-180" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Run sheet · {crew.label}</p>
          <h2 className="truncate text-[17px] font-semibold tracking-[-0.01em]">{unit?.name ?? `${crew.label} agency crew`}</h2>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-white" style={{ background: crew.colour }}>
          {crew.stops.length} stops
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Mini label="Leaves depot" value={hm(SHIFT_START)} />
        <Mini label="Driving" value={`${Math.round(road?.minutes ?? crew.travelMin)} min`} />
        <Mini label="Back at depot" value={hm(crew.finish)} />
      </div>
      <ol className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        <Leg minutes={road?.legs[0] ?? crew.stops[0]?.travelMin} label="from depot" />
        {crew.stops.map((s, i) => {
          const j = s.job as OpsJob;
          return (
            <li key={j.id}>
              <div className="flex gap-3 rounded-[12px] px-1 py-1.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10.5px] font-bold text-white" style={{ background: crew.colour }}>
                  {s.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] font-semibold">{j.title}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted">{hm(s.arrive)}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    <Tag>{CATEGORY_META[j.category].label}</Tag>
                    <Tag>{s.minutes} min on site</Tag>
                    {j.crewSize ? <Tag>{j.crewSize} people</Tag> : null}
                    {j.sizeBand ? <Tag>{j.sizeBand}</Tag> : null}
                    {j.disputed ? <Tag tone="terra">Resident disputes</Tag> : null}
                  </span>
                </span>
              </div>
              {i < crew.stops.length - 1 && <Leg minutes={road?.legs[i + 1] ?? crew.stops[i + 1].travelMin} />}
            </li>
          );
        })}
        <Leg minutes={road?.legs[crew.stops.length]} label="back to depot" />
      </ol>
    </>
  );
}

function Leg({ minutes, label }: { minutes?: number; label?: string }) {
  return (
    <li className="flex items-center gap-3 py-0.5 pl-[11px]">
      <span className="h-4 border-l border-dashed border-[#c9cbc4]" />
      <span className="font-mono text-[10.5px] text-muted">
        {minutes != null ? `${Math.max(1, Math.round(minutes))} min drive` : "drive"}
        {label ? ` ${label}` : ""}
      </span>
    </li>
  );
}

// Each square is one job, stacked by the half hour the crew arrives.
function Coverage({ crews }: { crews: CrewRoute[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const cols = useMemo(() => {
    const out = Array.from({ length: SLOTS }, () => [] as { colour: string; title: string; trade: string }[]);
    for (const c of crews)
      for (const s of c.stops) {
        const i = Math.min(SLOTS - 1, Math.max(0, Math.floor((s.arrive - SHIFT_START) / 30)));
        out[i].push({ colour: c.colour, title: s.job.title, trade: TRADES[c.trade].label });
      }
    out.forEach((col) => col.sort((a, b) => a.trade.localeCompare(b.trade)));
    return out;
  }, [crews]);
  const rows = Math.max(6, ...cols.map((c) => c.length));
  const peak = cols.reduce((best, c, i) => (c.length > cols[best].length ? i : best), 0);
  const total = cols.reduce((n, c) => n + c.length, 0);
  const trades = TRADE_ORDER.filter((t) => crews.some((c) => c.trade === t && c.stops.length));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
          <IconCalendar /> Jobs by half hour
        </p>
        <span className="ml-auto flex flex-wrap gap-3">
          {trades.map((t) => (
            <span key={t} className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
              <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: TRADES[t].shades[0] }} />
              {TRADES[t].label}
            </span>
          ))}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[34px] font-normal leading-none tracking-[-0.03em] tabular-nums">{total}</span>
        <span className="text-[13px] text-muted">visits across the shift</span>
        <span className="ml-auto text-[12px] text-muted">Each square is one job</span>
      </div>
      <div className="relative mt-4 flex gap-[3px]" onMouseLeave={() => setHover(null)}>
        {cols.map((col, i) => (
          <div key={i} className={`flex flex-1 flex-col-reverse gap-[3px] rounded-[6px] p-[2px] ${hover === i ? "ring-1 ring-ink" : ""}`} onMouseEnter={() => setHover(i)}>
            {Array.from({ length: rows }, (_, r) => (
              <span key={r} className="aspect-square w-full rounded-[3px]" style={{ background: col[r]?.colour ?? "#ecece8" }} />
            ))}
          </div>
        ))}
        {hover != null && cols[hover].length > 0 && (
          <div className="pointer-events-none absolute top-0 z-10 w-[230px] rounded-[14px] bg-card p-3 shadow-card-hover" style={{ left: `min(calc(${((hover + 1) / SLOTS) * 100}% + 6px), calc(100% - 230px))` }}>
            <p className="font-mono text-[11px] text-muted">{hm(SHIFT_START + hover * 30)}</p>
            {Object.entries(cols[hover].reduce<Record<string, { n: number; colour: string }>>((m, x) => ({ ...m, [x.trade]: { n: (m[x.trade]?.n ?? 0) + 1, colour: x.colour } }), {})).map(([trade, v]) => (
              <p key={trade} className="mt-1 flex items-center gap-2 font-mono text-[12px]">
                <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: v.colour }} />
                <span className="flex-1">{trade}</span>
                {v.n}
              </p>
            ))}
            <p className="mt-1.5 truncate border-t border-line pt-1.5 text-[11.5px] text-muted">{cols[hover][0].title}</p>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex">
        {cols.map((_, i) => (
          <span key={i} className="flex-1 font-mono text-[10px] text-muted">
            {i % 2 === 0 ? hm(SHIFT_START + i * 30) : ""}
          </span>
        ))}
      </div>
      <p className="mt-3 border-t border-line pt-3 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
        Peak {hm(SHIFT_START + peak * 30)} · {cols[peak].length} jobs at once
      </p>
    </div>
  );
}

/* ------------------------------- Hotspots -------------------------------- */

function HotspotsView({ hotspots, selected, onSelect, jobs }: { hotspots: Hotspot[]; selected: Hotspot | null; onSelect: (h: Hotspot | null) => void; jobs: OpsJob[] }) {
  const counts = { chronic: 0, recurring: 0, "one-off": 0 };
  hotspots.forEach((h) => counts[h.persistence]++);
  const repeat = counts.chronic + counts.recurring;
  const repeatReports = hotspots.filter((h) => h.persistence !== "one-off").reduce((n, h) => n + h.reports, 0);
  const allReports = hotspots.reduce((n, h) => n + h.reports, 0);
  const owners = Object.entries(
    hotspots
      .filter((h) => h.persistence !== "one-off")
      .reduce<Record<string, { n: number; reports: number }>>((m, h) => ({ ...m, [h.fix.owner]: { n: (m[h.fix.owner]?.n ?? 0) + 1, reports: (m[h.fix.owner]?.reports ?? 0) + h.reports } }), {}),
  ).sort((a, b) => b[1].n - a[1].n);
  const maxOwner = Math.max(1, ...owners.map(([, v]) => v.n));

  if (hotspots.length === 0)
    return (
      <Card className="mt-4 py-16 text-center">
        <p className="text-[15px] font-semibold">No hotspot data yet</p>
        <p className="mt-1 text-[13px] text-muted">The heat_cells table is empty or couldn&apos;t be reached. Reload in a minute.</p>
      </Card>
    );

  return (
    <div className="mt-4 grid grid-cols-12 gap-3">
      <Card className="col-span-12 xl:col-span-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Repeat problems</h2>
          <span className="rounded-full bg-canvas px-2.5 py-1 text-[11.5px] font-medium">{hotspots.length} grid cells</span>
        </div>
        <div className="mt-3 flex items-end gap-3">
          <span className="text-[64px] font-normal leading-[0.9] tracking-[-0.045em] tabular-nums">{repeat}</span>
          <span className="pb-1.5 text-[13px] text-muted">places keep coming back</span>
          <span className="mb-2 ml-auto rounded-full bg-[#fbe9e5] px-2.5 py-1 text-[11.5px] font-semibold text-[#9b3a26]">
            {Math.round((repeatReports / Math.max(1, allReports)) * 100)}% of all reports
          </span>
        </div>
        <div className="mt-5 space-y-2.5">
          {(Object.keys(PERSIST) as (keyof typeof PERSIST)[]).map((p) => (
            <div key={p} className="flex items-center gap-3">
              <span className="w-[120px] shrink-0 text-[13px]">
                {PERSIST[p].label}
                <span className="block text-[11px] text-muted">{PERSIST[p].hint}</span>
              </span>
              <span className="relative h-7 flex-1 rounded-full bg-canvas">
                <span className="absolute inset-y-0 left-0 flex items-center justify-end rounded-full pr-0.5" style={{ width: `${Math.max(12, (counts[p] / hotspots.length) * 100)}%`, background: hatch(PERSIST[p].colour) }}>
                  <span className="rounded-full bg-[#10261f] px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-white">{counts[p]}</span>
                </span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="col-span-12 xl:col-span-6">
        {selected ? (
          <FixCard h={selected} onClose={() => onSelect(null)} />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Long-term fixes by team</h2>
              <span className="text-[12px] text-muted">Repeat places each team owns</span>
            </div>
            <div className="mt-4 space-y-3">
              {owners.map(([owner, v]) => (
                <div key={owner} className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-canvas text-[10.5px] font-bold">{initials(owner)}</span>
                  <span className="w-[150px] shrink-0 truncate text-[13px] font-medium">{owner}</span>
                  <span className="relative h-6 flex-1 rounded-full bg-canvas">
                    <span className="absolute inset-y-0 left-0 flex items-center justify-end rounded-full pr-0.5" style={{ width: `${Math.max(26, (v.n / maxOwner) * 100)}%`, background: hatch("#00b341") }}>
                      <span className="whitespace-nowrap rounded-full bg-[#10261f] px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-white">{v.n} place{v.n === 1 ? "" : "s"}</span>
                    </span>
                  </span>
                  <span className="w-[86px] shrink-0 rounded-full border border-line px-2 py-0.5 text-right text-[11px] tabular-nums">{v.reports} reports</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card className="col-span-12 overflow-hidden p-0 xl:col-span-7">
        <div className="flex items-center gap-3 px-5 pb-3 pt-4">
          <h2 className="text-[15px] font-semibold">Where they are</h2>
          <span className="flex gap-3">
            {(Object.keys(PERSIST) as (keyof typeof PERSIST)[]).map((p) => (
              <span key={p} className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
                <i className="h-2.5 w-2.5 rounded-full" style={{ background: PERSIST[p].colour }} />
                {PERSIST[p].label}
              </span>
            ))}
          </span>
        </div>
        <div className="relative mx-3 mb-3 h-[520px] overflow-hidden rounded-[18px]">
          <OpsMap view="hotspots" jobs={jobs} crews={[]} selected={null} road={null} hotspots={hotspots} focus={selected} onPickHotspot={onSelect} />
        </div>
      </Card>

      <Card className="col-span-12 flex max-h-[600px] flex-col xl:col-span-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Ranked by persistence</h2>
          <span className="text-[12px] text-muted">Reports × weeks active</span>
        </div>
        <div className="-mx-2 mt-3 min-h-0 flex-1 overflow-y-auto">
          {hotspots.slice(0, 40).map((h, i) => (
            <button key={h.cell_id} onClick={() => onSelect(h)} className={`flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left transition hover:bg-canvas ${selected?.cell_id === h.cell_id ? "bg-canvas" : ""}`}>
              <span className="w-5 shrink-0 text-right font-mono text-[11px] text-muted">{i + 1}</span>
              <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: PERSIST[h.persistence].colour }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{h.fix.title}</span>
                <span className="block truncate text-[11.5px] text-muted">{h.categories.slice(0, 2).join(" · ") || "Mixed"}</span>
              </span>
              <span className="shrink-0 rounded-full bg-[#10261f] px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-white">{h.reports}</span>
              <span className="w-[62px] shrink-0 rounded-full border border-line px-2 py-0.5 text-center text-[11px] tabular-nums">
                {h.active_weeks} wk{h.active_weeks === 1 ? "" : "s"}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function FixCard({ h, onClose }: { h: Hotspot; onClose: () => void }) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-white" style={{ background: PERSIST[h.persistence].colour }}>
          <IconFlame />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Long-term fix · {PERSIST[h.persistence].label}</p>
          <h2 className="text-[19px] font-semibold leading-snug tracking-[-0.015em]">{h.fix.title}</h2>
        </div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-canvas hover:bg-line" aria-label="Close">
          <IconClose />
        </button>
      </div>
      <p className="mt-2 text-[13px] text-muted">{h.fix.why}</p>
      <div className="mt-3 space-y-2">
        {h.fix.actions.map((a, i) => (
          <div key={a} className="flex items-center gap-3 rounded-[14px] bg-canvas px-3 py-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-card text-[11px] font-semibold shadow-card">{i + 1}</span>
            <span className="flex-1 text-[13px]">{a}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-hackney-tint text-[10px] font-bold text-hackney">{initials(h.fix.owner)}</span>
        <span className="text-[12.5px] font-medium">{h.fix.owner}</span>
        <span className="ml-auto font-mono text-[10.5px] text-muted">
          {h.first_day} to {h.last_day}
        </span>
      </div>
    </div>
  );
}

/* --------------------------------- Bits ---------------------------------- */

function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-[22px] bg-card p-5 shadow-card ${className}`}>{children}</section>;
}

function Kpi({ label, value, sub, badge, tone }: { label: string; value: string; sub: string; badge: string; tone: "green" | "terra" | "grey" }) {
  const t = { green: "bg-hackney-tint text-hackney", terra: "bg-[#fbe9e5] text-[#9b3a26]", grey: "bg-canvas text-ink" }[tone];
  return (
    <div className="px-5 py-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-2 whitespace-nowrap text-[clamp(30px,3.4vw,46px)] font-normal leading-none tracking-[-0.045em] tabular-nums">{value}</p>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${t}`}>{badge}</span>
        {sub}
      </p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-canvas px-3 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-[16px] font-semibold tabular-nums tracking-[-0.01em]">{value}</p>
    </div>
  );
}

function Tag({ children, tone }: { children: ReactNode; tone?: "terra" }) {
  return <span className={`rounded-full px-1.5 py-px text-[10.5px] ${tone === "terra" ? "bg-[#fbe9e5] text-[#9b3a26]" : "bg-canvas text-muted"}`}>{children}</span>;
}

function Chip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="flex h-10 items-center gap-2 rounded-full bg-card px-4 text-[13px] font-medium shadow-card">
      {icon}
      {children}
    </span>
  );
}

function NavItem({ label, icon, href, onClick, active, count, tone }: { label: string; icon: ReactNode; href?: string; onClick?: () => void; active?: boolean; count?: number; tone?: "terra" }) {
  const cls = `flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-[13.5px] transition ${active ? "bg-card font-semibold shadow-card" : "text-ink/80 hover:bg-card/60"}`;
  const body = (
    <>
      <span className="text-ink/70">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {count != null && <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums text-white ${tone === "terra" ? "bg-[#b8573f]" : "bg-[#10261f]"}`}>{count}</span>}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

const initials = (s: string) =>
  s
    .replace(/[^A-Za-z ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(and|the|of)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const IconHome = () => (<svg {...svg} className="h-[18px] w-[18px]"><path d="M4 11l8-6 8 6v8a1 1 0 01-1 1h-4v-5h-6v5H5a1 1 0 01-1-1z" /></svg>);
const IconRoute = () => (<svg {...svg} className="h-[18px] w-[18px]"><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h7a3 3 0 000-6H9a3 3 0 010-6h7" /></svg>);
const IconFlame = () => (<svg {...svg} className="h-[18px] w-[18px]"><path d="M12 21c-3.5 0-6-2.4-6-5.6 0-3.2 2.5-5 3.5-8.4 2 1.4 3 3.2 3 5 1-.8 1.6-2 1.8-3.2C16.3 10.4 18 12.8 18 15.4 18 18.6 15.5 21 12 21z" /></svg>);
const IconPin = () => (<svg {...svg} className="h-[18px] w-[18px]"><path d="M12 21s-6-5.5-6-11a6 6 0 0112 0c0 5.5-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></svg>);
const IconTruck = () => (<svg {...svg} className="h-[18px] w-[18px]"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></svg>);
const IconCalendar = () => (<svg {...svg} className="h-4 w-4"><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>);
const IconChevron = ({ className = "" }: { className?: string }) => (<svg {...svg} strokeWidth={2.2} className={`h-4 w-4 ${className}`}><path d="M9 6l6 6-6 6" /></svg>);
const IconPlus = () => (<svg {...svg} strokeWidth={2.2} className="h-3.5 w-3.5"><path d="M12 5v14M5 12h14" /></svg>);
const IconMinus = () => (<svg {...svg} strokeWidth={2.2} className="h-3.5 w-3.5"><path d="M5 12h14" /></svg>);
const IconClose = () => (<svg {...svg} strokeWidth={2} className="h-4 w-4"><path d="M6 6l12 12M18 6L6 18" /></svg>);

/* ---------------------------------- Map ---------------------------------- */

function OpsMap({
  view,
  jobs,
  crews,
  selected,
  road,
  hotspots,
  focus,
  onPickHotspot,
}: {
  view: View;
  jobs: OpsJob[];
  crews: CrewRoute[];
  selected: CrewRoute | null;
  road: RoadRoute | null;
  hotspots: Hotspot[];
  focus: Hotspot | null;
  onPickHotspot: (h: Hotspot) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ hotspots, onPickHotspot });
  latest.current = { hotspots, onPickHotspot };

  useEffect(() => {
    if (!el.current || map.current) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
    const m = new mapboxgl.Map({ container: el.current, style: OSM_STYLE, center: [-0.062, 51.548], zoom: 12.4, attributionControl: false });
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.current = m;
    m.on("load", () => {
      const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      for (const id of ["heat", "jobs", "routes", "stops", "road", "depot"]) m.addSource(id, { type: "geojson", data: empty });
      m.addLayer({ id: "heat-glow", type: "circle", source: "heat", paint: { "circle-radius": ["interpolate", ["linear"], ["get", "reports"], 1, 10, 7, 34], "circle-color": ["get", "colour"], "circle-opacity": 0.22, "circle-blur": 0.6 } });
      m.addLayer({ id: "heat-core", type: "circle", source: "heat", paint: { "circle-radius": ["interpolate", ["linear"], ["get", "reports"], 1, 4, 7, 11], "circle-color": ["get", "colour"], "circle-stroke-color": "#fff", "circle-stroke-width": ["case", ["get", "focus"], 3, 1.5] } });
      m.addLayer({ id: "jobs", type: "circle", source: "jobs", paint: { "circle-radius": 3, "circle-color": "#141414", "circle-opacity": 0.35 } });
      m.addLayer({ id: "routes", type: "line", source: "routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "colour"], "line-width": ["case", ["get", "dim"], 1.5, 3], "line-opacity": ["case", ["get", "dim"], 0.2, 0.85] } });
      m.addLayer({ id: "road", type: "line", source: "road", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "colour"], "line-width": 5, "line-opacity": 0.9 } });
      m.addLayer({ id: "stops", type: "circle", source: "stops", paint: { "circle-radius": 9, "circle-color": ["get", "colour"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      m.addLayer({ id: "stop-n", type: "symbol", source: "stops", layout: { "text-field": ["get", "n"], "text-size": 10, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "text-allow-overlap": true }, paint: { "text-color": "#fff" } });
      m.addLayer({ id: "depot", type: "circle", source: "depot", paint: { "circle-radius": 7, "circle-color": "#10261f", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
      m.on("click", "heat-core", (e) => {
        const id = e.features?.[0]?.properties?.id;
        const h = latest.current.hotspots.find((x) => x.cell_id === id);
        if (h) latest.current.onPickHotspot(h);
      });
      m.on("mouseenter", "heat-core", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "heat-core", () => (m.getCanvas().style.cursor = ""));
      setReady(true);
    });
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const src = (id: string) => m.getSource(id) as mapboxgl.GeoJSONSource;
    const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
    const pt = (lng: number, lat: number, props: Record<string, unknown>): GeoJSON.Feature => ({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: props });

    src("heat").setData(fc(view === "hotspots" ? hotspots.map((h) => pt(h.lon, h.lat, { id: h.cell_id, reports: h.reports, colour: PERSIST[h.persistence].colour, focus: focus?.cell_id === h.cell_id })) : []));
    src("jobs").setData(fc(view === "dispatch" ? jobs.map((j) => pt(j.lng, j.lat, {})) : []));
    src("routes").setData(
      fc(
        view === "dispatch"
          ? crews
              .filter((c) => !(selected?.id === c.id && road))
              .map((c) => ({
                type: "Feature",
                geometry: { type: "LineString", coordinates: [DEPOT, ...c.stops.map((s) => [s.job.lng, s.job.lat]), DEPOT] },
                properties: { colour: c.colour, dim: Boolean(selected) && selected?.id !== c.id },
              }))
          : [],
      ),
    );
    src("stops").setData(fc(view === "dispatch" && selected ? selected.stops.map((s) => pt(s.job.lng, s.job.lat, { n: String(s.n), colour: selected.colour })) : []));
    src("road").setData(fc(view === "dispatch" && road && selected ? [{ type: "Feature", geometry: road.geometry, properties: { colour: selected.colour } }] : []));
    src("depot").setData(fc(view === "dispatch" ? [pt(DEPOT[0], DEPOT[1], {})] : []));
  }, [ready, view, jobs, crews, selected, road, hotspots, focus]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo({ center: [focus.lon, focus.lat], zoom: 16, duration: 1200 });
  }, [focus]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || view !== "dispatch") return;
    if (!selected || selected.stops.length === 0) {
      m.easeTo({ center: [-0.062, 51.548], zoom: 12.4, duration: 700 });
      return;
    }
    const b = new mapboxgl.LngLatBounds(DEPOT, DEPOT);
    selected.stops.forEach((s) => b.extend([s.job.lng, s.job.lat]));
    m.fitBounds(b, { padding: 70, duration: 900, maxZoom: 15 });
  }, [selected, ready, view]);

  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
