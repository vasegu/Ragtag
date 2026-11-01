import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { validReceipt } from '@/features/street-brain/jobs';
import { AppError, errorResponse } from '@/features/street-brain/http';

export const runtime = 'nodejs';

const body = z.object({
  jobId: z.string().uuid(),
  receipt: z.string().min(10),
  stage: z.number().int().min(1).max(5),
  field: z.enum(['category', 'responsibility', 'severity', 'other']),
  aiValue: z.string().max(400).nullable(),
  residentValue: z.string().max(400).nullable(),
  comment: z.string().max(1000).nullable(),
});

// A resident disagrees with one of the AI's decisions on their own report. The signed
// receipt from upload proves it's theirs. The problem goes back to a person for review.
export async function POST(request: Request) {
  try {
    const parsed = body.safeParse(await request.json());
    if (!parsed.success) throw new AppError(400, 'Tell us what looks wrong.');
    const f = parsed.data;
    if (!validReceipt(f.jobId, f.receipt)) throw new AppError(403, 'This report receipt is not valid.');

    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
      auth: { persistSession: false },
    });
    const { error } = await db.from('problem_feedback').insert({
      problem_id: f.jobId,
      stage: f.stage,
      field: f.field,
      ai_value: f.aiValue,
      resident_value: f.residentValue,
      comment: f.comment,
    });
    if (error) throw new AppError(503, 'Your feedback could not be saved. Please try again.');
    await Promise.all([
      db.from('problem_jobs').update({ disputed: true, updated_at: new Date().toISOString() }).eq('problem_id', f.jobId),
      db.from('street_assessments').update({ outcome: 'review', queue: 'Resident disagrees · review' }).eq('id', f.jobId),
    ]);
    return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
