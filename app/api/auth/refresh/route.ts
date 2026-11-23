import { NextRequest, NextResponse } from "next/server";
import { renewSession } from "@/lib/auth-session";
import { apiError, serverError } from "@/lib/api-contracts";
import { createRequestContext, logError, requestLogContext, withRequestId } from "@/lib/observability";
import { apiAuthRefreshRouteMessages as englishCopy } from "@/messages/en.json";

const errorMessages = {
  NO_REFRESH_TOKEN: englishCopy.noRefreshToken,
  INVALID_REFRESH_TOKEN: englishCopy.invalidRefreshToken,
  SESSION_REVOKED: englishCopy.sessionRevoked,
  REFRESH_TOKEN_MISMATCH: englishCopy.refreshTokenMismatch,
};

export async function POST(request: NextRequest) {
  const context = createRequestContext(request, "api.auth.refresh");
  const respond = (response: NextResponse) => {
    response.headers.set("Cache-Control", "private, no-store");
    return withRequestId(response, context.requestId);
  };
  try {
    const error = await renewSession();
    return respond(error
      ? apiError(errorMessages[error], 401, error, undefined, context.requestId)
      : NextResponse.json({ ok: true, requestId: context.requestId }));
  } catch (err) {
    logError("Token refresh failed", err, requestLogContext(context));
    return respond(serverError(englishCopy.tokenRefreshFailed, context.requestId));
  }
}
