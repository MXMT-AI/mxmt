import { safeReturnPath, returnLocale } from "@/i18n/redirect";
import { NextRequest, NextResponse } from "next/server";
import { renewSession } from "@/lib/auth-session";
import { createRequestContext, logError, requestLogContext, withRequestId } from "@/lib/observability";
import { apiAuthRefreshRouteMessages as englishCopy } from "@/messages/en.json";

export async function GET(request: NextRequest) {
  const context = createRequestContext(request, "api.auth.silent-refresh");
  const returnTo = request.nextUrl.searchParams.get("next");
  const locale = returnLocale(returnTo, request.cookies.get("lang")?.value);
  const next = new URL(safeReturnPath(returnTo, locale), request.url);
  const loginUrl = new URL(`/${locale}/login`, request.url);
  loginUrl.searchParams.set("next", next.pathname + next.search + next.hash);
  const respond = (response: NextResponse) => {
    response.headers.set("Cache-Control", "private, no-store");
    return withRequestId(response, context.requestId);
  };

  try {
    const error = await renewSession();
    if (!error) return respond(NextResponse.redirect(next));

    const response = NextResponse.redirect(loginUrl);
    if (error === "INVALID_REFRESH_TOKEN") {
      for (const name of ["access_token", "refresh_token", "access_token_exp"]) response.cookies.delete(name);
    }
    return respond(response);
  } catch (err) {
    logError("Silent refresh failed", err, requestLogContext(context));
    return respond(new NextResponse(englishCopy.tokenRefreshFailed, {
      status: 503, headers: { "Retry-After": "5" },
    }));
  }
}
