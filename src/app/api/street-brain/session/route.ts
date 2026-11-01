import { AppError,errorResponse } from '@/features/street-brain/http';
import { sessionToken, validPassword } from '@/features/street-brain/session';
const attempts=new Map<string,{n:number;expires:number}>();
export async function POST(request:Request){
  try{
    const ip=request.headers.get('x-forwarded-for')??'local',old=attempts.get(ip);
    if(old&&old.expires>Date.now()&&old.n>=8)throw new AppError(429,'Too many attempts. Try again in ten minutes.');
    const body:unknown=await request.json();
    if(typeof body!=='object'||body===null||!('password' in body)||typeof body.password!=='string'||!validPassword(body.password)){
      attempts.set(ip,{n:old&&old.expires>Date.now()?old.n+1:1,expires:Date.now()+600000});
      throw new AppError(401,'The council access code is incorrect.');
    }
    attempts.delete(ip);
    return Response.json({ok:true},{headers:{'set-cookie':`street_brain_session=${sessionToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.VERCEL?'; Secure':''}`}});
  }catch(e){return errorResponse(e);}
}
export async function DELETE(){return Response.json({ok:true},{headers:{'set-cookie':'street_brain_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}});}
