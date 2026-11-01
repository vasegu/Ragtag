import { after } from 'next/server';
import { locationSchema } from '@/features/street-brain/contracts';
import { type Photo } from '@/features/street-brain/ai';
import { imageType } from '@/features/street-brain/workflow';
import { uploadReport,processJob,receipt } from '@/features/street-brain/jobs';
import { AppError,errorResponse } from '@/features/street-brain/http';

export const runtime='nodejs';
export const maxDuration=120;
const requests=new Map<string,{n:number;until:number}>();
export async function POST(request:Request){
  try{
    const ip=request.headers.get('x-forwarded-for')?.split(',')[0]??'local',previous=requests.get(ip),now=Date.now();
    if(previous&&previous.until>now&&previous.n>=6)throw new AppError(429,'You have made several assessments. Please wait ten minutes before trying again.');
    requests.set(ip,{n:previous&&previous.until>now?previous.n+1:1,until:now+600000});
    if(Number(request.headers.get('content-length')??0)>4000000)throw new AppError(413,'The photo upload is too large. Please choose fewer photos.');
    let form:FormData;try{form=await request.formData();}catch{throw new AppError(400,'The photo upload could not be read. Choose the photos again.');}
    const address=form.get('address'),description=form.get('description'),files=form.getAll('photos');
    if(typeof address!=='string'||address.trim().length<3||address.length>400||typeof description!=='string'||!description.trim()||description.length>3000||!files.length||files.length>3)throw new AppError(400,'Add 1–3 photos, a location, and a description of the issue.');
    const photos:Photo[]=[];
    for(const file of files){
      if(!(file instanceof File)||file.size<20||file.size>3000000)throw new AppError(400,'Choose a valid JPEG, PNG or WebP photo under 3 MB.');
      const bytes=Buffer.from(await file.arrayBuffer()),type=imageType(bytes);
      if(!type||type!==file.type)throw new AppError(400,'One file is not a supported photo. Choose JPEG, PNG or WebP.');
      photos.push({bytes,type});
    }
    let location=null;
    const rawLocation=form.get('location');
    if(typeof rawLocation==='string'&&rawLocation){try{location=locationSchema.parse(JSON.parse(rawLocation));}catch{throw new AppError(400,'Choose the location again.');}}
    const job=await uploadReport(photos,{address:address.trim(),description:description.trim(),location});
    after(()=>processJob(job.id));
    return Response.json({jobId:job.id,receipt:receipt(job.id)},{status:202,headers:{'cache-control':'no-store'}});
  }catch(e){return errorResponse(e);}
}
