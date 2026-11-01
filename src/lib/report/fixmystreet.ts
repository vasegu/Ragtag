import { createClient } from "@supabase/supabase-js";
import type { Category, Report } from "./types";

// Reads Manjeev's FixMyStreet harvest (tables `reports` and `report_photos`) and maps it
// onto the app's Report shape.

/** FixMyStreet's Hackney categories mapped onto ours. Anything unlisted becomes "pavement" (street damage). */
const CATEGORY_MAP: [RegExp, Category][] = [
  [/fly.?tip/i, "flytip"],
  [/litter|dog poo|fouling|needles|drug|overflowing|bin/i, "litter"],
  [/parking|abandoned vehicle|idling|charge point/i, "parking"],
  [/street lighting|streetlight|lamp/i, "streetlight"],
  [/graffiti|fly posting/i, "graffiti"],
  [/pothole|road surface/i, "pothole"],
];

export function mapCategory(fms: string | null): Category {
  for (const [re, c] of CATEGORY_MAP) if (re.test(fms ?? "")) return c;
  return "pavement";
}

function mapStatus(state: string | null, fixed: boolean | null): Report["status"] {
  if (fixed) return "fixed";
  if (/scheduled|investigating|in progress/i.test(state ?? "")) return "scheduled";
  return "open";
}

type Row = {
  id: number;
  title: string | null;
  category: string | null;
  state: string | null;
  is_fixed: boolean | null;
  lat: number | null;
  lon: number | null;
  created_at: string | null;
  confirmed_at: string | null;
  last_update: string | null;
  report_photos: { storage_path: string | null }[] | null;
};

export async function fixMyStreetReports(): Promise<Report[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const db = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("reports")
    .select("id, title, category, state, is_fixed, lat, lon, created_at, confirmed_at, last_update, report_photos(storage_path)")
    .not("lat", "is", null)
    .limit(2000);
  if (error) throw new Error(`fixmystreet reports: ${error.message}`);

  return (data as Row[]).map((r) => {
    const photo = r.report_photos?.find((p) => p.storage_path)?.storage_path;
    return {
      id: `fms-${r.id}`,
      lat: r.lat!,
      lng: r.lon!,
      category: mapCategory(r.category),
      status: mapStatus(r.state, r.is_fixed),
      title: r.title?.trim() || r.category || "Street problem",
      // Only a few rows carry created_at; last_update is always present.
      created_at: r.created_at ?? r.confirmed_at ?? r.last_update ?? new Date().toISOString(),
      source: "fixmystreet",
      confirmations: 0,
      photo_url: photo ? `${url}/storage/v1/object/public/images/${photo}` : undefined,
    } satisfies Report;
  });
}
