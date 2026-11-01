"use client";

import { useMemo, useRef, useState } from "react";
import { CATEGORY_META } from "@/lib/report/types";
import {
  DEFAULT_CREWS,
  TRADES,
  TRADE_ORDER,
  clock,
  planBacklog,
  tradeOf,
  type CrewRoute,
  type Job,
  type Stop,
  type Trade,
} from "@/lib/council/plan";
import { RouteMap } from "./RouteMap";

const SHIFT_START = 8 * 60;
const SHIFT_END = SHIFT_START + 450;
const MAX_CREWS = 5;

type Props = { jobs: Job[]; date: string; now: number; error: string | null };

function addWorkingDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left--;
  }
  return d;
}
const dayLabel = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function age(createdAt: string, now: number) {
  const h = (now - new Date(createdAt).getTime()) / 3_600_000;
  return h < 24 ? `${Math.max(1, Math.round(h))}h old` : `${Math.round(h / 24)}d old`;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function DayPlanner({ jobs, date, now, error }: Props) {
  const [crews, setCrews] = useState<Record<Trade, number>>(DEFAULT_CREWS);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ jobId: string; nonce: number } | null>(null);
  const nonce = useRef(0);

  const baseline = useMemo(() => planBacklog(jobs, { crews: DEFAULT_CREWS }), [jobs]);
  const backlog = useMemo(() => planBacklog(jobs, { crews }), [jobs, crews]);
  const plan = backlog.today;

  const demand = useMemo(() => {
    const d = Object.fromEntries(TRADE_ORDER.map((t) => [t, 0])) as Record<Trade, number>;
    jobs.forEach((j) => d[tradeOf(j)]++);
    return d;
  }, [jobs]);

  const scheduled = jobs.length - plan.overflow.length;
  const baseScheduled = jobs.length - baseline.today.overflow.length;
  const crewCount = TRADE_ORDER.reduce((s, t) => s + crews[t], 0);
  const baseCrewCount = TRADE_ORDER.reduce((s, t) => s + DEFAULT_CREWS[t], 0);
  const lastBack = Math.max(SHIFT_START, ...plan.crews.filter((c) => c.stops.length).map((c) => c.finish));
  const clears = backlog.daysToClear ? dayLabel(addWorkingDays(date, backlog.daysToClear - 1)) : "Not at this staffing";
  const daysSooner = baseline.daysToClear && backlog.daysToClear ? baseline.daysToClear - backlog.daysToClear : null;
  const changed = TRADE_ORDER.some((t) => crews[t] !== DEFAULT_CREWS[t]);

  const pickStop = (crewId: string, jobId: string) => {
    setSelected(crewId);
    setFocus({ jobId, nonce: ++nonce.current });
    document.getElementById(`stop-${jobId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const setTrade = (t: Trade, n: number) => {
    setCrews((c) => ({ ...c, [t]: Math.max(0, Math.min(MAX_CREWS, n)) }));
    setSelected(null);
  };

  const longDate = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 sm:px-6">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-hackney text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M7 5v14M17 5v14M7 12h10" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">One Hackney · Street services</p>
            <h1 className="truncate text-[18px] font-semibold tracking-[-0.02em] text-ink">Day plan for {longDate}</h1>
          </div>
          <div className="ml-auto hidden items-center gap-2 text-[12.5px] text-muted md:flex">
            <IconClock className="h-4 w-4" />
            Shift {clock(SHIFT_START)}–{clock(SHIFT_END)} from Millfields depot
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 pb-10 pt-5 sm:px-6">
        {error && <p className="mb-4 rounded-2xl bg-white p-4 text-[14px] text-[#b42318] shadow-card">{error}</p>}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Open jobs" value={jobs.length} note={`${plan.clusters} visits after grouping`} />
          <Kpi label="Crews out" value={crewCount} delta={crewCount - baseCrewCount} />
          <Kpi label="Done today" value={scheduled} delta={scheduled - baseScheduled} good="up" note={`${Math.round((scheduled / Math.max(1, jobs.length)) * 100)}% of open work`} accent />
          <Kpi label="Rolls to tomorrow" value={plan.overflow.length} delta={plan.overflow.length - baseline.today.overflow.length} good="down" />
          <Kpi label="Last crew back" value={clock(lastBack)} note={`Shift ends ${clock(SHIFT_END)}`} />
          <Kpi
            label="Backlog clears"
            value={clears}
            note={
              daysSooner
                ? `${Math.abs(daysSooner)} working day${Math.abs(daysSooner) === 1 ? "" : "s"} ${daysSooner > 0 ? "sooner" : "later"}`
                : backlog.bottleneck.length
                  ? `Held up by ${backlog.bottleneck.map((t) => TRADES[t].label.toLowerCase()).join(", ")}`
                  : "If no new reports come in"
            }
            noteTone={daysSooner ? (daysSooner > 0 ? "good" : "bad") : undefined}
          />
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-[84px] lg:self-start">
            <div className="relative h-[54vh] min-h-[380px] overflow-hidden rounded-[24px] bg-white shadow-card">
              <RouteMap plan={plan} selectedCrew={selected} focus={focus} onPickStop={pickStop} />
              <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-64px)] flex-wrap gap-1.5">
                {plan.crews
                  .filter((c) => c.stops.length)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelected(selected === c.id ? null : c.id)}
                      className={`pointer-events-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold shadow-card transition ${
                        selected === c.id ? "bg-ink text-white" : "bg-white/95 text-ink hover:bg-white"
                      }`}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.colour }} />
                      {c.label}
                    </button>
                  ))}
                <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11.5px] text-muted shadow-card">
                  <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-muted-strong bg-white" />
                  Tomorrow
                </span>
              </div>
            </div>
            <DemandGrid jobs={jobs} overflow={plan.overflow} />
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <section className="rounded-[24px] bg-white p-4 shadow-card">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[15px] font-semibold text-ink">Crews by trade</h2>
                {changed && (
                  <button onClick={() => setCrews(DEFAULT_CREWS)} className="text-[12.5px] font-semibold text-hackney hover:underline">
                    Reset to rota
                  </button>
                )}
              </div>
              <ul className="mt-3 divide-y divide-line">
                {TRADE_ORDER.filter((t) => demand[t] || crews[t]).map((t) => {
                  const done = plan.crews.filter((c) => c.trade === t).reduce((s, c) => s + c.stops.length, 0);
                  return (
                    <li key={t} className="flex items-center gap-3 py-2.5">
                      <span className="h-8 w-1.5 rounded-full" style={{ background: TRADES[t].shades[0] }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold text-ink">{TRADES[t].label}</p>
                        <p className="text-[12px] text-muted">
                          {done} of {demand[t]} today
                          {demand[t] - done > 0 && <span className="text-[#b54708]"> · {demand[t] - done} roll over</span>}
                        </p>
                      </div>
                      <Stepper value={crews[t]} onChange={(n) => setTrade(t, n)} label={TRADES[t].label} />
                    </li>
                  );
                })}
              </ul>
            </section>

            {plan.crews.map((c) => (
              <CrewCard
                key={c.id}
                crew={c}
                now={now}
                selected={selected === c.id}
                onSelect={() => setSelected(selected === c.id ? null : c.id)}
                onStop={(s) => pickStop(c.id, s.job.id)}
                focusId={focus?.jobId ?? null}
              />
            ))}
            <p className="px-1 text-[11.5px] leading-relaxed text-muted">
              Jobs within 250 m are grouped into one visit. Each crew covers a slice of the borough around the depot, taking the most urgent work first;
              stops are ordered nearest-first and tidied with 2-opt. Travel assumes straight-line distance x1.3 at 15 km/h. On-site times come from the
              photo pipeline&apos;s work order when there is one, otherwise a default per category.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Kpi({
  label,
  value,
  note,
  delta,
  good,
  accent,
  noteTone,
}: {
  label: string;
  value: string | number;
  note?: string;
  delta?: number;
  good?: "up" | "down";
  accent?: boolean;
  noteTone?: "good" | "bad";
}) {
  const tone = !delta || !good ? "text-muted" : (delta > 0) === (good === "up") ? "text-hackney" : "text-[#b54708]";
  return (
    <div className={`rounded-[20px] p-4 shadow-card ${accent ? "bg-hackney text-white" : "bg-white"}`}>
      <p className={`font-mono text-[10px] uppercase tracking-[0.14em] ${accent ? "text-white/70" : "text-muted"}`}>{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[26px] font-semibold leading-none tracking-[-0.03em]">{value}</span>
        {!!delta && (
          <span className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] font-semibold ${accent ? "bg-white/20 text-white" : `bg-canvas ${tone}`}`}>{signed(delta)}</span>
        )}
      </div>
      {note && (
        <p
          className={`mt-1.5 truncate text-[12px] ${
            accent ? "text-white/80" : noteTone === "good" ? "font-semibold text-hackney" : noteTone === "bad" ? "font-semibold text-[#b54708]" : "text-muted"
          }`}
        >
          {note}
        </p>
      )}
    </div>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const btn =
    "grid h-8 w-8 place-items-center rounded-full border border-line bg-white text-ink transition hover:border-hackney hover:text-hackney disabled:opacity-30 disabled:hover:border-line disabled:hover:text-ink";
  return (
    <div className="flex items-center gap-1.5">
      <button className={btn} onClick={() => onChange(value - 1)} disabled={value <= 0} aria-label={`Remove a ${label} crew`}>
        <IconMinus className="h-4 w-4" />
      </button>
      <span className="w-[58px] whitespace-nowrap text-center font-mono text-[12px] text-ink">
        <span className="text-[16px] font-semibold">{value}</span> crew{value === 1 ? "" : "s"}
      </span>
      <button className={`${btn} !border-hackney !bg-hackney !text-white hover:!bg-[#00543f]`} onClick={() => onChange(value + 1)} disabled={value >= MAX_CREWS} aria-label={`Add a ${label} crew`}>
        <IconPlus className="h-4 w-4" />
      </button>
    </div>
  );
}

function CrewCard({
  crew,
  now,
  selected,
  onSelect,
  onStop,
  focusId,
}: {
  crew: CrewRoute;
  now: number;
  selected: boolean;
  onSelect: () => void;
  onStop: (s: Stop) => void;
  focusId: string | null;
}) {
  const [all, setAll] = useState(false);
  const shown = all || selected ? crew.stops : crew.stops.slice(0, 4);
  const span = SHIFT_END - SHIFT_START + 30;
  const pct = (min: number) => `${((min - SHIFT_START) / span) * 100}%`;
  const used = crew.workMin + crew.travelMin;

  return (
    <section className={`rounded-[24px] bg-white shadow-card transition ${selected ? "ring-2" : ""}`} style={selected ? { ["--tw-ring-color" as string]: crew.colour } : undefined}>
      <button onClick={onSelect} className="flex w-full items-center gap-3 px-4 pt-4 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] text-white" style={{ background: crew.colour }}>
          <IconVan className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-ink">{crew.label}</p>
          <p className="text-[12px] text-muted">
            {crew.stops.length} jobs · {crew.km.toFixed(1)} km · {Math.round(crew.travelMin)} min driving
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Back</p>
          <p className="font-mono text-[15px] font-semibold text-ink">{crew.stops.length ? clock(crew.finish) : "—"}</p>
        </div>
      </button>

      {/* Gantt strip: travel in a light tint, on-site work in the crew colour. */}
      <div className="px-4 pt-3">
        <div className="relative h-7 overflow-hidden rounded-lg bg-canvas">
          {crew.stops.map((s) => (
            <button
              key={s.job.id}
              title={`${clock(s.arrive)} ${s.job.title}`}
              onClick={() => onStop(s)}
              className="absolute inset-y-1 rounded-[4px] transition hover:brightness-110"
              style={{ left: pct(s.arrive), width: `max(3px, calc(${pct(s.depart)} - ${pct(s.arrive)} - 1px))`, background: crew.colour, opacity: focusId === s.job.id ? 1 : 0.85 }}
            />
          ))}
          {crew.stops.length > 0 && (
            <span className="absolute inset-y-2.5 rounded-full opacity-30" style={{ left: pct(crew.finish - crew.returnMin), width: `calc(${pct(crew.finish)} - ${pct(crew.finish - crew.returnMin)})`, background: crew.colour }} />
          )}
          <span className="absolute inset-y-0 w-px bg-ink/40" style={{ left: pct(SHIFT_END) }} />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[9.5px] text-muted">
          {[8, 10, 12, 14].map((h) => (
            <span key={h}>{clock(h * 60)}</span>
          ))}
          <span>{clock(SHIFT_END)}</span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11.5px] text-muted">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (used / 450) * 100)}%`, background: crew.colour }} />
          </span>
          {Math.round((used / 450) * 100)}% of shift · {Math.round((crew.workMin / Math.max(1, used)) * 100)}% on site
        </div>
      </div>

      <ol className="mt-2 px-2 pb-2">
        {shown.map((s, i) => {
          const meta = CATEGORY_META[s.job.category];
          const sameVisit = i > 0 && shown[i - 1].cluster === s.cluster;
          return (
            <li key={s.job.id} id={`stop-${s.job.id}`}>
              <button
                onClick={() => onStop(s)}
                className={`flex w-full items-start gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-canvas ${focusId === s.job.id ? "bg-hackney-tint" : ""}`}
              >
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold text-white" style={{ background: crew.colour }}>
                  {s.n}
                </span>
                <span className="w-11 shrink-0 pt-1 font-mono text-[12px] font-semibold text-ink">{clock(s.arrive)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink">{s.job.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ background: meta.colour }} />
                      {meta.label}
                    </span>
                    <span>{s.minutes} min</span>
                    <span>{s.job.severity}</span>
                    <span>{age(s.job.createdAt, now)}</span>
                    {sameVisit ? <span className="text-hackney">same visit</span> : s.travelMin >= 1 && <span>{Math.round(s.travelMin)} min drive</span>}
                    {s.job.source === "assessment" && <span className="text-hackney">photo assessed</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {!selected && crew.stops.length > 4 && (
        <button onClick={() => setAll(!all)} className="w-full border-t border-line py-2.5 text-[12.5px] font-semibold text-hackney hover:bg-canvas">
          {all ? "Show fewer" : `Show all ${crew.stops.length} stops`}
        </button>
      )}
      {!crew.stops.length && <p className="px-4 pb-4 text-[12.5px] text-muted">No jobs for this crew today.</p>}
    </section>
  );
}

/** Each square is one job: filled when a crew does it today, outlined when it rolls over. */
function DemandGrid({ jobs, overflow }: { jobs: Job[]; overflow: Job[] }) {
  const rolled = new Set(overflow.map((j) => j.id));
  return (
    <section className="rounded-[24px] bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Demand vs capacity</h2>
        <p className="text-[12px] text-muted">Each square is one job. Filled: done today. Outline: rolls to tomorrow.</p>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {TRADE_ORDER.map((t) => {
          const mine = jobs.filter((j) => tradeOf(j) === t);
          if (!mine.length) return null;
          const colour = TRADES[t].shades[0];
          const done = mine.filter((j) => !rolled.has(j.id)).length;
          return (
            <div key={t} className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-3">
              <div>
                <p className="text-[12.5px] font-semibold text-ink">{TRADES[t].label}</p>
                <p className="font-mono text-[11px] text-muted">
                  {done}/{mine.length}
                </p>
              </div>
              <div className="flex flex-wrap gap-[3px]">
                {mine.map((j) => (
                  <span
                    key={j.id}
                    title={j.title}
                    className="h-[11px] w-[11px] rounded-[3px] transition-colors duration-300"
                    style={rolled.has(j.id) ? { boxShadow: `inset 0 0 0 1.5px ${colour}`, opacity: 0.55 } : { background: colour }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type IconProps = { className?: string };
function Icon({ className = "h-5 w-5", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}
const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
const IconMinus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);
const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
const IconVan = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 7h11v9.5h-11zM13.5 10h4l3 3.5v3h-7" />
    <circle cx="6.5" cy="17.5" r="1.8" />
    <circle cx="16.5" cy="17.5" r="1.8" />
  </Icon>
);
