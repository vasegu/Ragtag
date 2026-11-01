import { listAssessments,sourceSummary } from '@/features/street-brain/db';
import { requireStaff } from '@/features/street-brain/session';
import { errorResponse } from '@/features/street-brain/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{requireStaff(request);const [assessments,source]=await Promise.all([listAssessments(),sourceSummary()]);return Response.json({assessments,source},{headers:{'cache-control':'no-store'}});}catch(e){return errorResponse(e);}}
