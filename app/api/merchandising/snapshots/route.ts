import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { parseJsonBody, isRecord, apiError } from "@/lib/api-contracts";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import { screenSnapshotContext } from "@/lib/merchandising-screen";
import { merchandisingApiError } from "@/lib/merchandising-api-error";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
/** Derived snapshots follow #35's reader contract; this cannot activate source/settings or execute actions. */
export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser("VIEWER");
  if (response) return response;
  const { data, response: invalid } = await parseJsonBody<unknown>(
    request,
    undefined,
    2048,
  );
  if (invalid) return invalid;
  if (
    !isRecord(data) ||
    Object.keys(data).some(
      (k) => !["dateFrom", "dateTo", "asOf"].includes(k),
    ) ||
    ["dateFrom", "dateTo", "asOf"].some(
      (k) =>
        data[k] !== undefined &&
        (typeof data[k] !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(String(data[k]))),
    ) ||
    Boolean(data.dateFrom) !== Boolean(data.dateTo)
  )
    return apiError(
      "Invalid screen snapshot selection",
      400,
      "INVALID_SCREEN_SELECTION",
    );
  try {
    const snapshot = await createScreenSnapshot(
      user.tenantId,
      data as { dateFrom?: string; dateTo?: string; asOf?: string },
    );
    return NextResponse.json(
      {
        snapshotId: snapshot.snapshotId,
        context: screenSnapshotContext(snapshot),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return merchandisingApiError(error);
  }
}
