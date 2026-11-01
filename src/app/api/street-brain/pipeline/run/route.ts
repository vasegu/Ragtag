import { after } from 'next/server';
import { z } from 'zod';
import { db } from '@/features/street-brain/db';
import { processJob } from '@/features/street-brain/jobs';
import { requireStaff } from '@/features/street-brain/session';
import { AppError,errorResponse } from '@/features/street-brain/http';
export const maxDuration=120;
export async function POST(request:Request){
  try{
    requireStaff(request);const {jobId}=z.object({jobId:z.string().uuid()}).parse(await request.json());
    const {data,error}=await db().from('street_pipeline_jobs').update({status:'pending',error:null}).eq('id',jobId).eq('status','failed').lt('attempts',3).select('id').maybeSingle();
    if(error||!data)throw new AppError(409,'This job is not retryable or has reached three attempts.');
    after(()=>processJob(jobId));return Response.json({jobId,status:'pending'},{status:202});
  }catch(e){return errorResponse(e);}
}
