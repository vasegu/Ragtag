import { queueFor } from "@/lib/report/queue";
import { seedReports } from "@/lib/report/seed";
import type { Classification, QueueInfo, Report } from "@/lib/report/types";

export const runtime = "nodejs";

type Body = { report: Pick<Report, "id" | "category" | "created_at" | "confirmations">; classification?: Classification };

// Santiago's ranking when QUEUE_URL is set; otherwise the mock in src/lib/report/queue.ts.
export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  if (!body.report?.category) return Response.json({ error: "report is required" }, { status: 400 });

  if (process.env.QUEUE_URL) {
    const res = await fetch(process.env.QUEUE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return Response.json({ error: `queue ${res.status}` }, { status: 502 });
    return Response.json((await res.json()) as QueueInfo);
  }

  return Response.json(queueFor(body.report, body.classification, seedReports()));
}
