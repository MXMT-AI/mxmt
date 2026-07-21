import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signAccessToken, signRefreshToken } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { apiError, serverError } from "@/lib/api-contracts";
import { createRequestContext, logError, requestLogContext, withRequestId } from "@/lib/observability";

export async function POST(request: NextRequest) {
  const context = createRequestContext(request, "api.auth.register");

  try {
    const { businessName, name, email, password } = await request.json();

    if (!businessName || !name || !email || !password) {
      return withRequestId(apiError("All fields are required", 400, "VALIDATION_ERROR", undefined, context.requestId), context.requestId);
    }

    if (password.length < 8) {
      return withRequestId(apiError("Password must be at least 8 characters", 400, "VALIDATION_ERROR", undefined, context.requestId), context.requestId);
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return withRequestId(apiError("Email already registered", 409, "EMAIL_ALREADY_REGISTERED", undefined, context.requestId), context.requestId);
    }

    const slug =
      slugify(businessName) + "-" + Date.now().toString(36);
    const passwordHash = await hash(password, 12);

    // Create tenant + admin user in a single transaction
    const { user, tenant } = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: businessName, slug },
      });
      const user = await tx.user.create({
        data: { email, name, passwordHash, role: "ADMIN", tenantId: tenant.id },
      });
      return { user, tenant };
    });

    const tokenPayload = { sub: user.id, tenantId: tenant.id, role: user.role };
    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(tokenPayload),
      signRefreshToken(tokenPayload),
    ]);

    // Store bcrypt hash of refresh token — raw token never saved
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: await hash(refreshToken, 10) },
    });

    const cookieStore = await cookies();
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    };
    cookieStore.set("access_token", accessToken, {
      ...cookieOpts,
      maxAge: 15 * 60,
    });
    cookieStore.set("refresh_token", refreshToken, {
      ...cookieOpts,
      maxAge: 30 * 24 * 60 * 60,
    });

    return withRequestId(NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: { id: tenant.id, name: tenant.name },
      requestId: context.requestId,
    }), context.requestId);
  } catch (err) {
    logError("Registration failed", err, requestLogContext(context));
    return withRequestId(serverError("Registration failed", context.requestId), context.requestId);
  }
}
