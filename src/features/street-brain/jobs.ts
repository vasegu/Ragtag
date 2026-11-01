import { randomUUID,createHmac,timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { db,saveAssessment } from './db';
import { AppError } from './http';
import { locationSchema } from './contracts';
import { assessPhotos,imageType } from './workflow';
import type { Photo } from './ai';

export const liveBucket=()=>process.env.SUPABASE_UPLOAD_BUCKET||'street-brain-uploads';
export const backtestBucket=()=>process.env.SUPABASE_BACKTEST_BUCKET||'images';
export const jobMetadata=z.object({address:z.string().max(400).default('Location not supplied'),description:z.string().max(3000).default('No description supplied'),location:locationSchema.nullable().default(null),photoPaths:z.array(z.string().max(500)).max(3).optional(),sourceReportId:z.string().optional()});
const jobSchema=z.object({id:z.string().uuid(),source_bucket:z.string(),source_path:z.string(),mode:z.enum(['live','backtest']),status:z.enum(['pending','processing','completed','failed']),metadata:jobMetadata,attempts:z.number(),expected_category:z.string().nullable(),result:z.unknown().nullable(),error:z.string().nullable()});
export type Job=z.infer<typeof jobSchema>;
function webhookKey(){const key=process.env.PIPELINE_WEBHOOK_SECRET;if(!key)throw new AppError(503,'The pipeline webhook secret is not configured.');return key;}
export function receipt(id:string){return createHmac('sha256',webhookKey()).update('report:'+id).digest('hex');}
export function validReceipt(id:string,value:string|null){const expected=receipt(id);return value?.length===expected.length&&timingSafeEqual(Buffer.from(value),Buffer.from(expected));}
export function requireWebhook(request:Request){const value=request.headers.get('authorization')?.replace(/^Bearer /,'')??'',expected=webhookKey();if(value.length!==expected.length||!timingSafeEqual(Buffer.from(value),Buffer.from(expected)))throw new AppError(401,'Pipeline authentication failed.');}
export function allowedObject(bucket:string,path:string,mode:'live'|'backtest'){
  return bucket===(mode==='live'?liveBucket():backtestBucket())&&!!path&&!path.startsWith('/')&&!path.split('/').includes('..')&&/\.(jpe?g|png|webp)$/i.test(path);
}
export async function enqueueObject(input:{bucket:string;path:string;metadata:z.infer<typeof jobMetadata>;mode:'live'|'backtest';expectedCategory?:string}){
  if(!allowedObject(input.bucket,input.path,input.mode))throw new AppError(400,'The object is outside the configured pipeline bucket or is not a supported image.');
  const client=db();
  const {error}=await client.from('street_pipeline_jobs').upsert({id:randomUUID(),source_bucket:input.bucket,source_path:input.path,mode:input.mode,metadata:input.metadata,expected_category:input.mode==='backtest'?input.expectedCategory??null:null},{onConflict:'source_bucket,source_path,mode',ignoreDuplicates:true});
  if(error)throw new AppError(503,'The pipeline job table is not available. The project owner needs to run setup.sql.');
  const {data,error:readError}=await client.from('street_pipeline_jobs').select('*').eq('source_bucket',input.bucket).eq('source_path',input.path).eq('mode',input.mode).single();
  if(readError)throw new AppError(503,'The queued job could not be read.');
  return jobSchema.parse(data);
}
export async function getJob(id:string){const {data,error}=await db().from('street_pipeline_jobs').select('*').eq('id',id).single();if(error)throw new AppError(404,'This pipeline job was not found.');return jobSchema.parse(data);}

export async function processJob(id:string){
  const client=db(),before=await getJob(id);if(before.status!=='pending')return;
  const {data,error}=await client.from('street_pipeline_jobs').update({status:'processing',attempts:before.attempts+1,locked_at:new Date().toISOString(),error:null}).eq('id',id).eq('status','pending').select('*').maybeSingle();
  if(error||!data)return; // Atomic conditional update: only one worker wins.
  const job=jobSchema.parse(data);
  try{
    const paths=job.metadata.photoPaths??[job.source_path];
    const photos:Photo[]=[];
    for(const path of paths){
      if(!allowedObject(job.source_bucket,path,job.mode))throw new AppError(400,'A photo path is outside the pipeline bucket.');
      const {data:blob,error:downloadError}=await client.storage.from(job.source_bucket).download(path);
      if(downloadError||!blob||blob.size>3000000)throw new AppError(422,'The uploaded photo is missing or larger than 3 MB.');
      const bytes=Buffer.from(await blob.arrayBuffer()),type=imageType(bytes);if(!type)throw new AppError(422,'The uploaded file is not a supported image.');photos.push({bytes,type});
    }
    let result=await assessPhotos({photos,address:job.metadata.address,description:job.metadata.description,location:job.metadata.location,id});
    if(result.outcome!=='rejected')result=await saveAssessment(result,photos,job.metadata.description,job.mode,job.metadata.sourceReportId??null);
    const {error:finishError}=await client.from('street_pipeline_jobs').update({status:'completed',result,completed_at:new Date().toISOString(),error:null}).eq('id',id).eq('status','processing');
    if(finishError)throw new AppError(503,'The completed assessment could not be recorded.');
  }catch(e){
    const text=e instanceof AppError?e.message:'The pipeline could not complete this assessment. Retry after reviewing the service configuration.';
    await client.from('street_pipeline_jobs').update({status:'failed',error:text}).eq('id',id).eq('status','processing');
    console.error(JSON.stringify({event:'pipeline_job_failed',jobId:id,type:e instanceof Error?e.name:'unknown'}));
  }
}

export async function uploadReport(photos:Photo[],metadata:z.infer<typeof jobMetadata>){
  const client=db(),folder=randomUUID(),paths:string[]=[];
  try{
    for(let i=0;i<photos.length;i++){
      const p=photos[i],extension=p.type==='image/png'?'png':p.type==='image/webp'?'webp':'jpg',path=`${folder}/${i}.${extension}`;
      // The last object carries the full batch; the webhook ignores earlier batch objects.
      const completePaths=[...paths,path];
      const {error}=await client.storage.from(liveBucket()).upload(path,p.bytes,{contentType:p.type,metadata:{...metadata,photoPaths:completePaths,photoIndex:i,photoCount:photos.length}});
      if(error)throw new AppError(503,'The new-upload bucket is not ready. The project owner needs to run setup.sql.');
      paths.push(path);
    }
    return await enqueueObject({bucket:liveBucket(),path:paths[paths.length-1],metadata:{...metadata,photoPaths:paths},mode:'live'});
  }catch(e){if(paths.length)await client.storage.from(liveBucket()).remove(paths);throw e;}
}
