// Priority-location heat map: all maths, no React, no DB. One pass over the reports the map already has.
// Each occupied grid cell becomes ONE centre point: opacity = how urgent, radius = how far the problem reaches.
import type { Category, Report } from "@/lib/report/types";

export type Strategy = "volume" | "persistence" | "severity" | "recurrence" | "blend";
export const STRATEGIES: Strategy[] = ["volume", "persistence", "severity", "recurrence", "blend"];

export type HeatPoint = {
  lat: number;
  lng: number;
  /** Alpha of the centre, 0-1. Higher = more urgent. */
  opacity: number;
  /** How far the glow reaches, metres. */
  radiusM: number;
  /** Raw 0-1 score the strategy gave this cell (before the opacity mapping). */
  intensity: number;
  /** Why: the cell stats behind the point, for tooltips and tuning. */
  stats: CellStats;
};

export type CellStats = {
  reports: number;
  activeDays: number;
  activeWeeks: number;
  /** Sum of severity x recency decay x (open ? 1 : FIXED_WEIGHT). */
  weightedSeverity: number;
  /** Reports created after the cell's first fix: the same spot breaking again. */
  recurrences: number;
  /** Shannon entropy of the category mix, normalised 0 (one kind) to 1 (all kinds equal). */
  entropy: number;
  /** RMS distance of member reports from the cell centre, metres. */
  spreadM: number;
};

export type Options = {
  strategy?: Strategy;
  now?: Date;
  /** Recency half-life for the severity strategy, days. */
  halfLifeDays?: number;
  /** Grid size in degrees; defaults match util/heatmap.py (~55 m). */
  latStep?: number;
  lonStep?: number;
  /** Intensity below this is not drawn. */
  minIntensity?: number;
  /** Centre opacity range. */
  opacityMin?: number;
  opacityMax?: number;
};

// 1-5 like the classifier's severity scale; reports from FixMyStreet carry no photo severity, so category stands in.
export const SEVERITY: Record<Category, number> = {
  pothole: 4, pavement: 3, flytip: 3, streetlight: 3, graffiti: 2, litter: 2, parking: 1.5,
};

/** Cells scoring below this are not drawn at all: only moderate-to-high need gets a glow. */
export const MODERATE = 0.16; // live data: 169 of 281 cells (0.2 gave 133 once history counts, 0.12 shows everything)
/** Fixed/closed reports still count as history: a spot that keeps breaking stays warm after the fix. */
const FIXED_WEIGHT = 0.6;
const HIGH = 0.45;

const M_PER_DEG_LAT = 111_320;
const DAY = 86_400_000;
const sat = (x: number, k: number) => 1 - Math.exp(-x / k); // 0..1, never needs the whole dataset to normalise

export function heatPoints(reports: Report[], o: Options = {}): HeatPoint[] {
  const { strategy = "blend", now = new Date(), halfLifeDays = 45, latStep = 0.0005, lonStep = 0.0008,
    minIntensity = MODERATE, opacityMin = 0.15, opacityMax = 0.7 } = o;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((51.54 * Math.PI) / 180);

  const bins = new Map<string, Report[]>();
  for (const r of reports) {
    const key = `${Math.floor(r.lat / latStep)}_${Math.floor(r.lng / lonStep)}`;
    (bins.get(key) ?? bins.set(key, []).get(key)!).push(r);
  }

  const out: HeatPoint[] = [];
  for (const rs of bins.values()) {
    const n = rs.length;
    const lat = rs.reduce((s, r) => s + r.lat, 0) / n;
    const lng = rs.reduce((s, r) => s + r.lng, 0) / n;

    const days = new Set<number>();
    const cats = new Map<Category, number>();
    let weightedSeverity = 0, spread2 = 0, firstFix = Infinity;
    for (const r of rs) {
      const t = Date.parse(r.created_at);
      days.add(Math.floor(t / DAY));
      cats.set(r.category, (cats.get(r.category) ?? 0) + 1);
      const age = Math.max(0, (now.getTime() - t) / DAY);
      const open = r.status === "fixed" ? 0.25 : 1;
      weightedSeverity += SEVERITY[r.category] * (1 + 0.25 * Math.min(r.confirmations, 4)) * 0.5 ** (age / halfLifeDays) * open;
      spread2 += ((r.lat - lat) * M_PER_DEG_LAT) ** 2 + ((r.lng - lng) * mPerDegLon) ** 2;
      // ponytail: no fix date for app reports, so a "fixed" report counts as fixed on the day it was created.
      if (r.status === "fixed") firstFix = Math.min(firstFix, Date.parse(r.fms?.resolvedAt ?? r.created_at));
    }
    const recurrences = rs.filter((r) => Date.parse(r.created_at) > firstFix).length;
    const weeks = new Set([...days].map((d) => Math.floor((d + 3) / 7))); // epoch day 0 is a Thursday -> Monday weeks
    const entropy = cats.size < 2 ? 0
      : -[...cats.values()].reduce((s, c) => s + (c / n) * Math.log(c / n), 0) / Math.log(cats.size);
    const stats: CellStats = { reports: n, activeDays: days.size, activeWeeks: weeks.size, weightedSeverity,
      recurrences, entropy, spreadM: Math.sqrt(spread2 / n) };

    const intensity = score(strategy, stats);
    if (intensity < minIntensity) continue;

    // Radius: half a cell as the floor, grows with log(volume), the real scatter of the reports, and category variety
    // (many kinds of problem = an area-wide issue, one kind = a tight hotspot). Capped so one cell cannot flood the map.
    const radiusM = Math.min(250, 30 + 12 * Math.log2(1 + n) + 1.5 * stats.spreadM + 40 * entropy);
    out.push({ lat, lng, intensity, opacity: opacityMin + (opacityMax - opacityMin) * intensity, radiusM, stats });
  }
  return out.sort((a, b) => b.intensity - a.intensity);
}

export function score(strategy: Strategy, s: CellStats): number {
  const volume = sat(s.reports, 5);
  const persistence = sat(s.activeDays + 3 * (s.activeWeeks - 1), 4); // a second week counts like 3 more days
  const severity = sat(s.weightedSeverity, 8);
  const recurrence = sat(s.recurrences, 2);
  switch (strategy) {
    case "volume": return volume;
    case "persistence": return persistence;
    case "severity": return severity;
    case "recurrence": return recurrence;
    case "blend": return 0.35 * persistence + 0.35 * severity + 0.15 * volume + 0.15 * recurrence;
  }
}

/** GeoJSON for a Mapbox circle layer; pair with circlePaint(). */
export function toFeatureCollection(points: HeatPoint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { opacity: p.opacity, r: p.radiusM, intensity: p.intensity },
    })),
  };
}

/** Paint for a `circle` layer: radius is metres on the ground at any zoom (512px tiles, London latitude). */
export function circlePaint() {
  const perPx = 78_271.517 * Math.cos((51.54 * Math.PI) / 180); // metres per pixel at zoom 0
  const px = ["/", ["get", "r"], perPx];
  return {
    // Orange-red at the moderate threshold, full red from "high" up.
    "circle-color": ["interpolate", ["linear"], ["get", "intensity"], MODERATE, "#f2784b", HIGH, "#e5242b"],
    // Fade out once zoomed right in, where the individual pins tell the story.
    "circle-opacity": ["interpolate", ["linear"], ["zoom"], 16.5, ["get", "opacity"], 18, ["*", ["get", "opacity"], 0.3]],
    "circle-blur": 1, // soft edge: centre keeps its opacity, fades out to the radius
    "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 0, px, 22, ["*", px, 2 ** 22]],
    "circle-emissive-strength": 1,
    "circle-pitch-alignment": "map",
  };
}
