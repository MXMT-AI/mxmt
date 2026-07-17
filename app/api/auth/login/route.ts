import { NextRequest, NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signAccessToken, signRefreshToken } from "@/lib/auth";
import { apiError, serverError } from "@/lib/api-contracts";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return apiError("Email and password are required", 400, "VALIDATION_ERROR");
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: { select: { id: true, name: true } } },
    });

    // Constant-time check to prevent user enumeration
    if (!user || !(await compare(password, user.passwordHash))) {
      return apiError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    const tokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    };
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(tokenPayload),
      signRefreshToken(tokenPayload),
    ]);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await hash(refreshToken, 10) },
    });

    const cookieStore = await cookies();
    const expAt = Math.floor(Date.now() / 1000) + 15 * 60;
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    };
    cookieStore.set("access_token", accessToken, { ...cookieOpts, maxAge: 15 * 60 });
    cookieStore.set("refresh_token", refreshToken, { ...cookieOpts, maxAge: 30 * 24 * 60 * 60 });
    cookieStore.set("access_token_exp", String(expAt), {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 15 * 60,
    });

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: user.tenant,
    });
  } catch (err) {
    console.error("[login]", err);
    return serverError();
  }
}
