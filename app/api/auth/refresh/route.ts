import { NextRequest, NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/auth";

export async function POST(_request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("refresh_token")?.value;

    if (!refreshToken) {
      return NextResponse.json({ error: "No refresh token" }, { status: 401 });
    }

    let payload;
    try {
      payload = await verifyRefreshToken(refreshToken);
    } catch {
      return NextResponse.json(
        { error: "Invalid refresh token" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.refreshToken) {
      return NextResponse.json({ error: "Session revoked" }, { status: 401 });
    }

    const valid = await compare(refreshToken, user.refreshToken);
    if (!valid) {
      return NextResponse.json(
        { error: "Refresh token mismatch" },
        { status: 401 }
      );
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[refresh]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
