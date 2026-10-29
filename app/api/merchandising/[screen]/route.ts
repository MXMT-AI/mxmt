import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { apiError } from "@/lib/api-contracts";
import {
  SCREEN_NAMES,
  parseScreenQuery,
  type ScreenName,
} from "@/lib/merchandising-screen-query";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import { merchandisingApiError } from "@/lib/merchandising-api-error";
import { createRequestContext, withRequestId } from "@/lib/observability";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ screen: string }> },
) {
  const context = createRequestContext(request, "api.merchandising.screen");
  const { user, response } = await requireApiUser("VIEWER");
  if (response) return response;
  const { screen } = await params;
  if (!SCREEN_NAMES.includes(screen as ScreenName))
    return apiError("Unknown merchandising screen", 404, "SCREEN_NOT_FOUND");
  try {
    const query = parseScreenQuery(
      request.nextUrl.searchParams,
      screen as ScreenName,
    );
    return NextResponse.json(
      await getMerchandisingScreen(user.tenantId, screen as ScreenName, query),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return withRequestId(merchandisingApiError(error, context), context.requestId);
  }
}
