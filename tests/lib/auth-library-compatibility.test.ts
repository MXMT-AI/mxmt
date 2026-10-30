import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compare, hash } from "bcryptjs";
import { errors, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import fixture from "../fixtures/auth-library-compatibility.json";

// Fixed outputs from bcryptjs 2.4.3 / jose 5.10.0: detect cross-version regressions.
const secret = new TextEncoder().encode(fixture.secret);
const verificationTime = { currentDate: new Date("2026-10-29T12:00:00Z") };

describe("stored bcrypt 2 compatibility", () => {
  it.each([
    [fixture.password, fixture.passwordHash],
    [fixture.unicodePassword, fixture.unicodeHash],
    [fixture.validToken, fixture.refreshHash],
  ])("accepts an existing stored hash (case %#)", async (value, storedHash) => {
    expect(await compare(value, storedHash)).toBe(true);
  });

  it("rejects an incorrect password against an existing hash", async () => {
    expect(await compare("incorrect synthetic password", fixture.passwordHash)).toBe(false);
  });

  it("creates and verifies new hashes in the supported 2b format", async () => {
    const storedHash = await hash(fixture.password, 4);
    expect(storedHash.startsWith("$2b$")).toBe(true);
    expect(await compare(fixture.password, storedHash)).toBe(true);
  });
});

describe("jose 5 token compatibility", () => {
  it("verifies the old signature and preserves identity claims", async () => {
    const result = await jwtVerify(fixture.validToken, secret, verificationTime);
    expect(result.payload).toMatchObject(fixture.identity);
    expect(result.protectedHeader.alg).toBe("HS256");
  });

  it("preserves the expiry error class used by middleware", async () => {
    await expect(jwtVerify(fixture.expiredToken, secret, verificationTime))
      .rejects.toBeInstanceOf(errors.JWTExpired);
  });

  it("rejects an old token signed with a different key", async () => {
    await expect(jwtVerify(fixture.validToken, new TextEncoder().encode("wrong synthetic key"), verificationTime))
      .rejects.toBeInstanceOf(errors.JWSSignatureVerificationFailed);
  });
});

describe("middleware with pre-upgrade tokens", () => {
  let middleware: typeof import("../../proxy").proxy;

  beforeAll(async () => {
    vi.stubEnv("JWT_ACCESS_SECRET", fixture.secret);
    middleware = (await import("../../proxy")).proxy;
  });
  afterAll(() => vi.unstubAllEnvs());

  it("forwards the verified legacy identity", async () => {
    const response = await middleware(new NextRequest("https://mxmt.example/uk/dashboard", {
      headers: { cookie: `access_token=${fixture.validToken}` },
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-x-user-id")).toBe(fixture.identity.sub);
    expect(response.headers.get("x-middleware-request-x-tenant-id")).toBe(fixture.identity.tenantId);
  });

  it("sends expired legacy page sessions to silent refresh with the original destination", async () => {
    const response = await middleware(new NextRequest("https://mxmt.example/uk/dashboard?period=month", {
      headers: { cookie: `access_token=${fixture.expiredToken}; refresh_token=synthetic-refresh-cookie` },
    }));
    const destination = new URL(response.headers.get("location")!);
    expect(destination.pathname).toBe("/api/auth/silent-refresh");
    expect(destination.searchParams.get("next")).toBe("/uk/dashboard?period=month");
  });

  it("keeps API expiry failures unauthorized instead of redirecting", async () => {
    const response = await middleware(new NextRequest("https://mxmt.example/api/dependency-probe", {
      headers: { cookie: `access_token=${fixture.expiredToken}; refresh_token=synthetic-refresh-cookie` },
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
