import { hybridSearch } from "@/lib/search";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  if (!q) return Response.json({ error: "q is required" }, { status: 400 });
  const results = await hybridSearch(q, { area: params.get("area"), count: Number(params.get("count") ?? 10) });
  return Response.json({ results });
}
