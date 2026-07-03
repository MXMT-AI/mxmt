import { headers } from "next/headers";

export interface CurrentUser {
  userId: string;
  tenantId: string;
  role: string;
}

/**
 * Read the current authenticated user from request headers.
 * Headers are injected by middleware after JWT verification.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const h = await headers();
  const userId = h.get("x-user-id");
  const tenantId = h.get("x-tenant-id");
  const role = h.get("x-user-role");

  if (!userId || !tenantId || !role) return null;
  return { userId, tenantId, role };
}
