// Real road routes between stops: Mapbox Directions first, the public OSRM server as a fallback.
// Both route on OpenStreetMap-based street networks. Long runs are split into chunks of 25 stops.

export type RoadRoute = { geometry: GeoJSON.LineString; minutes: number; km: number; legs: number[] };

const MAX = 25;

async function mapbox(points: [number, number][], signal?: AbortSignal) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) throw new Error("no token");
  const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${points.map((p) => p.join(",")).join(";")}?geometries=geojson&overview=full&access_token=${token}`, { signal });
  const d = await res.json();
  if (!res.ok || !d.routes?.[0]) throw new Error(d.message ?? "no route");
  return d.routes[0] as { geometry: GeoJSON.LineString; duration: number; distance: number; legs: { duration: number }[] };
}

async function osrm(points: [number, number][], signal?: AbortSignal) {
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${points.map((p) => p.join(",")).join(";")}?overview=full&geometries=geojson`, { signal });
  const d = await res.json();
  if (!res.ok || !d.routes?.[0]) throw new Error("no route");
  return d.routes[0] as { geometry: GeoJSON.LineString; duration: number; distance: number; legs: { duration: number }[] };
}

export async function roadRoute(points: [number, number][], signal?: AbortSignal): Promise<RoadRoute | null> {
  if (points.length < 2) return null;
  const chunks: [number, number][][] = [];
  for (let i = 0; i < points.length - 1; i += MAX - 1) chunks.push(points.slice(i, i + MAX));
  const out: RoadRoute = { geometry: { type: "LineString", coordinates: [] }, minutes: 0, km: 0, legs: [] };
  for (const chunk of chunks) {
    const r = await mapbox(chunk, signal).catch((e) => (signal?.aborted ? Promise.reject(e) : osrm(chunk, signal)));
    out.geometry.coordinates.push(...(out.geometry.coordinates.length ? r.geometry.coordinates.slice(1) : r.geometry.coordinates));
    out.minutes += r.duration / 60;
    out.km += r.distance / 1000;
    out.legs.push(...r.legs.map((l) => l.duration / 60));
  }
  return out;
}
