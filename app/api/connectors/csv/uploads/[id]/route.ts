import type { NextRequest } from 'next/server';
import { csvHttp } from '@/lib/connectors/csv/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
type Context={params:Promise<{id:string}>};
export const GET=async(request:NextRequest,context:Context)=>csvHttp(request,(await context.params).id);
export const POST=GET;
