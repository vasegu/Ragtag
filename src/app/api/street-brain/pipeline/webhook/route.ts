import { after } from 'next/server';
import { z } from 'zod';
import { enqueueObject,jobMetadata,liveBucket,processJob,requireWebhook } from '@/features/street-brain/jobs';
import { errorResponse } from '@/features/street-brain/http';
export const maxDuration=120;
const eventSchema=z.object({type:z.literal('INSERT'),schema:z.literal('storage'),table:z.literal('objects'),record:z.object({bucket_id:z.string(),name:z.string(),user_metadata:z.record(z.string(),z.unknown()).nullable().optional()})});
export async function POST(request:Request){
  try{
    requireWebhook(request);
    const parsed=eventSchema.safeParse(await request.json());
    if(!parsed.success)return Response.json({ignored:true,reason:'Only storage.objects INSERT events are supported.'});
    const r=parsed.data.record;
    if(r.bucket_id!==liveBucket())return Response.json({ignored:true,reason:'This bucket is not the live-upload bucket.'});
    const meta=r.user_metadata??{};
    if(typeof meta.photoCount==='number'&&typeof meta.photoIndex==='number'&&meta.photoIndex<meta.photoCount-1)return Response.json({ignored:true,reason:'Waiting for the final photo in the report.'});
    const metadata=jobMetadata.parse(meta);
    const job=await enqueueObject({bucket:r.bucket_id,path:r.name,metadata,mode:'live'});
    after(()=>processJob(job.id));
    return Response.json({jobId:job.id,status:job.status},{status:202});
  }catch(e){return errorResponse(e);}
}
