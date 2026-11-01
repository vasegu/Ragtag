import test from "node:test";
import assert from "node:assert/strict";
import { fromReport, fromWorkOrder, type RepairIssue } from "./repairs";
import { generateSchedule, defaultScenario, defaultPlanning, scenarioSchema, type Scenario } from "./scheduler";

const issue = (id: number): RepairIssue => fromReport({ id, title: `Issue ${id}`, created_at: "2026-10-01", address: "Mare Street" }, "https://test.supabase.co");
test("unknown severity produces inspection, never an invented permanent repair", () => {
  const result = generateSchedule([issue(1)], {}, defaultScenario, "2026-11-02");
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].action, "Inspect");
  assert.equal(result.assignments[0].date, "2026-11-02");
});
test("closed and already-started work cannot be newly assigned", () => {
  const result = generateSchedule([{ ...issue(1), status: "Closed" }, { ...issue(2), status: "In progress" }], {}, defaultScenario, "2026-11-02");
  assert.equal(result.assignments.length, 0);
  assert.equal(result.blockers.length, 1);
  assert.match(result.blockers[0].reason, /remaining work/i);
});
test("priority, qualified people and shared equipment constrain assignments", () => {
  const a = issue(1), b = issue(2);
  const p = { ...defaultPlanning(a, defaultScenario), priority: "High" as const, reason: "Inspected", equipment: [{ name: "Camera", quantity: 1 }], minutes: 90 };
  const scenario: Scenario = { ...defaultScenario, crews: [{ id: "inspect", name: "Inspectors", trade: "inspection", count: 2, people: 1 }], equipment: [{ name: "Camera", quantity: 1 }] };
  const r = generateSchedule([b, a], { [a.id]: p, [b.id]: { ...p, priority: "Routine" } }, scenario, "2026-11-02");
  assert.equal(r.assignments[0].issueId, a.id);
  assert.ok(r.assignments[1].start >= r.assignments[0].end);
});
test("materials, cash, crew size and missing resource types produce explicit blockers", () => {
  const a = issue(1), p = { ...defaultPlanning(a, defaultScenario), action: "Repair" as const, priority: "High" as const, reason: "Inspected and measured", recommendation: "Replace broken slabs", scopeReady: true, trade: "highways" as const, crewSize: 4, minutes: 120, materials: [{ name: "Slabs", quantity: 3 }] };
  let r = generateSchedule([a], { [a.id]: p }, defaultScenario, "2026-11-02");
  assert.match(r.blockers[0].reason, /crew|qualified|people/i);
  r = generateSchedule([a], { [a.id]: { ...p, crewSize: 1 } }, defaultScenario, "2026-11-02");
  assert.match(r.blockers[0].reason, /Slabs/);
  r = generateSchedule([a], {}, { ...defaultScenario, budget: 0 }, "2026-11-02");
  assert.match(r.blockers[0].reason, /budget/i);
});
test("no overlapping crew allocations, breaks/weekends respected, missed targets flagged", () => {
  const jobs = Array.from({ length: 30 }, (_, i) => issue(i));
  const plans = Object.fromEntries(jobs.map(i => [i.id, { ...defaultPlanning(i, defaultScenario), minutes: 90, dueAt: "2026-11-02T08:01", policyUrl: "https://hackney.gov.uk/roads", deadlineAction: "Inspect" as const }]));
  const r = generateSchedule(jobs, plans, defaultScenario, "2026-11-01");
  assert.ok(r.assignments.length > 0);
  for (const a of r.assignments) {
    assert.ok(![0, 6].includes(new Date(a.date).getUTCDay()));
    assert.ok(a.end <= defaultScenario.end && a.start >= defaultScenario.start);
    assert.ok(a.end <= 720 || a.start >= 750);
    assert.equal(a.missesTarget, true);
    for (const b of r.assignments) if (a !== b && a.crewId === b.crewId && a.date === b.date) assert.ok(a.end <= b.start || b.end <= a.start);
  }
  assert.deepEqual(r, generateSchedule([...jobs].reverse(), plans, defaultScenario, "2026-11-01"));
});
test("resource scenario rejects invalid capacity instead of treating it as unlimited", () => {
  assert.equal(scenarioSchema.safeParse({ ...defaultScenario, budget: -1 }).success, false);
  assert.equal(scenarioSchema.safeParse({ ...defaultScenario, crews: [{ ...defaultScenario.crews[0], count: 100000 }] }).success, false);
});
test("existing public work-order bookings are not assigned again", () => {
  const job = fromWorkOrder({ problem_id: "booked", status: "scheduled", address: "Mare Street" });
  const r = generateSchedule([job], {}, defaultScenario, "2026-11-02");
  assert.equal(r.assignments.length, 0);
  assert.match(r.blockers[0].reason, /booking|scheduled/i);
});
test("unscheduled work with an expired policy target is counted as missed", () => {
  const i = issue(55);
  const r = generateSchedule([i], { [i.id]: { ...defaultPlanning(i, defaultScenario), dueAt: "2026-11-01T10:00", policyUrl: "https://hackney.gov.uk/roads" } }, { ...defaultScenario, budget: 0 }, "2026-11-02");
  assert.equal(r.blockers[0].targetAtRisk, true);
});
test("confirmed repair scope uses its trade and consumables cannot be reused", () => {
  const a = issue(1), b = issue(2);
  const p = { ...defaultPlanning(a, defaultScenario), action: "Repair" as const, priority: "High" as const, reason: "Synthetic inspection findings", scopeReady: true, trade: "highways" as const, recommendation: "Replace paving", crewSize: 2, minutes: 90, materials: [{ name: "Slabs", quantity: 3 }], equipment: [{ name: "Van", quantity: 1 }] };
  const r = generateSchedule([a, b], { [a.id]: p, [b.id]: p }, { ...defaultScenario, materials: [{ name: "Slabs", quantity: 3 }], equipment: [{ name: "Van", quantity: 1 }] }, "2026-11-02");
  assert.equal(r.assignments.length, 1);
  assert.equal(r.assignments[0].action, "Repair");
  assert.equal(r.assignments[0].crewId, "highways-1");
  assert.equal(r.materialsUsed[0].quantity, 3);
  assert.match(r.blockers[0].reason, /material stock/);
});
test("public work orders need provenance review before they create another visit", () => {
  const job = fromWorkOrder({ problem_id: "unverified", status: "unscheduled", address: "Mare Street" });
  const r = generateSchedule([job], {}, defaultScenario, "2026-11-02");
  assert.equal(r.assignments.length, 0);
  assert.match(r.blockers[0].reason, /provenance/i);
});
