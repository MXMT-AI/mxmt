import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { parseJsonBody, isRecord, apiError } from "@/lib/api-contracts";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import { screenSnapshotContext } from "@/lib/merchandising-screen";
import { merchandisingApiError } from "@/lib/merchandising-api-error";
import { hasRole } from "@/lib/roles";
import { configuredReportStorage } from "@/lib/merchandising-publication-storage";
import { publishMerchandisingReports } from "@/lib/merchandising-publication";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
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
      (k) => !["dateFrom", "dateTo", "asOf", "publish"].includes(k),
    ) ||
    ["dateFrom", "dateTo", "asOf"].some(
      (k) =>
        data[k] !== undefined &&
        (typeof data[k] !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(String(data[k]))),
    ) ||
    Boolean(data.dateFrom) !== Boolean(data.dateTo) ||
    (data.publish !== undefined && data.publish !== true) ||
    (data.publish === true && (!data.dateFrom || !data.dateTo))
  )
    return apiError(
      "Invalid screen snapshot selection",
      400,
      "INVALID_SCREEN_SELECTION",
    );
  try {
    if (data.publish === true) {
      if (!hasRole(user.role, "ADMIN"))
        return apiError("Publishing requires an administrator", 403, "FORBIDDEN");
      const storage = configuredReportStorage(user.tenantId);
      if (!storage)
        return apiError("Report publication is unavailable", 409, "PUBLICATION_UNAVAILABLE");
      const publication = await publishMerchandisingReports(
        user.tenantId,
        { dateFrom: data.dateFrom as string, dateTo: data.dateTo as string, asOf: data.asOf as string | undefined },
        storage,
      );
      return NextResponse.json(publication, {
        status: 201, headers: { "Cache-Control": "no-store" },
      });
    }
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
