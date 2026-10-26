import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-contracts";
import { getRepricingPreview } from "@/lib/repricing-store";
import { repricingApiError } from "@/lib/repricing-api-error";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
/** Validate and price a bounded scenario from frozen server inputs, without persisting slider state. */
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
    return NextResponse.json(await getRepricingPreview(user.tenantId, data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return repricingApiError(error);
  }
}
