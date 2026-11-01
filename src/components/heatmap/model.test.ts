import assert from "node:assert/strict";
import { test } from "node:test";
import type { Report } from "@/lib/report/types";
import { heatPoints, STRATEGIES } from "./model";

const now = new Date("2026-11-01T12:00:00Z");
const rep = (id: string, over: Partial<Report> = {}): Report => ({
  id, lat: 51.5400, lng: -0.0700, category: "pothole", status: "open", title: id,
  created_at: "2026-10-31T09:00:00Z", source: "fixmystreet", confirmations: 0, ...over,
});

test("severe, repeated, recent cell beats a lone old litter report", () => {
  const hot = [rep("a"), rep("b", { created_at: "2026-10-28T09:00:00Z" }), rep("c", { created_at: "2026-10-25T09:00:00Z" })];
  const cold = [rep("x", { lat: 51.56, lng: -0.03, category: "litter", created_at: "2026-09-01T09:00:00Z" })];
  const pts = heatPoints([...hot, ...cold], { now, minIntensity: 0 });
  assert.equal(pts.length, 2);
  assert.ok(pts[0].intensity > pts[1].intensity);
  assert.ok(pts[0].opacity > pts[1].opacity && pts[0].opacity <= 0.7);
});

test("same-day duplicates count one active day; spread and entropy widen the radius", () => {
  const same = [rep("a"), rep("b", { created_at: "2026-10-31T18:00:00Z" })];
  const [tight] = heatPoints(same, { now, minIntensity: 0 });
  assert.equal(tight.stats.activeDays, 1);
  const mixed = [rep("a"), rep("b", { category: "litter", lat: 51.5403, lng: -0.0703 })];
  const [wide] = heatPoints(mixed, { now, minIntensity: 0 });
  assert.ok(wide.stats.entropy > 0.99 && wide.radiusM > tight.radiusM);
});

test("a report after a fix counts as a recurrence", () => {
  const rs = [rep("a", { status: "fixed", created_at: "2026-10-20T09:00:00Z" }), rep("b", { created_at: "2026-10-30T09:00:00Z" })];
  const [p] = heatPoints(rs, { now, strategy: "recurrence", minIntensity: 0 });
  assert.equal(p.stats.recurrences, 1);
});

test("every strategy returns 0-1 and honours minIntensity", () => {
  for (const strategy of STRATEGIES) {
    for (const p of heatPoints([rep("a")], { now, strategy, minIntensity: 0 })) assert.ok(p.intensity >= 0 && p.intensity <= 1);
  }
  assert.equal(heatPoints([rep("a")], { now, strategy: "volume", minIntensity: 0.99 }).length, 0);
});
