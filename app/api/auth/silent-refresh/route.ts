import { NextRequest, NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/auth";

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

// Called by middleware when access token is expired but refresh token exists.
// Refreshes tokens, sets cookies, then redirects back to the original page.
export async function GET(request: NextRequest) {
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"));

  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("refresh_token")?.value;

    if (!refreshToken) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    let payload;
    try {
      payload = await verifyRefreshToken(refreshToken);
    } catch {
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.delete("access_token");
      res.cookies.delete("refresh_token");
      return res;
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.refreshToken) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const valid = await compare(refreshToken, user.refreshToken);
    if (!valid) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

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

    return NextResponse.redirect(new URL(next, request.url));
  } catch (err) {
    console.error("[silent-refresh]", err);
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
