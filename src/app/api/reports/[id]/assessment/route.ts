import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// The street brain assessment for a FixMyStreet report (from the backfill), trimmed to what the
// resident view needs: the five-decision trace and the work order. street_assessments isn't
// publicly readable, so this reads it server-side.
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sourceId = id.replace(/^fms-/, "");
  if (!/^\d+$/.test(sourceId)) return Response.json({ assessment: null });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false },
  });
  const { data } = await db
    .from("street_assessments")
    .select("id, assessment")
    .eq("source_report_id", sourceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const a = data?.assessment as { decisionTrace?: unknown; workOrder?: unknown } | undefined;
  return Response.json(
    { assessment: a ? { id: data!.id, decisionTrace: a.decisionTrace ?? [], workOrder: a.workOrder ?? null } : null },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
