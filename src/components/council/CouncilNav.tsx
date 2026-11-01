import Link from "next/link";
import type { ReactNode } from "react";

// One sidebar for every council workspace page: overview, repairs, schedule, dispatch, hotspots.

export type CouncilPage = "overview" | "repairs" | "schedule" | "dispatch" | "hotspots";

const s = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "h-[18px] w-[18px]", "aria-hidden": true };
const ICONS: Record<CouncilPage | "map", ReactNode> = {
  overview: (<svg {...s}><path d="M4 11l8-6 8 6v8a1 1 0 01-1 1h-4v-5h-6v5H5a1 1 0 01-1-1z" /></svg>),
  repairs: (<svg {...s}><path d="M14.5 6.5l3 3M9 13l-5 5a1.8 1.8 0 002.6 2.6l5-5M13 4.5a5 5 0 006.5 6.5l-3-3 .5-3z" /></svg>),
  schedule: (<svg {...s}><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16M9 3v4M15 3v4M8 14h3M13 14h3" /></svg>),
  dispatch: (<svg {...s}><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h7a3 3 0 000-6H9a3 3 0 010-6h7" /></svg>),
  hotspots: (<svg {...s}><path d="M12 21c-3.5 0-6-2.4-6-5.6 0-3.2 2.5-5 3.5-8.4 2 1.4 3 3.2 3 5 1-.8 1.6-2 1.8-3.2C16.3 10.4 18 12.8 18 15.4 18 18.6 15.5 21 12 21z" /></svg>),
  map: (<svg {...s}><path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4zM9 4v13.5M15 6.5V20" /></svg>),
};

const PAGES: { id: CouncilPage; label: string; href: string; group: "Plan" | "Deliver" }[] = [
  { id: "overview", label: "Overview", href: "/dashboard", group: "Plan" },
  { id: "repairs", label: "Repairs", href: "/dashboard/repairs", group: "Plan" },
  { id: "hotspots", label: "Hotspots", href: "/dashboard/hotspots", group: "Plan" },
  { id: "schedule", label: "Week schedule", href: "/dashboard/schedule", group: "Deliver" },
  { id: "dispatch", label: "Dispatch", href: "/dashboard/dispatch", group: "Deliver" },
];

export function CouncilNav({
  active,
  counts = {},
  onReset,
  ready = true,
}: {
  active: CouncilPage;
  counts?: Partial<Record<CouncilPage, { n: number; tone?: "terra" }>>;
  onReset?: () => void;
  ready?: boolean;
}) {
  return (
    <aside className="sticky top-0 flex h-dvh w-[236px] shrink-0 flex-col px-4 py-5 text-ink">
      <Link href="/" className="flex items-center gap-2.5 px-2" aria-label="One Hackney map">
        <span className="flex">
          <span className="h-5 w-5 rounded-full bg-hackney" />
          <span className="-ml-2 h-5 w-5 rounded-full bg-hackney-bright mix-blend-multiply" />
        </span>
        <span className="text-[17px] font-semibold tracking-[-0.02em]">One Hackney</span>
      </Link>

      <div className="mt-5 flex items-center gap-3 rounded-[16px] bg-card p-3 shadow-card">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-hackney text-[11px] font-bold text-white">LBH</span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-semibold">Hackney Council</span>
          <span className="block truncate text-[11.5px] text-muted">Streets and repairs</span>
        </span>
      </div>

      {(["Plan", "Deliver"] as const).map((group) => (
        <div key={group}>
          <div className="mt-6 px-2 text-[11.5px] text-muted">{group}</div>
          <nav className="mt-1.5 space-y-0.5" aria-label={group}>
            {PAGES.filter((p) => p.group === group).map((p) => {
              const on = p.id === active;
              const c = counts[p.id];
              return (
                <Link
                  key={p.id}
                  href={p.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-[12px] px-2.5 py-2 text-[13.5px] transition ${on ? "bg-card font-semibold shadow-card" : "text-ink/75 hover:bg-card/60 hover:text-ink"}`}
                >
                  <span className={on ? "text-hackney" : "text-ink/60"}>{ICONS[p.id]}</span>
                  <span className="flex-1">{p.label}</span>
                  {c && <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums text-white ${c.tone === "terra" ? "bg-[#b8573f]" : "bg-[#10261f]"}`}>{c.n}</span>}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}

      <Link href="/" className="mt-6 flex items-center gap-3 rounded-[12px] px-2.5 py-2 text-[13.5px] text-ink/75 transition hover:bg-card/60 hover:text-ink">
        <span className="text-ink/60">{ICONS.map}</span>
        Back to the map
      </Link>

      <div className="mt-auto rounded-[16px] bg-card p-3.5 shadow-card">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold">
          <span className="h-2 w-2 rounded-full bg-hackney-bright" />
          Street brain is live
        </div>
        <div className="mt-1 text-[11.5px] leading-snug text-muted">Resident reports arrive with an AI work order: trade, crew, kit and time on site.</div>
        {onReset && (
          <button onClick={onReset} disabled={!ready} className="mt-2 text-[11.5px] font-medium text-muted underline underline-offset-2 hover:text-ink disabled:opacity-50">
            Reset demo decisions
          </button>
        )}
      </div>
    </aside>
  );
}
