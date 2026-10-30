import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, isRecord, parseJsonBody, serverError } from "@/lib/api-contracts";
import { DriveConnectionError, readDriveConnection, saveDriveConnection } from "@/lib/drive-connection";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  return error instanceof DriveConnectionError
    ? apiError(error.code, error.status, error.code)
    : serverError("Could not save Google Sheets connection");
}
export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  try { return NextResponse.json({ connection: await readDriveConnection(user.tenantId) }, { headers }); }
  catch (error) { return failure(error); }
}
export async function PUT(request: NextRequest) {
  const { user, response } = await requireApiUser("ADMIN");
  if (response) return response;
  const body = await parseJsonBody(request, crypto.randomUUID(), 4096);
  if (body.response) return body.response;
  if (!isRecord(body.data) || Object.keys(body.data).some(k => !["url", "revision"].includes(k)))
    return apiError("Expected url and revision", 400, "INVALID_CONNECTION_BODY");
  try {
    return NextResponse.json({ connection: await saveDriveConnection(user.tenantId, user.userId, body.data.url, body.data.revision) }, { headers });
  } catch (error) { return failure(error); }
}
