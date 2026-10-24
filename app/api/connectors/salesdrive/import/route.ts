import { NextRequest, NextResponse } from "next/server";
import { apiError, isRecord, parseJsonBody } from "@/lib/api-contracts";
import { requireApiUser } from "@/lib/server-auth";
import { withRequestId } from "@/lib/observability";
import { enqueueOrderImport, getOrderImportProgress, processOrderJob, resumeOrderImport } from "@/lib/connectors/order-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function handle(request: NextRequest, read: boolean) {
  const requestId = crypto.randomUUID();
  const respond = (response: NextResponse) => { response.headers.set("Cache-Control", "no-store"); return withRequestId(response, requestId); };
  const { user, response } = await requireApiUser(read ? undefined : "ADMIN", requestId);
  if (response) return respond(response);
  try {
    if (!read) {
      const body = await parseJsonBody(request, requestId, 2048);
      if (body.response) return respond(body.response);
      const action = isRecord(body.data) ? body.data.action : null;
      if (action === "backfill" || action === "incremental") await enqueueOrderImport(user.tenantId, action === "backfill" ? "BACKFILL" : "INCREMENTAL");
      else if (action === "resume") await resumeOrderImport(user.tenantId);
      else if (action === "step") await processOrderJob(user.tenantId);
      else return respond(apiError("Choose backfill, incremental, resume or step", 400, "INVALID_ACTION", undefined, requestId));
    }
    return respond(NextResponse.json({ job: await getOrderImportProgress(user.tenantId) }));
  } catch (error) {
    const code = error instanceof Error && ["BACKFILL_REQUIRED", "NOT_CONFIGURED", "INVALID_SOURCE_MAPPING"].includes(error.message) ? error.message : "IMPORT_UNAVAILABLE";
    return respond(apiError("Order import is unavailable; check the connection and source mapping", code === "IMPORT_UNAVAILABLE" ? 503 : 409, code, undefined, requestId));
  }
}
export async function GET(request: NextRequest) { return handle(request, true); }
export async function POST(request: NextRequest) { return handle(request, false); }
