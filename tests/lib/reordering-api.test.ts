import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const m = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  preview: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => ({ value: m.cookies.get(key) }),
  }),
}));
vi.mock("@/lib/reordering-store", () => ({ getReorderingPreview: m.preview }));
import { POST } from "@/app/api/merchandising/reordering/preview/route";
import { signAccessToken } from "@/lib/auth";
import { ReorderingError } from "@/lib/reorder-calc";
const request = (body: string) =>
  new NextRequest("https://app.test/api/merchandising/reordering/preview", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": "b",
      "x-user-role": "SUPER_ADMIN",
    },
  });
async function login(role = "VIEWER") {
  m.cookies.set(
    "access_token",
    await signAccessToken({ sub: "user", tenantId: "a", role }),
  );
}
beforeEach(() => {
  vi.stubEnv("JWT_ACCESS_SECRET", "reordering-api-test-secret");
  vi.resetAllMocks();
  m.cookies.clear();
  m.preview.mockResolvedValue({ previewId: "preview" });
});
afterEach(() => vi.unstubAllEnvs());
describe("signed-tenant reordering preview boundary", () => {
  it("rejects forged identity headers without a signed session", async () => {
    expect((await POST(request('{"snapshotId":"frozen"}'))).status).toBe(401);
    expect(m.preview).not.toHaveBeenCalled();
  });
  it("permits viewer calculation only for the signed tenant, with no cache", async () => {
    await login();
    const r = await POST(request('{"snapshotId":"frozen"}'));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(m.preview).toHaveBeenCalledWith("a", { snapshotId: "frozen" });
  });
  it("rejects unsupported signed roles", async () => {
    await login("FORGED");
    expect((await POST(request("{}"))).status).toBe(403);
    expect(m.preview).not.toHaveBeenCalled();
  });
  it("rejects malformed or oversized streams before invoking the calculator", async () => {
    await login();
    expect((await POST(request("{"))).status).toBe(400);
    expect(
      (await POST(request('"' + "x".repeat(4 * 1024 * 1024) + '"'))).status,
    ).toBe(413);
    expect(m.preview).not.toHaveBeenCalled();
  });
  it("returns field errors and redacts unexpected internal failures", async () => {
    await login();
    m.preview.mockRejectedValueOnce(
      new ReorderingError("INVALID_REORDERING_REQUEST", 400, [
        "parameters.moq: invalid integer",
      ]),
    );
    const invalid = await POST(request("{}"));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      code: "INVALID_REORDERING_REQUEST",
      details: ["parameters.moq: invalid integer"],
    });
    m.preview.mockRejectedValueOnce(new Error("database password=secret"));
    const failed = await POST(request("{}"));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret");
  });
});
