import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth";
import { apiError } from "@/lib/api-contracts";

export interface CurrentUser {
  userId: string;
  tenantId: string;
  role: string;
}

export class AuthError extends Error {
  status = 401;
  code = "UNAUTHORIZED";

  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends Error {
  status = 403;
  code = "FORBIDDEN";

  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

const ROLE_RANK: Record<string, number> = {
  VIEWER: 0,
  ANALYST: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

export type RequiredRole = keyof typeof ROLE_RANK;

function hasRole(userRole: string, requiredRole: RequiredRole): boolean {
  return (ROLE_RANK[userRole] ?? -1) >= ROLE_RANK[requiredRole];
}

/**
 * Resolve the current authenticated user.
 *
 * Prefer validating the httpOnly access token directly in the route handler.
 * Middleware-injected headers are kept only as a compatibility fallback.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  if (token) {
    try {
      const payload = await verifyAccessToken(token);
      if (payload.type === "access") {
        return {
          userId: payload.sub,
          tenantId: payload.tenantId,
          role: payload.role,
        };
      }
    } catch {
      return null;
    }
  }

  const h = await headers();
  const userId = h.get("x-user-id");
  const tenantId = h.get("x-tenant-id");
  const role = h.get("x-user-role");

  if (!userId || !tenantId || !role) return null;
  return { userId, tenantId, role };
}

export async function requireCurrentUser(requiredRole?: RequiredRole): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError();

  if (requiredRole && !hasRole(user.role, requiredRole)) {
    throw new ForbiddenError();
  }

  return user;
}

export async function requireApiUser(requiredRole?: RequiredRole): Promise<
  | { user: CurrentUser; response: null }
  | { user: null; response: NextResponse }
> {
  try {
    return { user: await requireCurrentUser(requiredRole), response: null };
  } catch (error) {
    if (error instanceof AuthError || error instanceof ForbiddenError) {
      return {
        user: null,
        response: apiError(error.message, error.status, error.code),
      };
    }

    return {
      user: null,
      response: apiError("Authentication failed", 500, "AUTH_ERROR"),
    };
  }
}
