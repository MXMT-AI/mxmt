import { NextRequest, NextResponse } from "next/server";
import { endSession } from "@/lib/auth-session";
import { serverError } from "@/lib/api-contracts";
import { createRequestContext, logError, requestLogContext, withRequestId } from "@/lib/observability";
import { apiAuthLogoutRouteMessages as englishApiMessages } from "@/messages/en.json";

export async function POST(request: NextRequest) {
  const context = createRequestContext(request, "api.auth.logout");

  try {
    await endSession();

    return withRequestId(NextResponse.json({ ok: true, requestId: context.requestId }), context.requestId);
  } catch (err) {
    logError("Logout failed", err, requestLogContext(context));
    return withRequestId(serverError(englishApiMessages.logoutFailed, context.requestId), context.requestId);
  }
}
