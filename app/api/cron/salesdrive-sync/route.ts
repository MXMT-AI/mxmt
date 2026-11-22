import { NextRequest, NextResponse } from "next/server";
import { cronSecretMatches } from "@/lib/data-scheduler";
import { scheduleSalesDriveSyncs, processSalesDriveSync } from "@/lib/connectors/sync-worker";
import { apiCronSalesdriveSyncRouteMessages as englishCopy } from "@/messages/en.json";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(request:NextRequest) {
  const headers={"Cache-Control":"no-store"};
  if (!cronSecretMatches(request.headers.get('authorization'),process.env.CRON_SECRET)) return NextResponse.json({error:englishCopy.errorUnauthorized},{status:401,headers});
  try { const schedule=await scheduleSalesDriveSyncs(); return NextResponse.json({schedule,worker:await processSalesDriveSync()},{headers}); }
  catch { return NextResponse.json({error:englishCopy.errorSyncUnavailable},{status:503,headers}); }
}
