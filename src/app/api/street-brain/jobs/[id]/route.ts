import { getJob,validReceipt } from '@/features/street-brain/jobs';
import { requireStaff } from '@/features/street-brain/session';
import { AppError,errorResponse } from '@/features/street-brain/http';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  try{
    const {id}=await context.params;
    if(!validReceipt(id,request.headers.get('x-report-receipt')))requireStaff(request);
    const job=await getJob(id);
    if(job.mode!=='live')throw new AppError(404,'This receipt is not available.');
    return Response.json({status:job.status,assessment:job.status==='completed'?job.result:null,error:job.error},{headers:{'cache-control':'no-store'}});
  }catch(e){return errorResponse(e);}
}
