import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/connectors/budget", () => ({ budgetedFetcher: () => (url: URL, init: RequestInit) => fetch(url, init) }));

const mocks = vi.hoisted(() => ({ cookies: new Map<string, string>(), find: vi.fn(), upsert: vi.fn(), update: vi.fn(), source: vi.fn(), transaction: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => ({ value: mocks.cookies.get(key) }) }) }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  connectorConnection: { findUnique: mocks.find, upsert: mocks.upsert, updateMany: mocks.update }, dataSource: { upsert: mocks.source }, $transaction: mocks.transaction,
} }));
import { GET, POST, PUT } from "@/app/api/connectors/salesdrive/route";
import { signAccessToken } from "@/lib/auth";
import { encryptCredentials } from "@/lib/connectors/secrets";

const credentials = { accountHost: "demo.salesdrive.me", ordersApiKey: "orders-private-key", receiptsApiKey: null, ymlUrl: null };
const row = () => ({ accountHost: credentials.accountHost, hasReceiptsKey: false, hasYmlUrl: false, revision: 3, lastCheck: null, source: { timezone: "Europe/Kyiv" },
  encryptedConfig: encryptCredentials(credentials, "tenant-a") });

function request(method = "GET", body?: unknown) {
  return new NextRequest("https://app.example/api/connectors/salesdrive?tenantId=tenant-b", {
    method, headers: { "Content-Type": "application/json", "x-tenant-id": "tenant-b", "x-user-role": "SUPER_ADMIN" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function login(role = "ADMIN", tenantId = "tenant-a") {
  mocks.cookies.set("access_token", await signAccessToken({ sub: "user-a", tenantId, role }));
}

beforeEach(() => {
  vi.stubEnv("JWT_ACCESS_SECRET", "connector-tests-jwt-secret");
  vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", Buffer.alloc(32, 5).toString("base64"));
  mocks.cookies.clear(); vi.clearAllMocks();
  mocks.find.mockResolvedValue(row());
  mocks.source.mockResolvedValue({ id: "source-a" });
  mocks.upsert.mockResolvedValue(row());
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async (operation) => operation({ $queryRaw:async()=>[], $executeRaw:async()=>0, dataSource: { upsert: mocks.source }, connectorConnection: { findUnique:mocks.find,upsert: mocks.upsert } }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("SalesDrive onboarding API authorization", () => {
  it("rejects identity headers without a verified access cookie", async () => {
    expect((await GET(request())).status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it.each(["VIEWER", "ANALYST"])("prevents %s from saving or testing credentials", async (role) => {
    await login(role);
    expect((await PUT(request("PUT", credentials))).status).toBe(403);
    expect((await POST(request("POST"))).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("returns only tenant A's public configuration despite tenant B IDs in headers/query", async () => {
    await login("VIEWER");
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.find.mock.calls[0][0].where).toEqual({ tenantId_provider: { tenantId: "tenant-a", provider: "salesdrive" } });
    const body = await response.text();
    expect(body).not.toMatch(/orders-private-key|encryptedConfig|ordersApiKey|ymlUrl/);
    expect(JSON.parse(body)).toMatchObject({ configured: true, revision: 3 });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
  it("does not expose another tenant's saved connection when this tenant has none", async () => {
    await login("ADMIN", "tenant-b");
    mocks.find.mockImplementation(async ({ where }) => where.tenantId_provider.tenantId === "tenant-a" ? row() : null);
    expect(await (await GET(request())).json()).toMatchObject({ configured: false, accountHost: null, lastCheck: null });
  });
});

describe("SalesDrive write-only configuration", () => {
  it("encrypts writes, scopes the source, invalidates prior checks and never echoes credentials", async () => {
    await login();
    const response = await PUT(request("PUT", credentials));
    expect(response.status).toBe(200);
    const saved = mocks.upsert.mock.calls[0][0];
    expect(saved.create.tenantId).toBe("tenant-a");
    expect(saved.create.encryptedConfig).toMatch(/^v1\./);
    expect(saved.create.encryptedConfig).not.toContain("orders-private-key");
    expect(saved.update).toMatchObject({ revision: { increment: 1 }, checkedAt: null });
    expect(mocks.source.mock.calls[0][0].create).toMatchObject({ tenantId: "tenant-a", kind: "SALESDRIVE" });
    expect(await response.text()).not.toContain("orders-private-key");
  });
  it("rejects tenant overrides and unsafe URLs before any storage or outbound request", async () => {
    await login();
    expect((await PUT(request("PUT", { ...credentials, tenantId: "tenant-b" }))).status).toBe(400);
    expect((await PUT(request("PUT", { ...credentials, accountHost: "127.0.0.1" }))).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("bounds chunked request bodies even without Content-Length", async () => {
    await login();
    const response = await PUT(request("PUT", { ...credentials, ordersApiKey: "x".repeat(20_000) }));
    expect(response.status).toBe(413);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("never logs or returns raw storage errors or caller-controlled request IDs", async () => {
    await login();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.find.mockRejectedValue(new Error("orders-private-key secret-feed-token"));
    const req = request(); req.headers.set("x-request-id", "orders-private-key");
    const response = await GET(req);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/orders-private-key|secret-feed-token/);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/orders-private-key|secret-feed-token/);
  });
  it("fails closed when secure storage has not been configured", async () => {
    await login(); vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await PUT(request("PUT", credentials));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "CONNECTOR_STORAGE_UNAVAILABLE" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("persisted read-only connection checks", () => {
  function configureFetch() {
    const fetcher = vi.fn(async (url: URL) => Response.json(url.pathname === "/api/statuses/" ? { success: true, data: [] } : { status: "success", data: [], pagination: { pageCount: 0 } }));
    vi.stubGlobal("fetch", fetcher);
    return fetcher;
  }
  it("shows independent success and missing-scope results without credentials", async () => {
    await login(); const fetcher = configureFetch();
    const response = await POST(request("POST", { tenantId: "tenant-b", url: "http://localhost" }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.lastCheck.checks).toEqual([{ resource: "orders", code: "OK" }, { resource: "statuses", code: "OK" }, { resource: "receipts", code: "NOT_CONFIGURED" }, { resource: "catalog", code: "NOT_CONFIGURED" }]);
    expect(JSON.stringify(result)).not.toContain("orders-private-key");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(mocks.update.mock.calls[0][0].where).toEqual({ tenantId: "tenant-a", provider: "salesdrive", revision: 3 });
  });
  it("rejects stale checks after credentials change", async () => {
    await login(); configureFetch(); mocks.update.mockResolvedValue({ count: 0 });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await POST(request("POST"));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CONNECTOR_CONFIG_CHANGED" });
  });
  it("requires a saved connection before probing the source", async () => {
    await login(); mocks.find.mockResolvedValue(null);
    expect((await POST(request("POST"))).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
