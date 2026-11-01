export async function readJsonResponse(response:Response):Promise<unknown>{
  const text=await response.text();
  if(!text.trim())throw new Error(`The server returned an empty response (${response.status}). Please try again.`);
  let value:unknown;
  try{value=JSON.parse(text);}catch{throw new Error(`The server returned an unreadable response (${response.status}). Please try again.`);}
  if(!response.ok){
    if(typeof value==='object'&&value!==null&&'error' in value&&typeof value.error==='string')throw new Error(value.error);
    throw new Error(`The request failed (${response.status}).`);
  }
  return value;
}
