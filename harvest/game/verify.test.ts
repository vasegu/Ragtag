import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { buildingHeight, convert, outerRings, proceduralFallback, project } from "./buildings";
import { latLngToLocal, localToLatLng, ORIGIN } from "../../src/components/game/map-data";
import { buildSceneGeometry } from "../../src/components/game/geometry";
import { sampleReports } from "../../src/components/game/sample-reports";
import type { GameMapData } from "../../src/components/game/map-data";

test("projection round-trips street locations with east/north orientation", () => {
  assert.deepEqual(latLngToLocal(ORIGIN.lat, ORIGIN.lng), { x: 0, y: 0 });
  const point = latLngToLocal(51.55, -0.05);
  assert.ok(point.x > 0 && point.y > 0);
  const restored = localToLatLng(point.x, point.y);
  assert.ok(Math.abs(restored.lat - 51.55) < 1e-10);
  assert.ok(Math.abs(restored.lng + 0.05) < 1e-10);
});

test("heights use explicit metres or feet before levels, then deterministic 6–14m", () => {
  assert.equal(buildingHeight({ height: "12 m", "building:levels": "8" }, 1), 12);
  assert.equal(buildingHeight({ height: "30 ft" }, 1), 9);
  assert.equal(buildingHeight({ "building:levels": "5" }, 1), 16);
  assert.equal(buildingHeight({}, 998), buildingHeight({}, 998));
  for (let id = 0; id < 100; id++) assert.ok(buildingHeight({}, id) >= 6 && buildingHeight({}, id) <= 14);
});

test("multipart relations stitch reversed ways and suppress duplicate member footprints", () => {
  const a = { lat: 51.542, lon: -0.061 }, b = { lat: 51.542, lon: -0.0608 }, c = { lat: 51.5422, lon: -0.0608 }, d = { lat: 51.5422, lon: -0.061 };
  const relation = { type: "relation", id: 9, tags: { building: "yes" }, members: [
    { type: "way", ref: 1, role: "outer", geometry: [a, b] },
    { type: "way", ref: 2, role: "outer", geometry: [d, c, b] },
    { type: "way", ref: 3, role: "outer", geometry: [d, a] },
  ] };
  assert.equal(outerRings(relation).length, 1);
  assert.equal(convert([relation, { type: "way", id: 1, tags: { building: "yes" }, geometry: [a,b,c,d,a] }]).buildings.length, 1);
  const coordinates = project([a, b, c, d, a], true);
  assert.equal(coordinates.length, 8);
  coordinates.forEach((n) => assert.equal(n * 2, Math.round(n * 2)));
});

test("procedural fallback is deterministic, compact and includes every layer", () => {
  const data = proceduralFallback();
  assert.deepEqual(data, proceduralFallback());
  assert.equal(data.source, "procedural");
  assert.ok(Buffer.byteLength(JSON.stringify(data)) < 6_000_000);
  for (const layer of [data.buildings, data.roads, data.water, data.parks, data.londonFields]) assert.ok(layer.length > 0);
});

test("batched building triangles have finite attributes and upward roof winding", () => {
  const data = proceduralFallback();
  data.buildings = [[10, [0,0,20,0,20,20,0,20]], [8, [30,0,30,10,40,10,40,0]]];
  const built = buildSceneGeometry(data);
  const { position, normal, color } = built.buildings;
  assert.equal(position.length, normal.length);
  assert.equal(position.length, color.length);
  assert.ok(position.length > 0);
  for (const n of position) assert.ok(Number.isFinite(n));
  for (let i = 0; i < position.length; i += 9) {
    if (normal[i + 1] !== 1) continue;
    const ax = position[i+3]-position[i], az = position[i+5]-position[i+2];
    const bx = position[i+6]-position[i], bz = position[i+8]-position[i+2];
    assert.ok(az * bx - ax * bz > 0, "roof must face upward");
  }
});

test("40 deterministic reports sit on streets and cover the borough", () => {
  const data = JSON.parse(readFileSync(new URL("../../public/game/hackney.json", import.meta.url), "utf8")) as GameMapData;
  const reports = sampleReports(data);
  assert.equal(reports.length, 40);
  assert.deepEqual(reports, sampleReports(data));
  const local = reports.map((r) => latLngToLocal(r.lat, r.lng));
  for (const point of local) {
    assert.ok(data.roads.some(([, coordinates]) => {
      for (let i = 0; i < coordinates.length - 2; i += 2) {
        if (Math.hypot(point.x - (coordinates[i] + coordinates[i+2]) / 2, point.y - (coordinates[i+1] + coordinates[i+3]) / 2) < 1e-5) return true;
      }
      return false;
    }), "report must lie on an actual street segment");
  }
  assert.ok(Math.max(...local.map((p) => p.x)) - Math.min(...local.map((p) => p.x)) > 2000);
  assert.ok(Math.max(...local.map((p) => p.y)) - Math.min(...local.map((p) => p.y)) > 3000);
});

test("downloaded map is complete, finite, half-metre quantised and under 6 MB", () => {
  const json = readFileSync(new URL("../../public/game/hackney.json", import.meta.url), "utf8");
  const data = JSON.parse(json) as GameMapData;
  assert.ok(Buffer.byteLength(json) < 6_000_000);
  assert.ok(data.buildings.length > 1000);
  assert.ok(data.roads.length && data.water.length && data.parks.length && data.londonFields.length);
  for (const coordinates of [...data.buildings.map(([, p]) => p), ...data.roads.map(([, p]) => p), ...data.water.map(([, p]) => p), ...data.parks, data.londonFields]) {
    assert.equal(coordinates.length % 2, 0);
    for (const n of coordinates) { assert.ok(Number.isFinite(n)); assert.equal(n * 2, Math.round(n * 2)); }
  }
});

test("trees are deterministic, finite and planted on the real map", () => {
  const data = JSON.parse(readFileSync(new URL("../../public/game/hackney.json", import.meta.url), "utf8")) as GameMapData;
  const { trees, buildings } = buildSceneGeometry(data);
  assert.equal(trees.length % 5, 0);
  assert.ok(trees.length / 5 > 2000, "expected thousands of street and park trees");
  assert.deepEqual(trees, buildSceneGeometry(data).trees);
  for (const n of trees) assert.ok(Number.isFinite(n));
  assert.equal(buildings.detail.length, buildings.position.length);
});
