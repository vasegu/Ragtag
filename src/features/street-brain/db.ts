import { createClient } from '@supabase/supabase-js';
import { assessmentSchema, type Assessment } from './contracts';
import { AppError } from './http';

export function db(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new AppError(503,'Report storage is not configured. The server needs its Supabase URL and secret key.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
const table=()=>process.env.SUPABASE_ASSESSMENTS_TABLE||'street_assessments';
const bucket=()=>process.env.SUPABASE_PHOTO_BUCKET||'street-brain-photos';

export async function saveAssessment(result:Assessment,photos:{type:string;bytes:Buffer}[],residentDescription:string,mode:'live'|'backtest'='live',sourceReportId:string|null=null){
  const client=db(),paths:string[]=[];
  try{
    for(let i=0;i<photos.length;i++){
      const p=photos[i],extension=p.type==='image/png'?'png':p.type==='image/webp'?'webp':'jpg';
      const path=`${result.id}/${i}.${extension}`;
      const {error}=await client.storage.from(bucket()).upload(path,p.bytes,{contentType:p.type,upsert:true});
      if(error)throw new AppError(503,'The private photo bucket is not ready. Complete the Supabase setup query.');
      paths.push(path);
    }
    const {error}=await client.from(table()).upsert({id:result.id,source_mode:mode,source_report_id:sourceReportId,created_at:result.createdAt,address:result.address,latitude:result.location?.lat??null,longitude:result.location?.lon??null,resident_description:residentDescription,category:result.category,severity:result.severity,queue:result.queue,outcome:result.outcome,assessment:{...result,saved:true},photo_paths:paths});
    if(error)throw new AppError(503,'The assessment table is not ready or rejected the record. Complete the Supabase setup query.');
    return {...result,saved:true};
  }catch(error){if(paths.length)await client.storage.from(bucket()).remove(paths);throw error;}
}

export async function listAssessments(){
  const client=db();
  const {data,error}=await client.from(table()).select('assessment,photo_paths,confirmed_due_at,deadline_source_url').eq('source_mode','live').order('created_at',{ascending:false}).limit(100);
  if(error)throw new AppError(503,'The council assessment table is not available. Complete the Supabase setup query.');
  const items:Assessment[]=[];
  for(const row of data??[]){
    const parsed=assessmentSchema.safeParse(row.assessment);
    if(!parsed.success)continue;
    const paths=Array.isArray(row.photo_paths)?row.photo_paths.filter((x:unknown):x is string=>typeof x==='string'):[];
    const {data:signed}=await client.storage.from(bucket()).createSignedUrls(paths,600);
    const urgentDeadline=typeof row.confirmed_due_at==='string'&&typeof row.deadline_source_url==='string'&&row.deadline_source_url.startsWith('https://')&&new Date(row.confirmed_due_at).getTime()<Date.now()+86400000;
    const escalated=urgentDeadline&&parsed.data.queueOrder!==0;
    items.push({...parsed.data,...(escalated?{queue:'Confirmed obligation at risk',queueOrder:0.5,reason:`A staff-confirmed obligation is due ${row.confirmed_due_at}. Review the recorded source and action before scheduling.`,decisionTrace:parsed.data.decisionTrace.map(step=>step.stage===5?{...step,answer:'Confirmed obligation at risk',method:'Deterministic confirmed-obligation escalation',confidence:null,evidence:[`Staff-confirmed due time: ${row.confirmed_due_at}`,...step.evidence],sources:[String(row.deadline_source_url),...step.sources]}:step)}:{}),photoUrls:signed?.flatMap(x=>x.signedUrl?[x.signedUrl]:[])??[]});
  }
  return items.sort((a,b)=>a.queueOrder-b.queueOrder||(b.severity??0)-(a.severity??0)||a.createdAt.localeCompare(b.createdAt));
}

export async function sourceSummary(){
  const {count,error}=await db().from('reports').select('id',{count:'exact',head:true});
  return {connected:!error,reports:count??0};
}
