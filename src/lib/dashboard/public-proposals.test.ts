import test from "node:test";
import assert from "node:assert/strict";
import { fromReport } from "./repairs";
import { withPublishedProposal, readAllRows, publishedProposals } from "./public-proposals.server";

test("public proposal uses policy band rather than an unsupported numeric rating and never leaks private fields", () => {
  const issue = fromReport({ id: 42, title: "Public issue" }, "https://example.supabase.co");
  const raw = { outcome: "review", policyLevel: "U · unassessed", reason: "Missing measurements", severity: 5, workOrder: null, residentDescription: "private text", photoUrls: ["private signed URL"] };
  const result = withPublishedProposal(issue, raw, "backtest");
  assert.equal(result.priority, "Unassessed");
  assert.equal(result.proposal?.rating, 5);
  assert.ok(!JSON.stringify(result).includes("private text"));
  assert.ok(!JSON.stringify(result).includes("private signed URL"));
  assert.equal(withPublishedProposal(issue, { ...raw, policyLevel: "S1", severity: 4 }, "backtest").priority, "High");
  assert.equal(withPublishedProposal(issue, { ...raw, policyLevel: "S0 · provisional" }, "backtest").priority, "Emergency");
  assert.equal(withPublishedProposal(issue, { ...raw, policyLevel: "S0 · provisional", workOrder: { invalid: true } }, "backtest").priority, "Emergency");
  assert.deepEqual(withPublishedProposal(issue, { corrupted: true }, "backtest"), issue);
});
test("commitment lookup follows server page caps without dropping older rows", async () => {
  const rows = [1, 2, 3, 4, 5];
  assert.deepEqual(await readAllRows(async offset => ({ data: rows.slice(offset, offset + 2), count: 5, error: null })), rows);
});
test("incomplete or changing commitment snapshots fail closed", async () => {
  await assert.rejects(readAllRows(async () => ({ data: [], count: 5, error: null })), /Incomplete/);
  await assert.rejects(readAllRows(async offset => ({ data: [1], count: offset ? 3 : 2, error: null })), /verified/);
  await assert.rejects(readAllRows(async () => ({ data: null, count: null, error: new Error("unavailable") })), /verified/);
});
test("missing proposal connection keeps commitment protection instead of making reports eligible", async () => {
  const prior = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    const issue = fromReport({ id: 42 }, "https://example.supabase.co");
    const result = await publishedProposals([issue]);
    assert.equal(result.issues[0].commitment?.status, "unknown");
    assert.ok(result.warning);
  } finally { if (prior === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = prior; }
});
