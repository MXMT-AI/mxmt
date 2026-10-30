import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hash } from "bcryptjs";
import { SignJWT } from "jose";

const requestContext = vi.hoisted(() => {
  vi.stubEnv("JWT_ACCESS_SECRET", "auth-security-test-access-secret");
  vi.stubEnv("JWT_REFRESH_SECRET", "auth-security-test-refresh-secret");
  return {
    cookies: new Map<string, string>(),
    headers: new Headers(),
    findUser: vi.fn(),
    updateUser: vi.fn(),
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = requestContext.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => requestContext.cookies.set(name, value),
    delete: (name: string) => requestContext.cookies.delete(name),
  }),
  headers: async () => requestContext.headers,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: requestContext.findUser, update: requestContext.updateUser } },
}));

import { requireApiUser } from "@/lib/server-auth";
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from "@/lib/auth";
import { GET } from "@/app/api/auth/silent-refresh/route";

const userIdentity = { sub: "user-1", tenantId: "tenant-1", role: "ANALYST" };

afterAll(() => vi.unstubAllEnvs());

describe("API authentication", () => {
  beforeEach(() => {
    requestContext.cookies.clear();
    requestContext.headers = new Headers({
      "x-user-id": "forged-user",
      "x-tenant-id": "forged-tenant",
      "x-user-role": "SUPER_ADMIN",
    });
  });

  it("rejects identity headers when the access cookie is missing", async () => {
    const { user, response } = await requireApiUser("ADMIN", "header-only-request");

    expect(user).toBeNull();
    expect(response?.status).toBe(401);
    expect(await response?.json()).toMatchObject({
      code: "UNAUTHORIZED",
      requestId: "header-only-request",
    });
  });

  it("uses the verified token identity instead of conflicting headers", async () => {
    requestContext.cookies.set("access_token", await signAccessToken(userIdentity));

    const { user, response } = await requireApiUser("ANALYST");

    expect(response).toBeNull();
    expect(user).toEqual({ userId: "user-1", tenantId: "tenant-1", role: "ANALYST" });
  });

  it("does not let identity headers elevate the verified role", async () => {
    requestContext.cookies.set("access_token", await signAccessToken(userIdentity));

    const { user, response } = await requireApiUser("ADMIN", "role-request");

    expect(user).toBeNull();
    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({ code: "FORBIDDEN", requestId: "role-request" });
  });

  it.each([
    { name: "malformed", type: "access", expired: false, wrongSignature: false, malformed: true },
    { name: "expired", type: "access", expired: true, wrongSignature: false, malformed: false },
    { name: "incorrectly signed", type: "access", expired: false, wrongSignature: true, malformed: false },
    { name: "wrong-type", type: "refresh", expired: false, wrongSignature: false, malformed: false },
  ])("rejects $name tokens even when identity headers are present", async (scenario) => {
    const token = scenario.malformed ? "not-a-jwt" : await new SignJWT({
      ...userIdentity,
      type: scenario.type,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(scenario.expired ? 0 : "1h")
      .sign(new TextEncoder().encode(
        scenario.wrongSignature ? "untrusted-test-key" : "auth-security-test-access-secret"
      ));
    requestContext.cookies.set("access_token", token);

    const { user, response } = await requireApiUser();

    expect(user).toBeNull();
    expect(response?.status).toBe(401);
    expect(await response?.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("silent refresh redirects", () => {
  let refreshToken: string;
  let storedRefreshToken: string;

  beforeAll(async () => {
    refreshToken = await signRefreshToken(userIdentity);
    storedRefreshToken = await hash(refreshToken, 4);
  });

  beforeEach(() => {
    requestContext.cookies.clear();
    requestContext.cookies.set("refresh_token", refreshToken);
    requestContext.findUser.mockReset().mockResolvedValue({
      id: "user-1",
      tenantId: "tenant-1",
      role: "ANALYST",
      refreshToken: storedRefreshToken,
    });
    requestContext.updateUser.mockReset().mockResolvedValue(undefined);
  });

  it("falls back to the dashboard for a slash-backslash external destination", async () => {
    const query = new URLSearchParams({ next: "/\\example.com/path" });

    const response = await GET(new NextRequest(`https://mxmt.example/api/auth/silent-refresh?${query}`));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://mxmt.example/uk/dashboard");
  });

  it.each([
    "https://example.com/path",
    "//example.com/path",
    "///example.com/path",
    "/\\mxmt.example/path",
    "/\t/example.com/path",
    "/\n/example.com/path",
    "/\r/example.com/path",
    "javascript:alert(1)",
    "data-reporting",
    "",
  ])("falls back for an unsafe destination decoded from the query: %j", async (next) => {
    const query = new URLSearchParams({ next });

    const response = await GET(new NextRequest(`https://mxmt.example/api/auth/silent-refresh?${query}`));

    expect(response.headers.get("location")).toBe("https://mxmt.example/uk/dashboard");
  });

  it.each([
    "/",
    "/data-reporting?dateFrom=2026-09-01&dateTo=2026-09-30",
    "/dashboard#sales",
    "/settings?source=https%3A%2F%2Fexample.com",
    "/settings?filter=%2F%2Fexample.com",
  ])("preserves the internal destination %s", async (next) => {
    const query = new URLSearchParams({ next });

    const response = await GET(new NextRequest(`https://mxmt.example/api/auth/silent-refresh?${query}`));

    expect(response.headers.get("location")).toBe(`https://mxmt.example/uk${next === "/" ? "" : next}`);
  });

  it("uses the dashboard when no destination was provided", async () => {
    const response = await GET(new NextRequest("https://mxmt.example/api/auth/silent-refresh"));

    expect(response.headers.get("location")).toBe("https://mxmt.example/uk/dashboard");
  });

  it("renews a valid session and preserves the request ID", async () => {
    const response = await GET(new NextRequest("https://mxmt.example/api/auth/silent-refresh", {
      headers: { "x-request-id": "refresh-request" },
    }));

    expect(response.headers.get("x-request-id")).toBe("refresh-request");
    expect(await verifyAccessToken(requestContext.cookies.get("access_token")!)).toMatchObject({
      ...userIdentity,
      type: "access",
    });
    expect(await verifyRefreshToken(requestContext.cookies.get("refresh_token")!)).toMatchObject({
      ...userIdentity,
      type: "refresh",
    });
  });

  it("requires a refresh cookie before returning to a destination", async () => {
    requestContext.cookies.clear();

    const response = await GET(new NextRequest("https://mxmt.example/api/auth/silent-refresh?next=%2Fdata-reporting"));

    expect(response.headers.get("location")).toBe("https://mxmt.example/uk/login?next=%2Fuk%2Fdata-reporting");
    expect(requestContext.cookies.has("access_token")).toBe(false);
  });

  it("clears invalid session cookies and returns to login", async () => {
    requestContext.cookies.set("refresh_token", "not-a-jwt");
    requestContext.cookies.set("access_token", "expired-access-token");

    const response = await GET(new NextRequest("https://mxmt.example/api/auth/silent-refresh?next=%2Fdata-reporting"));

    expect(response.headers.get("location")).toBe("https://mxmt.example/uk/login?next=%2Fuk%2Fdata-reporting");
    expect(response.cookies.get("access_token")).toMatchObject({ value: "", expires: new Date(0) });
    expect(response.cookies.get("refresh_token")).toMatchObject({ value: "", expires: new Date(0) });
  });
});
describe("localized silent refresh", () => {
  it("preserves English on an expired session failure", async () => {
    requestContext.cookies.clear();
    const response = await GET(new NextRequest("https://mxmt.example/api/auth/silent-refresh?next=%2Fen%2Fsales%3Fcurrency%3DEUR"));
    const destination = new URL(response.headers.get("location")!);
    expect(destination.pathname).toBe("/en/login");
    expect(destination.searchParams.get("next")).toBe("/en/sales?currency=EUR");
  });
});
