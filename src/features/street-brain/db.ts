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
    if(result.workOrder)await saveProblemJob(result);
    return {...result,saved:true};
  }catch(error){if(paths.length)await client.storage.from(bucket()).remove(paths);throw error;}
}

/** One planning row per problem (problem_jobs): what the job needs, for the day planner and supply matching. */
async function saveProblemJob(result:Assessment){
  const w=result.workOrder;if(!w)return;
  const trade=w.trade.toLowerCase();
  const {error}=await db().from('problem_jobs').upsert({
    problem_id:result.id,updated_at:new Date().toISOString(),category:result.category,trade:w.trade,bundle_key:w.bundleKey,
    size_band:w.size.band,size_description:w.size.description,quantity:w.size.quantity,
    materials:w.materials,equipment:w.equipment,crew_size:w.crewSize,
    minutes_min:Math.round(w.estimatedMinutes.min),minutes_max:Math.round(w.estimatedMinutes.max),
    traffic_management:w.trafficManagement,delivery_mode:w.deliveryMode,cost_low:w.costRange.low,cost_high:w.costRange.high,
    address:result.address,lat:result.location?.lat??null,lon:result.location?.lon??null,
    status:w.deliveryMode==='refer'?'referred':'unscheduled',
    // Simple first match on trade keyword; the day planner can reassign.
    supply_unit_id:w.deliveryMode==='refer'?null:/highway|road|paving|footway/.test(trade)?(w.deliveryMode==='contractor'?'highways-ctr':'highways-1'):/graffiti/.test(trade)?'graffiti-1':/waste|fly/.test(trade)?'waste-1':/cleans|litter/.test(trade)?'cleansing-1':/electric|light/.test(trade)?'lighting-1':/enforce|parking/.test(trade)?'parking-1':null,
  },{onConflict:'problem_id'});
  if(error)console.error('problem_jobs upsert failed',error.message);
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
