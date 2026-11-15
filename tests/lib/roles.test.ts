import { expect, it } from "vitest";
import { hasRole, type RequiredRole } from "@/lib/roles";

const permissions: Array<[RequiredRole, Record<RequiredRole, boolean>]> = [
  ["VIEWER", { VIEWER: true, ANALYST: false, ADMIN: false, SUPER_ADMIN: false }],
  ["ANALYST", { VIEWER: true, ANALYST: true, ADMIN: false, SUPER_ADMIN: false }],
  ["ADMIN", { VIEWER: true, ANALYST: true, ADMIN: true, SUPER_ADMIN: false }],
  ["SUPER_ADMIN", { VIEWER: true, ANALYST: true, ADMIN: true, SUPER_ADMIN: true }],
];

it.each(permissions)("enforces the permission matrix for %s", (role, expected) => {
  for (const required of Object.keys(expected) as RequiredRole[]) {
    expect(hasRole(role, required)).toBe(expected[required]);
  }
});

it.each(["", "UNKNOWN", "viewer", "admin", "constructor", "__proto__", "toString"])("denies unrecognized role %j", role => {
  for (const required of ["VIEWER", "ANALYST", "ADMIN", "SUPER_ADMIN"] as const) {
    expect(hasRole(role, required)).toBe(false);
  }
});

it.each([
  ["viewer", false, false],
  ["analyst", false, true],
  ["admin", true, true],
  ["super_admin", true, true],
  ["unknown", false, false],
] as const)("preserves reporting permissions after normalizing %s", (role, canImport, canCalculate) => {
  expect(hasRole(role.toUpperCase(), "ADMIN")).toBe(canImport);
  expect(hasRole(role.toUpperCase(), "ANALYST")).toBe(canCalculate);
});
