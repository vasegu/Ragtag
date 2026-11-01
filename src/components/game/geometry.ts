import { Color, ShapeUtils, Vector2 } from "three";
import type { GameMapData } from "./map-data";

export type MeshData = { position: Float32Array; normal: Float32Array; color: Float32Array };
// Flat layers are spaced a few units apart (ground < parks < roads < water < London Fields)
// so they don't z-fight when the camera is far away.
export type SceneGeometry = {
  buildings: MeshData;
  outlines: Float32Array;
  roads: MeshData;
  water: MeshData;
  parks: MeshData;
  fields: MeshData;
  fieldBorder: Float32Array;
};
type Builder = { position: number[]; normal: number[]; color: number[] };
const builder = (): Builder => ({ position: [], normal: [], color: [] });
const finish = (b: Builder): MeshData => ({ position: new Float32Array(b.position), normal: new Float32Array(b.normal), color: new Float32Array(b.color) });
const palette = ["#536480", "#485571", "#66738f", "#4d526f", "#596278", "#6d6985"].map((c) => new Color(c));

function vertex(b: Builder, x: number, h: number, y: number, nx: number, nh: number, ny: number, c: Color) {
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

export function buildSceneGeometry(data: GameMapData): SceneGeometry {
  const buildings = builder(), roads = builder(), water = builder(), parks = builder(), fields = builder();
  const outlines: number[] = [], fieldBorder: number[] = [];
  data.buildings.forEach(([height, flat], index) => {
    const points = polygon(flat);
    // A restrained height exaggeration makes terraces readable at neighbourhood scale.
    const h = height * 1.65;
    const color = palette[index % palette.length];
    for (const face of ShapeUtils.triangulateShape(points, [])) {
      for (const i of face) vertex(buildings, points[i].x, h, points[i].y, 0, 1, 0, color);
    }
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length];
      const length = a.distanceTo(b);
      if (length === 0) return;
      const nx = (b.y - a.y) / length, nz = (b.x - a.x) / length;
      for (const [p, altitude] of [[a,h],[a,0],[b,0],[a,h],[b,0],[b,h]] as const) vertex(buildings, p.x, altitude, p.y, nx, 0, nz, color);
      outlines.push(a.x,h+0.12,-a.y,b.x,h+0.12,-b.y,a.x,0,-a.y,a.x,h,-a.y);
    });
  });
  const roadColor = new Color("#2d535e");
  for (const [width, line] of data.roads) ribbon(roads, line, width, 2.6, roadColor);
  const waterColor = new Color("#0b5661");
  for (const [width, coordinates] of data.water) {
    if (width === 0) surface(water, coordinates, 3.6, waterColor);
    else ribbon(water, coordinates, width, 3.6, waterColor);
  }
  for (const park of data.parks) surface(parks, park, 1.4, new Color("#00664f"));
  if (data.londonFields.length >= 6) {
    surface(fields, data.londonFields, 4.4, new Color("#00664f"));
    const p = data.londonFields;
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      fieldBorder.push(p[i],5.2,-p[i+1],p[j],5.2,-p[j+1]);
    }
  }
  return { buildings: finish(buildings), outlines: new Float32Array(outlines), roads: finish(roads), water: finish(water), parks: finish(parks), fields: finish(fields), fieldBorder: new Float32Array(fieldBorder) };
}
