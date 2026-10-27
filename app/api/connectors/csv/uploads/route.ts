import type { NextRequest } from 'next/server';
import { csvHttp } from '@/lib/connectors/csv/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:NextRequest)=>csvHttp(request);
export const POST=(request:NextRequest)=>csvHttp(request);
