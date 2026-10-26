import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { parseJsonBody, apiError } from "@/lib/api-contracts";
import { getReorderingPreview } from "@/lib/reordering-store";
import { ReorderingError } from "@/lib/reorder-calc";
import { merchandisingApiError } from "@/lib/merchandising-api-error";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
/** Derive tenant-scoped read-only scenarios; this never sends an order or records an export. */
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
    return NextResponse.json(await getReorderingPreview(user.tenantId, data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return error instanceof ReorderingError
      ? apiError(
          error.status === 400
            ? "Invalid reordering request."
            : "Reordering inputs unavailable. Check the snapshot and scenario settings.",
          error.status,
          error.code,
          error.details,
        )
      : merchandisingApiError(error);
  }
}
