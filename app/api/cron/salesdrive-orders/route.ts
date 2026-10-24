import { NextRequest, NextResponse } from "next/server";
import { cronSecretMatches } from "@/lib/data-scheduler";
import { processOrderJob } from "@/lib/connectors/order-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** External scheduler/Vercel invokes once per minute; each invocation processes one page. */
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (!cronSecretMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try { return NextResponse.json(await processOrderJob(), { headers }); }
  catch { return NextResponse.json({ error: "Worker unavailable" }, { status: 503, headers }); }
}
