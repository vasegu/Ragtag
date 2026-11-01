import test from "node:test";
import assert from "node:assert/strict";
import { fromReport, fromWorkOrder, sourceStatus, rankIssues, planningSchema, planningTime } from "./repairs";

test("source statuses distinguish reported investigation from actual work", () => {
  assert.equal(sourceStatus("investigating", false), "Open");
  assert.equal(sourceStatus("scheduled", false), "Open");
  assert.equal(sourceStatus("in progress", false), "In progress");
  assert.equal(sourceStatus("fixed - council", false), "Closed");
  assert.equal(sourceStatus("confirmed", true), "Closed");
  assert.equal(sourceStatus("unfixed", false), "Open");
  assert.equal(sourceStatus("not fixed", false), "Open");
});
test("public report adapter preserves missing original dates and all evidence fields", () => {
  const i = fromReport({ id: 42, title: "Broken lamp", detail: "Lamp is out", address: "Mare Street", category: "Street Lighting", state: "confirmed", last_update: "2026-11-01", lat: 51.5, lon: -.05, report_photos: [{ storage_path: "42/1.jpg" }] }, "https://test.supabase.co");
  assert.equal(i.raisedAt, null);
  assert.equal(i.priority, "Unassessed");
  assert.equal(i.description, "Lamp is out");
  assert.equal(i.photos[0], "https://test.supabase.co/storage/v1/object/public/images/42/1.jpg");
  assert.equal(i.deadline, null);
  assert.equal(i.recommendation, null);
});
test("public work orders do not claim private evidence or initial report timestamps", () => {
  const i = fromWorkOrder({ problem_id: "abc", category: "Blocked gully", created_at: "2026-11-01", status: "dispatched", trade: "highways", crew_size: 3, minutes_max: 90, materials: ["Drainage pipe"], equipment: ["Jetting unit"] });
  assert.equal(i.status, "In progress");
  assert.equal(i.raisedAt, null);
  assert.deepEqual(i.photos, []);
  assert.equal(i.workOrder?.crewSize, 3);
});
test("priority ranking uses assessed urgency, policy target, age and stable id, closed last", () => {
  const base = fromReport({ id: 1, title: "A", created_at: "2026-10-01" }, "https://test.supabase.co");
  const high = { ...base, id: "high", priority: "High" as const };
  const unknown = { ...base, id: "unknown" };
  const emergency = { ...base, id: "emergency", priority: "Emergency" as const };
  const closed = { ...emergency, id: "closed", status: "Closed" as const };
  assert.deepEqual(rankIssues([unknown, high, closed, emergency]).map(i => i.id), ["emergency", "high", "unknown", "closed"]);
});
test("planning input rejects unsupported policy targets and nonfinite requirements", () => {
  const p = { priority: "High", reason: "Inspection recorded", action: "Repair", trade: "highways", minutes: 90, crewSize: 2, cost: 100, materials: [], equipment: [], scopeReady: true, recommendation: "Replace broken paving", dueAt: "2026-11-03T12:00", policyUrl: "javascript:alert(1)", deadlineAction: "Repair" };
  assert.equal(planningSchema.safeParse(p).success, false);
  assert.equal(planningSchema.safeParse({ ...p, policyUrl: "https://hackney.gov.uk/roads" }).success, true);
  assert.equal(planningSchema.safeParse({ ...p, policyUrl: "https://hackney.gov.uk/roads", minutes: NaN }).success, false);
  assert.equal(planningSchema.safeParse({ ...p, policyUrl: "https://hackney.gov.uk/roads", trade: "inspection" }).success, false);
});
test("planning dates use London time in winter and summer and reject invalid wall times", () => {
  assert.equal(planningTime("2026-11-02T09:00"), Date.parse("2026-11-02T09:00Z"));
  assert.equal(planningTime("2026-07-01T09:00"), Date.parse("2026-07-01T08:00Z"));
  assert.ok(Number.isNaN(planningTime("2026-02-30T09:00")));
  assert.ok(Number.isNaN(planningTime("2026-03-29T01:30")));
});
