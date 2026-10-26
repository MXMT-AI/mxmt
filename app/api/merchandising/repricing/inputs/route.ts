import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { parseJsonBody, isRecord, apiError } from "@/lib/api-contracts";
import { createRepricingInputs } from "@/lib/repricing-store";
import { repricingApiError } from "@/lib/repricing-api-error";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
/** Derive immutable inputs for a signed tenant; this cannot update prices or create an action log. */
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
    return NextResponse.json(
      await createRepricingInputs(user.tenantId, data.snapshotId),
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return repricingApiError(error);
  }
}
