import { NextRequest, NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/auth";
import { apiError, serverError } from "@/lib/api-contracts";
import { createRequestContext, logError, requestLogContext, withRequestId } from "@/lib/observability";

export async function POST(request: NextRequest) {
  const context = createRequestContext(request, "api.auth.refresh");

  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("refresh_token")?.value;

    if (!refreshToken) {
      return withRequestId(apiError("No refresh token", 401, "NO_REFRESH_TOKEN", undefined, context.requestId), context.requestId);
    }

    let payload;
    try {
      payload = await verifyRefreshToken(refreshToken);
    } catch {
      return withRequestId(apiError("Invalid refresh token", 401, "INVALID_REFRESH_TOKEN", undefined, context.requestId), context.requestId);
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.refreshToken) {
      return withRequestId(apiError("Session revoked", 401, "SESSION_REVOKED", undefined, context.requestId), context.requestId);
    }

    const valid = await compare(refreshToken, user.refreshToken);
    if (!valid) {
      return withRequestId(apiError("Refresh token mismatch", 401, "REFRESH_TOKEN_MISMATCH", undefined, context.requestId), context.requestId);
    }

    // Rotate both tokens
    const tokenPayload = { sub: user.id, tenantId: user.tenantId, role: user.role };
    const [newAccessToken, newRefreshToken] = await Promise.all([
      signAccessToken(tokenPayload),
      signRefreshToken(tokenPayload),
    ]);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await hash(newRefreshToken, 10) },
    });

    const expAt = Math.floor(Date.now() / 1000) + 15 * 60;
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    };
    cookieStore.set("access_token", newAccessToken, { ...cookieOpts, maxAge: 15 * 60 });
    cookieStore.set("refresh_token", newRefreshToken, { ...cookieOpts, maxAge: 30 * 24 * 60 * 60 });
    cookieStore.set("access_token_exp", String(expAt), {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 15 * 60,
    });

    return withRequestId(NextResponse.json({ ok: true, requestId: context.requestId }), context.requestId);
  } catch (err) {
    logError("Token refresh failed", err, requestLogContext(context));
    return withRequestId(serverError("Token refresh failed", context.requestId), context.requestId);
  }
}
