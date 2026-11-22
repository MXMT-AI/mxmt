import { NextRequest, NextResponse } from "next/server";
import { cronSecretMatches } from "@/lib/data-scheduler";
import { processInventoryJob } from "@/lib/connectors/inventory-jobs";
import { apiCronSalesdriveInventoryRouteMessages as englishCopy } from "@/messages/en.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (!cronSecretMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: englishCopy.errorUnauthorized }, { status: 401, headers });
  try { return NextResponse.json(await processInventoryJob(), { headers }); }
  catch { return NextResponse.json({ error: englishCopy.errorWorkerUnavailable }, { status: 503, headers }); }
}
