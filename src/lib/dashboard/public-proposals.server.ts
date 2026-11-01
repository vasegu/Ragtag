import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { RepairIssue } from "./repairs";

// Same public FMS-linked projection as /api/reports/[id]/assessment. Never return
// resident text, private photo paths, signed URLs or unrelated live assessments.
const proposalSchema = z.object({
  outcome: z.enum(["accepted", "review", "referred", "rejected"]),
  policyLevel: z.string(), reason: z.string(), severity: z.number().int().min(1).max(5).nullable(),
  workOrder: z.unknown().optional(),
});
const orderSchema = z.object({
    summary: z.string(), trade: z.string(), crewSize: z.number().int().positive(),
    estimatedMinutes: z.object({ min: z.number().nonnegative(), max: z.number().positive() }),
    materials: z.array(z.string()), equipment: z.array(z.string()), deliveryMode: z.string(),
    costRange: z.object({ low: z.number().nonnegative(), high: z.number().nonnegative() }), trafficManagement: z.string(),
    size: z.object({ band: z.string(), quantity: z.string() }).optional(),
  });
export function withPublishedProposal(issue: RepairIssue, raw: unknown, mode: string): RepairIssue {
  const parsed = proposalSchema.safeParse(raw);
  if (!parsed.success || issue.source !== "FixMyStreet") return issue;
  const a = parsed.data;
  const band = a.policyLevel.match(/^S([0-3])(?:\b|$)/)?.[1];
  const priority = a.outcome === "rejected" || a.outcome === "referred" ? "Unassessed" : band === "0" ? "Emergency" : band === "1" ? "High" : band === "2" ? "Elevated" : band === "3" ? "Routine" : "Unassessed";
  const work = orderSchema.safeParse(a.workOrder);
  const w = work.success ? work.data : null;
  return { ...issue, priority, referred: a.outcome === "referred", proposal: { policyLevel: a.policyLevel, reason: a.reason, rating: a.severity, mode },
    recommendation: w?.summary ?? null,
    workOrder: w ? { trade: w.trade, crewSize: w.crewSize, minutes: w.estimatedMinutes.max, materials: w.materials, equipment: w.equipment, costLow: w.costRange.low, costHigh: w.costRange.high, mode: w.deliveryMode, access: w.trafficManagement, quantity: w.size?.quantity ?? null, sizeBand: w.size?.band ?? null, assignedUnit: null } : null,
  };
}
export async function readAllRows<T>(fetchPage: (offset: number) => Promise<{ data: T[] | null; count: number | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = []; let expected: number | null = null;
  while (true) {
    const page = await fetchPage(rows.length);
    if (page.error || !page.data || page.count === null || expected !== null && expected !== page.count) throw new Error("The complete commitment snapshot could not be verified.");
    expected = page.count;
    if (!page.data.length && rows.length < expected) throw new Error("Incomplete commitment snapshot.");
    rows.push(...page.data);
    if (rows.length >= expected) return rows;
  }
}
export async function publishedProposals(issues: RepairIssue[]): Promise<{ issues: RepairIssue[]; warning?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!issues.length) return { issues };
  const unverified = (warning: string) => ({ issues: issues.map(i => ({ ...i, commitment: { status: "unknown", resourceId: null } })), warning });
  if (!url || !key) return unverified("Stored proposals and existing commitments are not connected. Review reports before scheduling.");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const ids = issues.filter(i => i.source === "FixMyStreet").map(i => i.id.replace(/^fms-/, ""));
  // Only records already known to be public FMS reports can be enriched.
  type Row = { id: string; source_report_id: string; source_mode: string; assessment: unknown };
  type Booking = { problem_id: string; status: string; supply_unit_id: string | null };
  let data: Row[], jobs: Booking[] = [];
  try {
    data = await readAllRows<Row>(async offset => {
      const r = await db.from("street_assessments").select("id,source_report_id,source_mode,created_at,assessment", { count: "exact" })
        .in("source_report_id", ids).order("created_at", { ascending: false }).order("id").range(offset, offset + 499);
      return { data: r.data as Row[] | null, count: r.count, error: r.error };
    });
    for (let offset = 0; offset < data.length; offset += 100) {
      const chunk = data.slice(offset, offset + 100).map(a => a.id);
      const related = await readAllRows<Booking>(async start => {
        const r = await db.from("problem_jobs").select("problem_id,status,supply_unit_id", { count: "exact" })
          .in("problem_id", chunk).in("status", ["scheduled", "dispatched", "done", "referred"]).order("problem_id").range(start, start + 499);
        return { data: r.data as Booking[] | null, count: r.count, error: r.error };
      });
      jobs = jobs.concat(related);
    }
  } catch { return unverified("Stored proposals or related commitments could not be completely verified. Refresh before scheduling these reports."); }
  const reportOf = new Map(data.map(a => [a.id, `fms-${a.source_report_id}`]));
  const commitments = new Map<string, NonNullable<RepairIssue["commitment"]>>();
  for (const j of jobs) { const id = reportOf.get(j.problem_id); if (id) commitments.set(id, { status: j.status, resourceId: j.supply_unit_id }); }
  const latest = new Map<string, { assessment: unknown; mode: string }>();
  for (const row of data ?? []) { const id = `fms-${row.source_report_id}`; if (!latest.has(id)) latest.set(id, { assessment: row.assessment, mode: String(row.source_mode) }); }
  return { issues: issues.map(i => {
    const a = latest.get(i.id); if (!a) return i;
    const projected = withPublishedProposal(i, a.assessment, a.mode);
    const commitment = commitments.get(i.id);
    return commitment ? { ...projected, commitment } : projected;
  }) };
}
