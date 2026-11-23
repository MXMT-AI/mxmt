import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { startSession } from "@/lib/auth-session";
import { apiError, serverError } from "@/lib/api-contracts";
import { createRequestContext, logError, requestLogContext, withRequestId } from "@/lib/observability";
import { apiAuthLoginRouteMessages as englishCopy } from "@/messages/en.json";

export async function POST(request: NextRequest) {
  const context = createRequestContext(request, "api.auth.login");

  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return withRequestId(apiError(englishCopy.emailAndPasswordAreRequired, 400, "VALIDATION_ERROR", undefined, context.requestId), context.requestId);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: { select: { id: true, name: true } } },
    });

    if (!user || !(await compare(password, user.passwordHash))) {
      return withRequestId(apiError(englishCopy.invalidCredentials, 401, "INVALID_CREDENTIALS", undefined, context.requestId), context.requestId);
    }

    await startSession({ sub: user.id, tenantId: user.tenantId, role: user.role });

    return withRequestId(NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tenant: user.tenant,
      requestId: context.requestId,
    }), context.requestId);
  } catch (err) {
    logError("Login failed", err, requestLogContext(context));
    return withRequestId(serverError(englishCopy.loginFailed, context.requestId), context.requestId);
  }
}
