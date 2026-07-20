import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/auth";
import { serverError } from "@/lib/api-contracts";
import { createRequestContext, logError, requestLogContext, withRequestId } from "@/lib/observability";

export async function POST(request: NextRequest) {
  const context = createRequestContext(request, "api.auth.logout");

  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token")?.value;

    if (accessToken) {
      try {
        const payload = await verifyAccessToken(accessToken);
        // Revoke refresh token in DB so it can't be reused
        await prisma.user.update({
          where: { id: payload.sub },
          data: { refreshToken: null },
        });
      } catch {
        // Token already expired — just clear cookies
      }
    }

    cookieStore.delete("access_token");
    cookieStore.delete("refresh_token");

    return withRequestId(NextResponse.json({ ok: true, requestId: context.requestId }), context.requestId);
  } catch (err) {
    logError("Logout failed", err, requestLogContext(context));
    return withRequestId(serverError("Logout failed", context.requestId), context.requestId);
  }
}
