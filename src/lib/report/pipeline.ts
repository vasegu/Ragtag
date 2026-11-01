"use client";

import type { Assessment, WorkOrder } from "@/features/street-brain/contracts";

// Client for Santiago's street brain pipeline: upload → background job → assessment
// with a five-decision trace and (now) a work order.

export type Decision = Assessment["decisionTrace"][number];
export type PipelineResult = { trace: Decision[]; workOrder: WorkOrder | null; assessment: Assessment; jobId: string; receipt: string };

export async function assessPhoto(
  photo: Blob,
  opts: { address: string; description: string; lat: number; lng: number },
  signal?: AbortSignal,
): Promise<PipelineResult> {
  const form = new FormData();
  form.append("photos", photo, "photo.jpg");
  form.append("address", opts.address);
  form.append("description", opts.description);
  form.append(
    "location",
    JSON.stringify({ label: opts.address, lat: opts.lat, lon: opts.lng, borough: "Hackney", source: "OpenStreetMap / Nominatim" }),
  );
  const res = await fetch("/api/street-brain/assess", { method: "POST", body: form, signal });
  const start = (await res.json()) as { jobId?: string; receipt?: string; error?: string };
  if (!res.ok || !start.jobId || !start.receipt) throw new Error(start.error ?? "The assessment could not start.");

  // Poll the job until the background pipeline finishes (usually 10-30s).
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, i < 5 ? 1500 : 2500));
    if (signal?.aborted) throw new Error("aborted");
    const job = (await (
      await fetch(`/api/street-brain/jobs/${start.jobId}`, { headers: { "x-report-receipt": start.receipt }, signal })
    ).json()) as { status: string; assessment: Assessment | null; error: string | null };
    if (job.status === "completed" && job.assessment) {
      return { trace: job.assessment.decisionTrace, workOrder: job.assessment.workOrder ?? null, assessment: job.assessment, jobId: start.jobId, receipt: start.receipt };
    }
    if (job.status === "failed") throw new Error(job.error ?? "The assessment failed.");
  }
  throw new Error("The assessment is taking longer than expected.");
}

export async function sendFeedback(input: {
  jobId: string;
  receipt: string;
  stage: number;
  field: "category" | "responsibility" | "severity" | "other";
  aiValue: string | null;
  residentValue: string | null;
  comment: string | null;
}) {
  const res = await fetch("/api/street-brain/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Feedback failed");
}
