import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { parseJsonBody, apiError } from "@/lib/api-contracts";
import { getReorderingPreview } from "@/lib/reordering-store";
import { ReorderingError } from "@/lib/reorder-calc";
import { merchandisingApiError } from "@/lib/merchandising-api-error";
import { configuredReportStorage } from "@/lib/merchandising-publication-storage";
import { readPublishedReorderingPreview } from "@/lib/merchandising-publication";
import { parseReorderingRequest } from "@/lib/reorder-calc";
import { apiMerchandisingReorderingPreviewRouteMessages as englishCopy } from "@/messages/en.json";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser("VIEWER");
  if (response) return response;
  const { data, response: invalid } = await parseJsonBody<unknown>(
    request,
    undefined,
    4 * 1024 * 1024,
  );
  if (invalid) return invalid;
  try {
    const storage = configuredReportStorage(user.tenantId);
    const published = storage && await readPublishedReorderingPreview(user.tenantId, parseReorderingRequest(data), storage);
    return NextResponse.json(published ?? await getReorderingPreview(user.tenantId, data), {
      headers: {
        "Cache-Control": "no-store",
        "X-MXMT-Report-Source": published ? "published" : "postgres",
      },
    });
  } catch (error) {
    return error instanceof ReorderingError
      ? apiError(
          error.status === 400
            ? englishCopy.invalidReorderingRequest
            : englishCopy.reorderingInputsUnavailableCheckThe,
          error.status,
          error.code,
          error.details,
        )
      : merchandisingApiError(error);
  }
}
