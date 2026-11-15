const ROLE_RANK = {
  VIEWER: 0,
  ANALYST: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
} as const;

export type RequiredRole = keyof typeof ROLE_RANK;

export function hasRole(userRole: string, requiredRole: RequiredRole): boolean {
  if (!Object.hasOwn(ROLE_RANK, userRole)) return false;
  return ROLE_RANK[userRole as RequiredRole] >= ROLE_RANK[requiredRole];
}
