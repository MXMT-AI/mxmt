import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/lib/auth";

export async function POST(_request: NextRequest) {
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[logout]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
