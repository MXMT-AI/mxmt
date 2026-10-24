import { NextRequest, NextResponse } from "next/server";
import { cronSecretMatches } from "@/lib/data-scheduler";
import { scheduleSalesDriveSyncs, processSalesDriveSync } from "@/lib/connectors/sync-worker";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
/** External minute tick on Hobby: enqueue due work and drain exactly one bounded step. */
export async function GET(request:NextRequest) {
  const headers={"Cache-Control":"no-store"};
  if (!cronSecretMatches(request.headers.get('authorization'),process.env.CRON_SECRET)) return NextResponse.json({error:'Unauthorized'},{status:401,headers});
  try { const schedule=await scheduleSalesDriveSyncs(); return NextResponse.json({schedule,worker:await processSalesDriveSync()},{headers}); }
  catch { return NextResponse.json({error:'Sync unavailable'},{status:503,headers}); }
}
