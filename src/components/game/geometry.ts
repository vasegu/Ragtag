import { Color, ShapeUtils, Vector2 } from "three";
import type { GameMapData } from "./map-data";

export type MeshData = { position: Float32Array; normal: Float32Array; color: Float32Array };
/** `detail` per vertex: metres along the wall, wall length (0 on roofs), building height. */
export type BuildingData = MeshData & { detail: Float32Array };
// Flat layers are spaced a few units apart (ground < parks < roads < water < London Fields)
// so they don't z-fight when the camera is far away.
export type SceneGeometry = {
  buildings: BuildingData;
  outlines: Float32Array;
  /** Five floats per tree: x, three.js z, canopy scale, tint (0–1), park (0 or 1). */
  trees: Float32Array;
  roads: MeshData;
  water: MeshData;
  parks: MeshData;
  fields: MeshData;
  fieldBorder: Float32Array;
};
type Builder = { position: number[]; normal: number[]; color: number[]; detail?: number[] };
const builder = (): Builder => ({ position: [], normal: [], color: [] });
const finish = (b: Builder): MeshData => ({ position: new Float32Array(b.position), normal: new Float32Array(b.normal), color: new Float32Array(b.color) });
const hex = (colors: string[]) => colors.map((c) => new Color(c));
// London terraces: red brick, yellow London stock, painted stucco; taller blocks in concrete.
const WALLS = {
  red: hex(["#a4513a", "#9a4632", "#b0603f", "#8f4230"]),
  stock: hex(["#c9a46a", "#b99359", "#d2b47e"]),
  stucco: hex(["#ebe2d2", "#e0d5c1", "#d9d3c8"]),
  concrete: hex(["#b8b2a7", "#a9a49b", "#c4b9a6"]),
};
const ROOFS = hex(["#474e58", "#3e4550", "#4f555e", "#564b47"]);
const FLAT_ROOF = new Color("#6c6f75");

/** Deterministic 0–1 hash of two numbers, stable across runs and machines. */
export function hash2(x: number, y: number) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function buildingColours(flat: number[], height: number) {
  const x = flat[0], y = flat[1];
  // Neighbouring houses share a street's brick, with the odd painted or rebuilt house.
  const street = hash2(Math.floor(x / 70), Math.floor(y / 70));
  const own = hash2(x, y);
  const pick = own < 0.22 ? hash2(y, x) : street;
  const family = height > 24 ? (pick < 0.55 ? WALLS.concrete : pick < 0.8 ? WALLS.stock : WALLS.red)
    : pick < 0.5 ? WALLS.red : pick < 0.82 ? WALLS.stock : WALLS.stucco;
  const wall = family[Math.floor(hash2(own, x) * family.length)].clone().multiplyScalar(0.92 + own * 0.14);
  const roof = height > 24 ? FLAT_ROOF : ROOFS[Math.floor(street * ROOFS.length)];
  return { wall, roof };
}

function vertex(b: Builder, x: number, h: number, y: number, nx: number, nh: number, ny: number, c: Color, along = 0, length = 0, height = 0) {
  b.detail?.push(along, length, height);
  b.position.push(x, h, -y);
  b.normal.push(nx, nh, ny);
  b.color.push(c.r, c.g, c.b);
}

function polygon(flat: number[]) {
  const points: Vector2[] = [];
  for (let i = 0; i < flat.length; i += 2) points.push(new Vector2(flat[i], flat[i + 1]));
  if (ShapeUtils.isClockWise(points)) points.reverse();
  return points;
}

function surface(b: Builder, flat: number[], height: number, color: Color) {
  const points = polygon(flat);
  for (const face of ShapeUtils.triangulateShape(points, [])) {
    for (const index of face) vertex(b, points[index].x, height, points[index].y, 0, 1, 0, color);
  }
}

function ribbon(b: Builder, flat: number[], width: number, height: number, color: Color) {
  for (let i = 0; i < flat.length - 2; i += 2) {
    const dx = flat[i + 2] - flat[i], dy = flat[i + 3] - flat[i + 1];
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    const ox = dy / length * width / 2, oy = -dx / length * width / 2;
    const a = [flat[i] + ox, flat[i + 1] + oy];
    const b2 = [flat[i + 2] + ox, flat[i + 3] + oy];
    const c = [flat[i + 2] - ox, flat[i + 3] - oy];
    const d = [flat[i] - ox, flat[i + 1] - oy];
    for (const p of [a, b2, c, a, c, d]) vertex(b, p[0], height, p[1], 0, 1, 0, color);
  }
}

function insidePolygon(x: number, y: number, flat: number[]) {
  let inside = false;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const xi = flat[i], yi = flat[i + 1], xj = flat[j], yj = flat[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const CELL = 40;
/** Buckets building footprints by bounding box so tree placement can skip roofs cheaply. */
function footprintIndex(data: GameMapData) {
  const cells = new Map<string, number[]>();
  data.buildings.forEach(([, flat], index) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < flat.length; i += 2) {
      minX = Math.min(minX, flat[i]); maxX = Math.max(maxX, flat[i]);
      minY = Math.min(minY, flat[i + 1]); maxY = Math.max(maxY, flat[i + 1]);
    }
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
      for (let cy = Math.floor(minY / CELL); cy <= Math.floor(maxY / CELL); cy++) {
        const key = `${cx},${cy}`;
        const list = cells.get(key);
        if (list) list.push(index); else cells.set(key, [index]);
      }
    }
  });
  return (x: number, y: number, margin: number) => {
    for (const dx of [-margin, margin]) for (const dy of [-margin, margin]) {
      const list = cells.get(`${Math.floor((x + dx) / CELL)},${Math.floor((y + dy) / CELL)}`);
      if (list?.some((i) => insidePolygon(x + dx, y + dy, data.buildings[i][1]))) return true;
    }
    return false;
  };
}

/** London planes along streets (alternating kerbs) and scattered through parks. */
function plantTrees(data: GameMapData) {
  const blocked = footprintIndex(data);
  const taken = new Set<string>();
  const trees: number[] = [];
  const plant = (x: number, y: number, scale: number, park: number) => {
    const key = `${Math.round(x / 9)},${Math.round(y / 9)}`;
    if (taken.has(key) || blocked(x, y, 2.5)) return;
    taken.add(key);
    trees.push(x, -y, scale, hash2(y, x), park);
  };
  for (const [width, line] of data.roads) {
    const spacing = width >= 12 ? 22 : 26, offset = width / 2 + 3.5;
    let carry = hash2(line[0], line[1]) * spacing, side = 1;
    for (let i = 0; i < line.length - 2; i += 2) {
      const dx = line[i + 2] - line[i], dy = line[i + 3] - line[i + 1];
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      for (let t = carry; t < length; t += spacing) {
        const x = line[i] + dx * t / length, y = line[i + 1] + dy * t / length;
        side = -side;
        if (hash2(x, y) < 0.18) continue;
        plant(x + dy / length * offset * side, y - dx / length * offset * side, 0.8 + hash2(x + 1, y) * 0.4, 0);
      }
      carry = (carry - length) % spacing;
      if (carry < 0) carry += spacing;
    }
  }
  for (const park of data.parks) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < park.length; i += 2) {
      minX = Math.min(minX, park[i]); maxX = Math.max(maxX, park[i]);
      minY = Math.min(minY, park[i + 1]); maxY = Math.max(maxY, park[i + 1]);
    }
    const step = 20;
    for (let gx = Math.ceil(minX / step) * step; gx < maxX; gx += step) {
      for (let gy = Math.ceil(minY / step) * step; gy < maxY; gy += step) {
        if (hash2(gx, gy) > 0.45) continue;
        const x = gx + (hash2(gy, gx) - 0.5) * step * 0.8, y = gy + (hash2(gx + 7, gy) - 0.5) * step * 0.8;
        if (insidePolygon(x, y, park)) plant(x, y, 1 + hash2(x, y + 3) * 0.6, 1);
      }
    }
  }
  return new Float32Array(trees);
}

export function buildSceneGeometry(data: GameMapData): SceneGeometry {
  const buildings: Builder = { ...builder(), detail: [] }, roads = builder(), water = builder(), parks = builder(), fields = builder();
  const outlines: number[] = [], fieldBorder: number[] = [];
  data.buildings.forEach(([height, flat]) => {
    const points = polygon(flat);
    // A restrained height exaggeration makes terraces readable at neighbourhood scale.
    const h = height * 1.65;
    const { wall, roof } = buildingColours(flat, height);
    for (const face of ShapeUtils.triangulateShape(points, [])) {
      for (const i of face) vertex(buildings, points[i].x, h, points[i].y, 0, 1, 0, roof, 0, 0, h);
    }
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length];
      const length = a.distanceTo(b);
      if (length === 0) return;
      const nx = (b.y - a.y) / length, nz = (b.x - a.x) / length;
      for (const [p, altitude, along] of [[a,h,0],[a,0,0],[b,0,length],[a,h,0],[b,0,length],[b,h,length]] as const) vertex(buildings, p.x, altitude, p.y, nx, 0, nz, wall, along, length, h);
      // Roof edges only: vertical corner lines made the blocks read as hard wireframes.
      outlines.push(a.x,h+0.12,-a.y,b.x,h+0.12,-b.y);
    });
  });
  // Roads and parks are white here and tinted per theme by their materials.
  const roadColor = new Color("#ffffff");
  for (const [width, line] of data.roads) ribbon(roads, line, width, 2.6, roadColor);
  const waterColor = new Color("#0b5661");
  for (const [width, coordinates] of data.water) {
    if (width === 0) surface(water, coordinates, 3.6, waterColor);
    else ribbon(water, coordinates, width, 3.6, waterColor);
  }
  for (const park of data.parks) surface(parks, park, 1.4, new Color("#ffffff"));
  if (data.londonFields.length >= 6) {
    surface(fields, data.londonFields, 4.4, new Color("#00664f"));
    const p = data.londonFields;
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      fieldBorder.push(p[i],5.2,-p[i+1],p[j],5.2,-p[j+1]);
    }
  }
  return { buildings: { ...finish(buildings), detail: new Float32Array(buildings.detail!) }, trees: plantTrees(data), outlines: new Float32Array(outlines), roads: finish(roads), water: finish(water), parks: finish(parks), fields: finish(fields), fieldBorder: new Float32Array(fieldBorder) };
}
