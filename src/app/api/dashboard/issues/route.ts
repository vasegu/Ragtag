import { createClient } from "@supabase/supabase-js";
import { fromReport, fromWorkOrder } from "@/lib/dashboard/repairs";
import { publishedProposals } from "@/lib/dashboard/public-proposals.server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = params.get("source") ?? "reports";
  const offset = Number(params.get("offset") ?? 0);
  if (!["reports", "jobs"].includes(source) || !Number.isInteger(offset) || offset < 0 || offset > 5000000) return Response.json({ error: "Invalid report offset." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json({ error: "Public report storage is not configured. No demo reports were substituted." }, { status: 503 });
  try {
    // Public tables honour anonymous RLS. Optional AI metadata uses the existing
    // FMS-linked publication contract; private photos and resident text are never exposed.
    const db = createClient(url, key, { auth: { persistSession: false } });
    const size = 500;
    const { data, error, count } = await db.from(source === "reports" ? "reports" : "problem_jobs")
      .select(source === "reports" ? "*, report_photos(storage_path)" : "*", { count: "exact" })
      .order(source === "reports" ? "id" : "problem_id", { ascending: true }).range(offset, offset + size - 1);
    if (error || count === null) return Response.json({ error: source === "jobs" ? "Public work orders are unavailable." : "Could not load the complete public report register." }, { status: 503 });
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const mapped = rows.map(row => source === "reports" ? fromReport(row, url) : fromWorkOrder(row));
    const projected = source === "reports" ? await publishedProposals(mapped) : { issues: mapped };
    return Response.json({ ...projected, total: count, hasMore: offset + rows.length < count, nextOffset: offset + rows.length, source }, { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=600" } });
  } catch { return Response.json({ error: "Public report service is unavailable. Please retry." }, { status: 503 }); }
}
