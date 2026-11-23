import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { startSession } from "@/lib/auth-session";
import { slugify } from "@/lib/utils";
import { apiError, serverError } from "@/lib/api-contracts";
import { createRequestContext, logError, requestLogContext, withRequestId } from "@/lib/observability";
import { apiAuthRegisterRouteMessages as englishCopy } from "@/messages/en.json";

export async function POST(request: NextRequest) {
  const context = createRequestContext(request, "api.auth.register");

  try {
    const { businessName, name, email, password } = await request.json();

    if (!businessName || !name || !email || !password) {
      return withRequestId(apiError(englishCopy.allFieldsAreRequired, 400, "VALIDATION_ERROR", undefined, context.requestId), context.requestId);
    }

    if (password.length < 8) {
      return withRequestId(apiError(englishCopy.passwordMustBeAtLeast, 400, "VALIDATION_ERROR", undefined, context.requestId), context.requestId);
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return withRequestId(apiError(englishCopy.emailAlreadyRegistered, 409, "EMAIL_ALREADY_REGISTERED", undefined, context.requestId), context.requestId);
    }

    const slug =
      slugify(businessName) + "-" + Date.now().toString(36);
    const passwordHash = await hash(password, 12);

    const { user, tenant } = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: businessName, slug },
      });
      const user = await tx.user.create({
        data: { email, name, passwordHash, role: "ADMIN", tenantId: tenant.id },
      });
      return { user, tenant };
    });

    await startSession({ sub: user.id, tenantId: tenant.id, role: user.role });

    return withRequestId(NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: { id: tenant.id, name: tenant.name },
      requestId: context.requestId,
    }), context.requestId);
  } catch (err) {
    logError("Registration failed", err, requestLogContext(context));
    return withRequestId(serverError(englishCopy.registrationFailed, context.requestId), context.requestId);
  }
}
