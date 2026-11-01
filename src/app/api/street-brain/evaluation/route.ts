import { after } from 'next/server';
import { z } from 'zod';
import { db } from '@/features/street-brain/db';
import { backtestBucket,enqueueObject,processJob } from '@/features/street-brain/jobs';
import { requireStaff } from '@/features/street-brain/session';
import { AppError,errorResponse } from '@/features/street-brain/http';
export const maxDuration=120;
export async function GET(request:Request){
  try{
    requireStaff(request);const client=db();
    const {data:jobs,error}=await client.from('street_pipeline_jobs').select('id,status,expected_category,result,error,created_at').eq('mode','backtest').order('created_at',{ascending:false}).limit(100);
    if(error)throw new AppError(503,'The backtest table is not ready.');
    const {data:photos}=await client.from('report_photos').select('report_id,storage_path').not('storage_path','is',null).limit(20);
    const ids=photos?.map(p=>String(p.report_id))??[];
    const {data:reports}=ids.length?await client.from('reports').select('id,title,category').in('id',ids):{data:[]};
    return Response.json({jobs:jobs??[],candidates:reports??[]},{headers:{'cache-control':'no-store'}});
  }catch(e){return errorResponse(e);}
}
export async function POST(request:Request){
  try{
    requireStaff(request);const {reportId}=z.object({reportId:z.string().min(1).max(100)}).parse(await request.json()),client=db();
    const {data:report}=await client.from('reports').select('id,title,detail,address,category,lat,lon').eq('id',reportId).single();
    const {data:photo}=await client.from('report_photos').select('storage_path').eq('report_id',reportId).not('storage_path','is',null).limit(1).maybeSingle();
    if(!report||!photo?.storage_path)throw new AppError(404,'No stored backtest image was found for this report.');
    const path=String(photo.storage_path).replace(new RegExp('^'+backtestBucket()+'/'),'');
    // Expected category is retained only as a weak evaluation label; never passed to the model.
    const job=await enqueueObject({bucket:backtestBucket(),path,mode:'backtest',expectedCategory:String(report.category),metadata:{address:String(report.address??'Location not supplied'),description:[report.title,report.detail].filter(Boolean).join('\n').slice(0,3000),location:null,sourceReportId:String(report.id)}});
    after(()=>processJob(job.id));return Response.json({jobId:job.id,status:job.status},{status:202});
  }catch(e){return errorResponse(e);}
}
