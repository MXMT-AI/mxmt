import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  read: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => ({ value: m.cookies.get(key) }),
  }),
}));
vi.mock("@/lib/salesdrive-issues", () => ({ getSalesDriveIssues: m.read }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { GET } from "@/app/api/data/issues/route";
import { signAccessToken } from "@/lib/auth";
const req = (q = "") =>
  new NextRequest("https://app.test/api/data/issues?source=salesdrive" + q, {
    headers: { "x-tenant-id": "b", "x-user-role": "ADMIN" },
  });
beforeEach(() => {
  vi.stubEnv("JWT_ACCESS_SECRET", "test-secret");
  m.cookies.clear();
  vi.resetAllMocks();
  m.read.mockResolvedValue({ rows: [], pagination: { totalRows: 0 } });
});
afterEach(() => vi.unstubAllEnvs());
it("rejects forged identity headers", async () => {
  expect((await GET(req())).status).toBe(401);
  expect(m.read).not.toHaveBeenCalled();
});
it("permits Viewer diagnostics using only signed tenant identity and bounded query parameters", async () => {
  m.cookies.set(
    "access_token",
    await signAccessToken({ sub: "viewer", tenantId: "a", role: "VIEWER" }),
  );
  const r = await GET(
    req("&page=2&pageSize=25&code=MISSING_COST&skuId=sku-a&severity=WARNING"),
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(m.read).toHaveBeenCalledWith("a", {
    page: 2,
    pageSize: 25,
    code: "MISSING_COST",
    skuId: "sku-a",
    severity: "WARNING",
    importRunId: undefined,
  });
  expect((await GET(req("&page=100001"))).status).toBe(400);
  expect((await GET(req("&severity=INVALID"))).status).toBe(400);
});
it("sanitizes data source failures", async () => {
  m.cookies.set(
    "access_token",
    await signAccessToken({ sub: "viewer", tenantId: "a", role: "VIEWER" }),
  );
  m.read.mockRejectedValueOnce(new Error("private-key"));
  const r = await GET(req());
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("private-key");
});
