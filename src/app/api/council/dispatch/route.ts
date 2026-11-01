import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";

const body = z.object({
  assignments: z
    .array(z.object({ problemId: z.string().uuid(), supplyUnitId: z.string().min(1) }))
    .max(500),
});

// Dispatch the day plan: mark each planned job as scheduled with the supply unit doing it.
// Demo workspace action; only touches jobs that have a work order (problem_jobs).
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid plan" }, { status: 400 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false },
  });
  const now = new Date().toISOString();
  const byUnit = new Map<string, string[]>();
  for (const a of parsed.data.assignments) byUnit.set(a.supplyUnitId, [...(byUnit.get(a.supplyUnitId) ?? []), a.problemId]);
  let updated = 0;
  for (const [unit, ids] of byUnit) {
    const { data, error } = await db.from("problem_jobs").update({ status: "scheduled", supply_unit_id: unit, updated_at: now }).in("problem_id", ids).select("problem_id");
    if (error) return Response.json({ error: error.message }, { status: 503 });
    updated += data?.length ?? 0;
  }
  return Response.json({ updated, crews: byUnit.size });
}
