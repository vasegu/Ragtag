import { createClient } from "@supabase/supabase-js";
import { fixMyStreetReports, mapCategory } from "@/lib/report/fixmystreet";
import { buildTrack } from "@/lib/report/track";
import type { Job, Trade } from "./plan";

// Server-side: the open street jobs the day planner works from.
// FixMyStreet reports Hackney owns and hasn't fixed, in the tracker's planner order,
// plus photo-pipeline assessments that have a location (using their work order when present).

const TRADE_PATTERNS: [RegExp, Trade][] = [
  [/electric|lighting|lamp/i, "electrician"],
  [/highway|road|carriageway|footway|pavement|surfac/i, "highways"],
  [/enforce|parking|vehicle/i, "enforcement"],
  [/fly.?tip|waste|refuse|bulky/i, "waste"],
  [/cleans|litter|graffiti|sweep/i, "cleansing"],
];

function tradeFrom(text: unknown): Trade | undefined {
  if (typeof text !== "string") return undefined;
  return TRADE_PATTERNS.find(([re]) => re.test(text))?.[1];
}

type AssessmentRow = { id: string; created_at: string; latitude: number | null; longitude: number | null; assessment: Record<string, unknown> | null };

/** Photo-pipeline assessments with a location. Needs the server secret key; skipped quietly without it. */
async function assessmentJobs(): Promise<Omit<Job, "rank">[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return [];
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("street_assessments")
    .select("id, created_at, latitude, longitude, assessment")
    .eq("source_mode", "live")
    .not("latitude", "is", null)
    .limit(200);
  if (error) throw new Error(`street_assessments: ${error.message}`);
  return ((data ?? []) as AssessmentRow[]).flatMap((row) => {
    const a = row.assessment ?? {};
    if (a.outcome === "rejected" || row.latitude == null || row.longitude == null) return [];
    const wo = (a.workOrder ?? null) as Record<string, unknown> | null;
    const resources = (a.resources ?? null) as Record<string, unknown> | null;
    const severity = typeof a.severity === "number" ? a.severity : 3;
    return [
      {
        id: `sb-${row.id}`,
        lat: row.latitude,
        lng: row.longitude,
        category: mapCategory(typeof a.category === "string" ? a.category : null),
        title: typeof a.title === "string" ? a.title : "Street problem",
        severity: severity >= 4 ? "S2" : severity >= 3 ? "S3" : "S4",
        createdAt: row.created_at,
        trade: tradeFrom(wo?.trade) ?? tradeFrom(resources?.trade),
        minutes: typeof wo?.estimatedMinutes === "number" ? wo.estimatedMinutes : undefined,
        crewSize: typeof wo?.crewSize === "number" ? wo.crewSize : undefined,
        tasks: Array.isArray(wo?.tasks) ? (wo.tasks as unknown[]).filter((t): t is string => typeof t === "string") : undefined,
        source: "assessment" as const,
      },
    ];
  });
}

export async function councilJobs(now = Date.now()): Promise<Job[]> {
  const [reports, assessed] = await Promise.all([
    fixMyStreetReports(),
    assessmentJobs().catch((err) => {
      console.error(err);
      return [];
    }),
  ]);
  const jobs: Job[] = [];
  for (const r of reports) {
    if (r.status === "fixed") continue;
    const track = buildTrack(r, reports, { now });
    if (track.owner.kind !== "hackney" || !track.queue) continue;
    jobs.push({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      category: r.category,
      title: r.title,
      rank: track.queue.overall.position,
      severity: track.severity,
      createdAt: r.created_at,
      source: "fixmystreet",
    });
  }
  // Assessments slot in by severity, after reports of the same severity.
  const sevRank = (s: string) => Number(s.slice(1));
  const all = [...jobs, ...assessed.map((a) => ({ ...a, rank: Infinity }))].sort(
    (a, b) => sevRank(a.severity) - sevRank(b.severity) || a.rank - b.rank || (a.id < b.id ? -1 : 1),
  );
  return all.map((j, i) => ({ ...j, rank: i + 1 }));
}
