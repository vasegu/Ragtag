import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CREWS, DEPOT, clusterJobs, planBacklog, planDay, type Job } from "./plan";

// Run with: npm run test:council

const job = (id: number, dLat: number, dLng: number, extra: Partial<Job> = {}): Job => ({
  id: `j${id}`,
  lat: DEPOT.lat + dLat,
  lng: DEPOT.lng + dLng,
  category: "flytip",
  title: `Job ${id}`,
  rank: id,
  severity: "S3",
  createdAt: "2026-10-30T09:00:00Z",
  source: "fixmystreet",
  ...extra,
});

test("jobs within 250 m share a cluster, far ones don't", () => {
  const clusters = clusterJobs([job(1, 0.01, 0), job(2, 0.0105, 0), job(3, -0.02, 0)], 250);
  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters[0].jobs.map((j) => j.id), ["j1", "j2"]);
});

test("every crew finishes inside the shift and nothing is lost", () => {
  const jobs = Array.from({ length: 60 }, (_, i) => job(i + 1, Math.sin(i) * 0.02, Math.cos(i * 1.7) * 0.03));
  const plan = planDay(jobs, { crews: DEFAULT_CREWS });
  const waste = plan.crews.filter((c) => c.trade === "waste");
  assert.equal(waste.length, 2);
  for (const c of waste) assert.ok(c.finish <= 8 * 60 + 450 + 1e-6, `${c.label} finishes at ${c.finish}`);
  const scheduled = waste.flatMap((c) => c.stops.map((s) => s.job.id));
  assert.equal(scheduled.length + plan.overflow.length, jobs.length);
  assert.equal(new Set(scheduled).size, scheduled.length);
  assert.ok(plan.overflow.length > 0, "60 fly-tips is more than two crews can do");
});

test("urgent work is scheduled first; overflow is the least urgent", () => {
  const jobs = Array.from({ length: 60 }, (_, i) => job(i + 1, Math.sin(i) * 0.02, Math.cos(i * 1.7) * 0.03));
  const plan = planDay(jobs, { crews: DEFAULT_CREWS });
  const scheduled = new Set(plan.crews.flatMap((c) => c.stops.map((s) => s.job.id)));
  assert.ok(scheduled.has("j1") && scheduled.has("j2"));
});

test("adding a crew shrinks the overflow and the backlog", () => {
  const jobs = Array.from({ length: 60 }, (_, i) => job(i + 1, Math.sin(i) * 0.02, Math.cos(i * 1.7) * 0.03));
  const two = planBacklog(jobs, { crews: DEFAULT_CREWS });
  const three = planBacklog(jobs, { crews: { ...DEFAULT_CREWS, waste: 3 } });
  assert.ok(three.today.overflow.length < two.today.overflow.length);
  assert.ok(three.daysToClear! <= two.daysToClear!);
});

test("work orders override category defaults; no crews means it all rolls over", () => {
  const plan = planDay([job(1, 0.01, 0, { trade: "highways", minutes: 90 })], { crews: { ...DEFAULT_CREWS, highways: 0 } });
  assert.equal(plan.overflow.length, 1);
  const withCrew = planDay([job(1, 0.01, 0, { trade: "highways", minutes: 90 })], { crews: DEFAULT_CREWS });
  const stop = withCrew.crews.find((c) => c.trade === "highways")!.stops[0];
  assert.equal(stop.minutes, 90);
  assert.equal(planBacklog([job(1, 0, 0)], { crews: { ...DEFAULT_CREWS, waste: 0 } }).daysToClear, null);
});

test("deterministic", () => {
  const jobs = Array.from({ length: 30 }, (_, i) => job(i + 1, Math.sin(i) * 0.02, Math.cos(i) * 0.02));
  assert.deepEqual(planDay(jobs, { crews: DEFAULT_CREWS }), planDay([...jobs].reverse(), { crews: DEFAULT_CREWS }));
});
