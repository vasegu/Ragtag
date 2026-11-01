import test from "node:test";
import assert from "node:assert/strict";
import { issues, actions, snapshot, ageBand, summarise, finance, readDecisions, decide, capacity } from "./model";

test("the default snapshot reconciles the backlog and time-based delivery", () => {
  const s = summarise("all", 30);
  assert.equal(s.open.length, 128);
  assert.equal(s.fixed.length, 94);
  assert.equal(s.arrivals, 112);
  assert.equal(s.open.filter(i => i.severity === "High").length, 12);
  assert.equal(s.open.filter(i => i.severity === "Unassessed").length, 18);
  assert.equal(s.trend.reduce((n, b) => n + b.fixed, 0), 94);
  assert.equal(s.trend.reduce((n, b) => n + b.arrivals, 0), 112);
  assert.equal(issues.length, 222);
});
test("age bins do not invent an age and include exact boundaries", () => {
  assert.equal(ageBand(null), -1);
  assert.equal(ageBand("invalid"), -1);
  assert.equal(ageBand("2026-11-02"), -1);
  assert.equal(ageBand(snapshot), 0);
  assert.equal(ageBand("2026-10-29"), 1);
  assert.equal(ageBand("2026-10-24"), 2);
  assert.equal(ageBand("2026-10-03"), 3);
});
test("period filters change flows but never the current backlog", () => {
  const week = summarise("all", 7);
  assert.equal(week.open.length, 128);
  assert.ok(week.fixed.length < 94);
  for (const area of ["Highways", "Cleansing", "Lighting"] as const) {
    const s = summarise(area, 30);
    assert.ok(s.open.every(i => i.area === area));
    assert.ok(s.fixed.every(i => i.area === area));
  }
  assert.equal(summarise("all", 30).fixed.length, 94);
});
test("approval reserves cash once, without completing a repair", () => {
  const before = finance("all", 30, {});
  assert.deepEqual([before.budget, before.spent, before.committed, before.available], [80000, 42000, 18000, 20000]);
  const decisions = decide({}, actions[0].id, "approved", "");
  assert.equal(finance("all", 30, decisions).available, 19760);
  assert.throws(() => decide(decisions, actions[0].id, "approved", ""), /already/);
  assert.equal(summarise("all", 30).open.length, 128);
});
test("defer/change require reasons; unknown actions and overspend are rejected", () => {
  assert.throws(() => decide({}, actions[0].id, "deferred", "  "), /reason/i);
  assert.throws(() => decide({}, "missing", "approved", ""), /unknown/i);
  assert.throws(() => decide({}, actions[0].id, "approved", "", 0), /funds/i);
  assert.equal(decide({}, actions[0].id, "changes", "Check permit")[actions[0].id].reason, "Check permit");
});
test("corrupt, unrecognised or malformed saved decisions are discarded", () => {
  assert.deepEqual(readDecisions("bad json"), {});
  assert.deepEqual(readDecisions('{"version":9,"decisions":{}}'), {});
  assert.deepEqual(readDecisions('{"version":1,"decisions":{"missing":{"status":"approved"}}}'), {});
  const d = decide({}, actions[0].id, "approved", "");
  assert.deepEqual(readDecisions(JSON.stringify({ version: 1, decisions: d })), d);
});
test("service finances and proposed capacity reconcile", () => {
  const parts = ["Highways", "Cleansing", "Lighting"] as const;
  assert.equal(parts.reduce((n, a) => n + finance(a, 30, {}).budget, 0), 80000);
  assert.equal(capacity("all").reduce((n, d) => n + d.covered, 0), 160);
  assert.equal(capacity("all").reduce((n, d) => n + d.required, 0), 184);
});
