import { localToLatLng, type GameMapData, type GameReport } from "./map-data";

const categories: GameReport["category"][] = ["pothole", "flytip", "streetlight", "graffiti", "pavement"];

/** Stable demo reports placed directly on the downloaded street centre lines. */
export function sampleReports(data: GameMapData): GameReport[] {
  const segments: { x: number; y: number; distance: number }[] = [];
  for (const [, road] of data.roads) {
    for (let i = 0; i < road.length - 2; i += 2) {
      const x = (road[i] + road[i + 2]) / 2, y = (road[i + 1] + road[i + 3]) / 2;
      if (Math.hypot(road[i] - road[i + 2], road[i + 1] - road[i + 3]) > 18) segments.push({ x, y, distance: Math.hypot(x, y) });
    }
  }
  segments.sort((a, b) => a.distance - b.distance || a.x - b.x || a.y - b.y);
  const chosen: typeof segments = [];
  // Keep the opening view lively, then pick the most distant uncovered street each time.
  for (const p of segments) {
    if (chosen.length >= 18) break;
    if (chosen.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > 180)) chosen.push(p);
  }
  while (chosen.length < 40 && chosen.length < segments.length) {
    let best: (typeof segments)[number] | undefined;
    let widestGap = 0;
    for (const point of segments) {
      const gap = Math.min(...chosen.map((p) => (p.x - point.x) ** 2 + (p.y - point.y) ** 2));
      if (gap > widestGap) { widestGap = gap; best = point; }
    }
    if (!best) break;
    chosen.push(best);
  }
  return chosen.slice(0, 40).map((p, i) => ({ id: `demo-${String(i + 1).padStart(2, "0")}`, ...localToLatLng(p.x, p.y, data.origin), category: categories[i % 5], status: i % 9 === 8 ? "fixed" : i % 4 === 3 ? "scheduled" : "open" }));
}
