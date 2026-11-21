import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { parseJsonBody, isRecord, apiError } from "@/lib/api-contracts";
import { createRepricingInputs } from "@/lib/repricing-store";
import { repricingApiError } from "@/lib/repricing-api-error";
import { configuredReportStorage } from "@/lib/merchandising-publication-storage";
import { readPublishedRepricingInputs } from "@/lib/merchandising-publication";
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
    Object.keys(data).some((k) => k !== "snapshotId") ||
    typeof data.snapshotId !== "string" ||
    !data.snapshotId.trim() ||
    data.snapshotId.length > 200
  )
    return apiError(
      "Invalid screen snapshot identifier",
      400,
      "INVALID_REPRICING_INPUT_REQUEST",
    );
  try {
    const storage = configuredReportStorage(user.tenantId);
    const published = storage && await readPublishedRepricingInputs(user.tenantId, data.snapshotId, storage);
    return NextResponse.json(
      published ?? await createRepricingInputs(user.tenantId, data.snapshotId),
      { status: 201, headers: {
        "Cache-Control": "no-store",
        "X-MXMT-Report-Source": published ? "published" : "postgres",
      } },
    );
  } catch (error) {
    return repricingApiError(error);
  }
}
