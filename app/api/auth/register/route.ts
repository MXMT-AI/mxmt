import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signAccessToken, signRefreshToken } from "@/lib/auth";
import { slugify } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const { businessName, name, email, password } = await request.json();

    if (!businessName || !name || !email || !password) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
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

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: { id: tenant.id, name: tenant.name },
    });
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
