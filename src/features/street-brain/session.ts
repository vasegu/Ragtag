import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from './http';

function secret(){const v=process.env.COUNCIL_ACCESS_CODE;if(!v)throw new AppError(503,'Council access has not been configured.');return v;}
export function validPassword(value:string){return timingSafeEqual(createHash('sha256').update(value).digest(),createHash('sha256').update(secret()).digest());}
function signature(value:string){return createHmac('sha256',secret()).update(value).digest('hex');}
export function sessionToken(){const exp=String(Date.now()+8*60*60*1000);return `${exp}.${signature(exp)}`;}
export function requireStaff(request:Request){
  const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('street_brain_session='))?.slice('street_brain_session='.length);
  if(!token)throw new AppError(401,'Sign in to the council workspace.');
  const [expires,sig]=token.split('.');
  if(!expires||!sig||Number(expires)<Date.now()||sig.length!==64||!timingSafeEqual(Buffer.from(sig),Buffer.from(signature(expires))))throw new AppError(401,'Your council session has expired. Sign in again.');
}
