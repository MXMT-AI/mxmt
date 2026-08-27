import { NextRequest } from "next/server";
import { handleScheduledDataImport } from "@/lib/data-scheduler-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return handleScheduledDataImport(request);
}
