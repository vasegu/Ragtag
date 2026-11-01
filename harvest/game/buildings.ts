/** Run: npx tsx harvest/game/buildings.ts [--fallback]
 * OSM geometry is © OpenStreetMap contributors (ODbL).
 * Rings are stored without a repeated closing vertex; coordinates are east/north metres.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ORIGIN, latLngToLocal, type GameMapData } from "../../src/components/game/map-data";

type Point = { lat: number; lon: number };
type Member = { type: string; ref: number; role: string; geometry?: Point[] };
type Element = { type: string; id: number; tags?: Record<string, string>; geometry?: Point[]; members?: Member[] };
type Overpass = { elements: Element[]; remark?: string };
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const QUERY = `[out:json][timeout:100];
rel["name"="London Borough of Hackney"]["boundary"="administrative"]["admin_level"="8"];
map_to_area->.hackney;
(
  way(area.hackney)["building"]["building"!="no"];
  rel(area.hackney)["building"]["building"!="no"]["type"="multipolygon"];
  way(area.hackney)["highway"~"^(trunk|primary|secondary|tertiary|residential|unclassified|living_street)(_link)?$"];
  way(area.hackney)["waterway"~"^(canal|river)$"];
  way(area.hackney)["natural"="water"];
  rel(area.hackney)["natural"="water"]["type"="multipolygon"];
  way(area.hackney)["leisure"="park"];
  rel(area.hackney)["leisure"="park"]["type"="multipolygon"];
  way(area.hackney)["name"="London Fields"]["leisure"="park"];
);out geom;`;

export function seeded(seed: number) {
  let n = seed | 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) | 0;
    return (n >>> 0) / 4294967296;
  };
}

const samePoint = (a: Point, b: Point) => a.lat === b.lat && a.lon === b.lon;

/** OSM multipolygon members can be unordered, reversed and split across ways. */
export function outerRings(element: Element): Point[][] {
  if (element.type === "way") {
    const p = element.geometry;
    return p && p.length >= 4 && samePoint(p[0], p[p.length - 1]) ? [p] : [];
  }
  const pieces = (element.members ?? [])
    .filter((m) => m.type === "way" && (m.role === "outer" || m.role === "") && m.geometry?.length)
    .map((m) => [...m.geometry!]);
  const rings: Point[][] = [];
  while (pieces.length) {
    const ring = pieces.pop()!;
    while (!samePoint(ring[0], ring[ring.length - 1])) {
      const end = ring[ring.length - 1];
      const index = pieces.findIndex((p) => samePoint(p[0], end) || samePoint(p[p.length - 1], end));
      if (index === -1) break;
      const next = pieces.splice(index, 1)[0];
      if (!samePoint(next[0], end)) next.reverse();
      ring.push(...next.slice(1));
    }
    if (ring.length >= 4 && samePoint(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

type XY = [number, number];
function squaredDistance(p: XY, a: XY, b: XY) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return (p[0] - a[0] - dx * t) ** 2 + (p[1] - a[1] - dy * t) ** 2;
}

/** Iterative Douglas–Peucker avoids stack overflow on long river/park outlines. */
function simplify(points: XY[], tolerance: number): XY[] {
  if (points.length <= 3) return points;
  const keep = new Set([0, points.length - 1]);
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let max = tolerance * tolerance, index = -1;
    for (let i = start + 1; i < end; i++) {
      const distance = squaredDistance(points[i], points[start], points[end]);
      if (distance > max) { max = distance; index = i; }
    }
    if (index !== -1) {
      keep.add(index);
      stack.push([start, index], [index, end]);
    }
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i]);
}

export function project(points: Point[], closed: boolean, tolerance = 0.7): number[] {
  const mapped: XY[] = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map((p) => {
    const { x, y } = latLngToLocal(p.lat, p.lon);
    return [x, y];
  });
  let simplified = simplify(mapped, tolerance);
  if (closed && simplified.length < 4) simplified = mapped;
  const rounded = simplified.map(([x, y]): XY => [Math.round(x * 2) / 2, Math.round(y * 2) / 2])
    .filter((p, i, all) => i === 0 || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1]);
  if (closed && rounded.length > 1 && rounded[0][0] === rounded.at(-1)![0] && rounded[0][1] === rounded.at(-1)![1]) rounded.pop();
  if (rounded.length < (closed ? 3 : 2)) return [];
  if (closed) {
    let area = 0;
    rounded.forEach((p, i) => { const next = rounded[(i + 1) % rounded.length]; area += p[0] * next[1] - next[0] * p[1]; });
    if (Math.abs(area) < 2) return [];
  }
  return rounded.flat();
}

export function buildingHeight(tags: Record<string, string>, id: number): number {
  let height = Number.parseFloat(tags.height?.replace(",", ".") ?? "");
  if (/ft|feet|'/.test(tags.height ?? "")) height *= 0.3048;
  if (!(height > 0)) height = Number.parseFloat(tags["building:levels"] ?? "") * 3.2;
  if (!(height > 0)) height = 6 + seeded(id)() * 8;
  return Math.round(Math.min(350, height) * 2) / 2;
}

export function convert(elements: Element[], tolerance = 0.7): GameMapData {
  const data: GameMapData = { buildings: [], roads: [], water: [], parks: [], londonFields: [], origin: ORIGIN, source: "openstreetmap", attribution: "© OpenStreetMap contributors · ODbL", generatedAt: new Date().toISOString() };
  const represented = new Set<string>();
  const layer = (tags: Record<string, string> = {}) => tags.building && tags.building !== "no" ? "building" : tags.leisure === "park" ? "park" : tags.natural === "water" ? "water" : "other";
  for (const e of elements) {
    if (e.type === "relation" && outerRings(e).length) {
      for (const m of e.members ?? []) if (m.type === "way") represented.add(`${layer(e.tags)}:${m.ref}`);
    }
  }
  for (const element of elements) {
    if (element.type === "way" && represented.has(`${layer(element.tags)}:${element.id}`)) continue;
    const tags = element.tags ?? {};
    const polygons = outerRings(element).map((ring) => project(ring, true, tolerance)).filter((p) => p.length >= 6);
    if (tags.building && tags.building !== "no") {
      for (const polygon of polygons) data.buildings.push([buildingHeight(tags, element.id), polygon]);
    } else if (tags.highway && element.geometry) {
      const line = project(element.geometry, false, tolerance);
      if (line.length >= 4) data.roads.push([/^(trunk|primary)/.test(tags.highway) ? 12 : /^(secondary|tertiary)/.test(tags.highway) ? 8 : 4, line]);
    } else if (tags.leisure === "park") {
      for (const polygon of polygons) {
        data.parks.push(polygon);
        if (tags.name === "London Fields") data.londonFields = polygon;
      }
    } else if (tags.natural === "water") {
      for (const polygon of polygons) data.water.push([0, polygon]);
    } else if (tags.waterway && element.geometry) {
      const line = project(element.geometry, false, tolerance);
      if (line.length >= 4) data.water.push([tags.waterway === "river" ? 22 : 14, line]);
    }
  }
  return data;
}

/** Deliberately labelled illustration, only used when all live endpoints fail. */
export function proceduralFallback(): GameMapData {
  const random = seeded(10987);
  const data: GameMapData = { buildings: [], roads: [], water: [], parks: [], londonFields: [-170,-270,40,-310,190,285,-80,340], origin: ORIGIN, source: "procedural", attribution: "Procedural illustration · not surveyed geography" };
  data.parks.push(data.londonFields, [-950,1800,-450,1800,-400,2300,-1000,2200], [1700,700,2600,700,2200,2900,1700,2500]);
  data.water.push([18, [-2600,-1600,-1700,-1250,-700,-1000,150,-800,1100,-600,1800,-500,2400,-100]], [28, [2700,-1000,2400,0,2500,1000,2300,2200,2100,3500]]);
  for (let x = -2300; x <= 2200; x += 130) data.roads.push([4, [x,-1800,x + 350,3400]]);
  for (let y = -1800; y <= 3400; y += 150) data.roads.push([6, [-2300,y,2550,y + 160]]);
  for (let row = 0; row < 100; row++) for (let col = 0; col < 85; col++) {
    const y = -1800 + row * 51 + random() * 9;
    const x = -2300 + col * 56 + random() * 7 + (y + 1800) * 0.067;
    if ((x > -230 && x < 230 && y > -380 && y < 390) || (x > 1600 && y > 700) || (x > -1050 && x < -350 && y > 1750 && y < 2300)) continue;
    if ((col % 7 === 0) || row % 8 === 0) continue;
    const w = 13 + random() * 17, d = 16 + random() * 18;
    data.buildings.push([Math.round((6 + random() * 8) * 2) / 2, [x,y,x+w,y,x+w,y+d,x,y+d].map((v) => Math.round(v * 2) / 2)]);
  }
  return data;
}

async function download(): Promise<Overpass> {
  for (let round = 0; round < 2; round++) {
    for (const endpoint of ENDPOINTS) {
      console.log(`Overpass attempt ${round + 1}: ${endpoint}`);
      try {
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "OneHackney-game-map/1.0 (hackathon; OpenStreetMap attribution included)" }, body: new URLSearchParams({ data: QUERY }), signal: AbortSignal.timeout(115_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json() as Overpass;
        if (result.remark) throw new Error(result.remark);
        if (!Array.isArray(result.elements) || result.elements.length < 100) throw new Error("Empty/incomplete Hackney area result");
        return result;
      } catch (error) { console.warn(error instanceof Error ? error.message : error); }
    }
  }
  throw new Error("Every Overpass endpoint failed twice");
}

async function main() {
  let data: GameMapData;
  try {
    if (process.argv.includes("--fallback")) throw new Error("Explicit --fallback flag");
    const raw = await download();
    data = convert(raw.elements);
    if (!data.buildings.length || !data.londonFields.length || !data.water.length || !data.roads.length) throw new Error("Required map layers missing from Overpass response");
    for (const tolerance of [1, 1.5, 2, 3]) {
      if (Buffer.byteLength(JSON.stringify(data)) < 6_000_000) break;
      data = convert(raw.elements, tolerance);
    }
  } catch (error) {
    console.warn(`Using labelled procedural fallback: ${error instanceof Error ? error.message : error}`);
    data = proceduralFallback();
  }
  const json = JSON.stringify(data);
  if (Buffer.byteLength(json) >= 6_000_000) throw new Error("Map exceeds the 6 MB budget; no file overwritten");
  const path = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/game/hackney.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, json);
  console.log(JSON.stringify({ path, source: data.source, bytes: Buffer.byteLength(json), buildings: data.buildings.length, roads: data.roads.length, water: data.water.length, parks: data.parks.length, londonFieldsVertices: data.londonFields.length / 2 }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
