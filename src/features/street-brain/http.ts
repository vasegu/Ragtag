export class AppError extends Error { constructor(public status:number,message:string){super(message);} }
export async function externalJson(url:string,options:RequestInit={},timeout=20000):Promise<unknown>{
  let response:Response;
  try{response=await fetch(url,{...options,signal:AbortSignal.timeout(timeout)});}catch{throw new AppError(504,'The upstream service did not respond in time. Please try again.');}
  const body=await response.text();
  if(!response.ok){
    console.error(JSON.stringify({event:'upstream_error',host:new URL(url).host,status:response.status,requestId:response.headers.get('x-request-id')}));
    if(response.status===401||response.status===403)throw new AppError(502,'The AI key or service permissions were rejected. Check the server configuration.');
    if(response.status===429)throw new AppError(503,'The AI account is rate limited or has no available credits. Please try again later.');
    if(response.status===404)throw new AppError(502,'The configured AI endpoint or model is not available to this account.');
    throw new AppError(502,`The upstream service returned an error (${response.status}). Please try again.`);
  }
  if(!body.trim())throw new AppError(502,'The upstream service returned an empty response. Please try again.');
  try{return JSON.parse(body);}catch{throw new AppError(502,'The upstream service returned an unreadable response. Please try again.');}
}
export function errorResponse(error:unknown){
  if(error instanceof AppError)return Response.json({error:error.message},{status:error.status});
  console.error(JSON.stringify({event:'request_failed',type:error instanceof Error?error.name:'unknown'}));
  return Response.json({error:'The assessment could not be completed. Please try again.'},{status:500});
}
