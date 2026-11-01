import { createClient } from "@supabase/supabase-js";
import { fromReport, fromWorkOrder } from "@/lib/dashboard/repairs";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = params.get("source") ?? "reports";
  const page = Number(params.get("page") ?? 0);
  if (!["reports", "jobs"].includes(source) || !Number.isInteger(page) || page < 0 || page > 10000) return Response.json({ error: "Invalid report page." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json({ error: "Public report storage is not configured. No demo reports were substituted." }, { status: 503 });
  try {
    // Anonymous access honours public-table RLS. Never use the service key or private assessments here.
    const db = createClient(url, key, { auth: { persistSession: false } });
    const size = 500;
    const { data, error, count } = await db.from(source === "reports" ? "reports" : "problem_jobs")
      .select(source === "reports" ? "*, report_photos(storage_path)" : "*", { count: "exact" })
      .order(source === "reports" ? "id" : "problem_id", { ascending: true }).range(page * size, page * size + size - 1);
    if (error) return Response.json({ error: source === "jobs" ? "Public work orders are unavailable." : "Could not load the public reports." }, { status: 503 });
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    return Response.json({ issues: rows.map(row => source === "reports" ? fromReport(row, url) : fromWorkOrder(row)), total: count ?? rows.length, hasMore: count !== null ? (page + 1) * size < count : rows.length === size, source }, { headers: { "cache-control": "no-store" } });
  } catch { return Response.json({ error: "Public report service is unavailable. Please retry." }, { status: 503 }); }
}
