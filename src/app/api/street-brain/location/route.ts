import { searchLocation } from '@/features/street-brain/context';
import { AppError,errorResponse } from '@/features/street-brain/http';
export async function GET(request:Request){
  try{const q=new URL(request.url).searchParams.get('q')?.trim();if(!q||q.length<4||q.length>200)throw new AppError(400,'Enter a street name or postcode.');return Response.json({locations:await searchLocation(q)},{headers:{'cache-control':'private, max-age=300'}});}catch(e){return errorResponse(e);}
}
