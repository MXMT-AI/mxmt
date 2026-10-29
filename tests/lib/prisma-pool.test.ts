import { describe, expect, it } from "vitest";
import { prismaPoolOptions } from "@/lib/prisma-pool";

describe("Prisma native pg pool compatibility", () => {
  it("keeps the pooled endpoint/TLS and translates supported Prisma limits", () => {
    const options = prismaPoolOptions("postgresql://user:synthetic@project-pooler.region.neon.tech/db?sslmode=require&connection_limit=3&connect_timeout=7&pgbouncer=true");
    const url = new URL(options.connectionString);
    expect(url.hostname).toBe("project-pooler.region.neon.tech");
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.has("connection_limit")).toBe(false);
    expect(url.searchParams.has("pgbouncer")).toBe(false);
    expect(options).toMatchObject({ max: 3, connectionTimeoutMillis: 7000, idleTimeoutMillis: 300000 });
  });
  it("bounds defaults and fails closed without an ambient localhost connection", () => {
    expect(prismaPoolOptions()).toMatchObject({ max: 10, connectionTimeoutMillis: 5000 });
    expect(new URL(prismaPoolOptions().connectionString).hostname).toBe("unconfigured.invalid");
  });
  it.each(["0", "-1", "1.5", "NaN"])("rejects invalid limits: %s", value => {
    expect(() => prismaPoolOptions(`postgresql://synthetic/db?connection_limit=${value}`)).toThrow("Invalid database option");
  });
});
