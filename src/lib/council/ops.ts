import { createClient } from "@supabase/supabase-js";
import { councilJobs } from "./jobs";
import type { Job, Trade } from "./plan";

// Server-side data for the council operations view: open jobs enriched with the AI work orders
// (problem_jobs), the supply units that can do them, and Manjeev's hotspot grid (heat_cells).

export type SupplyUnit = {
  id: string;
  name: string;
  kind: string;
  trade: string;
  area: string;
  crew_size: number;
  jobs_per_day: number;
  hourly_cost: number;
  depot_lat: number | null;
  depot_lon: number | null;
  available: boolean;
  notes: string | null;
};

export type HeatCell = {
  cell_id: string;
  lat: number;
  lon: number;
  reports: number;
  active_days: number;
  active_weeks: number;
  top_categories: string | null;
  first_day: string | null;
  last_day: string | null;
};

export type OpsJob = Job & {
  sizeBand?: string;
  quantity?: string;
  supplyUnitId?: string | null;
  bundleKey?: string;
  disputed?: boolean;
  problemId?: string;
};

/** Supply unit trade → day planner trade. */
export const SUPPLY_TO_PLANNER: Record<string, Trade> = {
  waste: "waste",
  cleansing: "cleansing",
  graffiti: "cleansing",
  highways: "highways",
  electrical: "electrician",
  enforcement: "enforcement",
};

function plannerTrade(text: string | null | undefined): Trade | undefined {
  const t = (text ?? "").toLowerCase();
  if (/electric|light|lamp/.test(t)) return "electrician";
  if (/highway|road|carriageway|footway|pavement|surfac|paving|play/.test(t)) return "highways";
  if (/enforce|parking|vehicle/.test(t)) return "enforcement";
  if (/fly|waste|bulky|refuse|tip/.test(t)) return "waste";
  if (/cleans|litter|graffiti|sweep|fouling/.test(t)) return "cleansing";
  return undefined;
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false },
  });
}

export async function opsData(now = Date.now()) {
  const db = admin();
  const [jobs, supply, heat, work] = await Promise.all([
    councilJobs(now),
    db.from("supply_units").select("*").order("trade"),
    db.from("heat_cells").select("cell_id, lat, lon, reports, active_days, active_weeks, top_categories, first_day, last_day").order("reports", { ascending: false }).limit(500),
    // Work orders for backfilled FixMyStreet reports, keyed by the original report id.
    db
      .from("problem_jobs")
      .select("problem_id, trade, bundle_key, size_band, quantity, crew_size, minutes_min, minutes_max, supply_unit_id, disputed, status, street_assessments!inner(source_report_id, source_mode)")
      .limit(2000),
  ]);

  const byReport = new Map<string, Record<string, unknown>>();
  for (const row of (work.data ?? []) as Record<string, unknown>[]) {
    const sa = row.street_assessments as { source_report_id: string | null } | { source_report_id: string | null }[] | null;
    const src = Array.isArray(sa) ? sa[0]?.source_report_id : sa?.source_report_id;
    if (src) byReport.set(`fms-${src}`, row);
  }

  const enriched: OpsJob[] = jobs.map((j) => {
    const w = byReport.get(j.id);
    if (!w) return j;
    const min = Number(w.minutes_min) || 20;
    const max = Number(w.minutes_max) || min;
    return {
      ...j,
      trade: plannerTrade(w.trade as string) ?? j.trade,
      minutes: Math.round((min + max) / 2),
      crewSize: Number(w.crew_size) || undefined,
      sizeBand: w.size_band as string,
      quantity: w.quantity as string,
      supplyUnitId: (w.supply_unit_id as string) ?? null,
      bundleKey: w.bundle_key as string,
      disputed: Boolean(w.disputed),
      problemId: w.problem_id as string,
    };
  });

  return {
    jobs: enriched,
    supply: (supply.data ?? []) as SupplyUnit[],
    heat: (heat.data ?? []) as HeatCell[],
    withWorkOrders: enriched.filter((j) => j.problemId).length,
  };
}
