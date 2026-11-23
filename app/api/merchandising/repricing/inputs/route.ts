import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { parseJsonBody, isRecord, apiError } from "@/lib/api-contracts";
import { createRepricingInputs } from "@/lib/repricing-store";
import { repricingApiError } from "@/lib/repricing-api-error";
import { merchandisingReportResponse } from "@/lib/merchandising-report-response";
import { readPublishedRepricingInputs } from "@/lib/merchandising-publication";
import { apiMerchandisingRepricingInputsRouteMessages as englishCopy } from "@/messages/en.json";
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
      englishCopy.invalidScreenSnapshotIdentifier,
      400,
      "INVALID_REPRICING_INPUT_REQUEST",
    );
  try {
    const { snapshotId } = data;
    return await merchandisingReportResponse(
      user.tenantId,
      (storage) => readPublishedRepricingInputs(user.tenantId, snapshotId, storage),
      () => createRepricingInputs(user.tenantId, snapshotId),
      201,
    );
  } catch (error) {
    return repricingApiError(error);
  }
}
