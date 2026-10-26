import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const m = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  create: vi.fn(),
  preview: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => ({ value: m.cookies.get(key) }),
  }),
}));
vi.mock("@/lib/repricing-store", () => ({
  createRepricingInputs: m.create,
  getRepricingPreview: m.preview,
}));
import { POST as inputs } from "@/app/api/merchandising/repricing/inputs/route";
import { POST as preview } from "@/app/api/merchandising/repricing/preview/route";
import { signAccessToken } from "@/lib/auth";
import { RepricingError } from "@/lib/repricing";
const request = (body: string) =>
  new NextRequest("https://app.test/api/merchandising/repricing", {
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
  vi.stubEnv("JWT_ACCESS_SECRET", "repricing-api-test-secret");
  vi.resetAllMocks();
  m.cookies.clear();
  m.create.mockResolvedValue({ inputSetId: "inputs" });
  m.preview.mockResolvedValue({ previewId: "preview" });
});
afterEach(() => vi.unstubAllEnvs());
describe("repricing signed-tenant API boundary", () => {
  it("denies forged headers without authentication", async () => {
    expect((await inputs(request('{"snapshotId":"s"}'))).status).toBe(401);
    expect((await preview(request("{}"))).status).toBe(401);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.preview).not.toHaveBeenCalled();
  });
  it("permits derived viewer previews only in the signed tenant, with no cache", async () => {
    await login();
    const created = await inputs(request('{"snapshotId":"s"}'));
    expect(created.status).toBe(201);
    expect(created.headers.get("Cache-Control")).toBe("no-store");
    expect(m.create).toHaveBeenCalledWith("a", "s");
    const result = await preview(request('{"inputSetId":"inputs"}'));
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(m.preview).toHaveBeenCalledWith("a", { inputSetId: "inputs" });
  });
  it("rejects unsupported signed roles", async () => {
    await login("FORGED");
    expect((await preview(request("{}"))).status).toBe(403);
    expect(m.preview).not.toHaveBeenCalled();
  });
  it.each([
    "{}",
    '{"snapshotId":"s","tenantId":"b"}',
    '{"snapshotId":12}',
    '{"snapshotId":" "}',
  ])("rejects input body %s", async (body) => {
    await login();
    expect((await inputs(request(body))).status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("bounds both request streams before invoking services", async () => {
    await login();
    expect(
      (
        await inputs(
          request(
            JSON.stringify({ snapshotId: "s", padding: "x".repeat(2048) }),
          ),
        )
      ).status,
    ).toBe(413);
    expect(
      (await preview(request('"' + "x".repeat(4 * 1024 * 1024) + '"'))).status,
    ).toBe(413);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.preview).not.toHaveBeenCalled();
  });
  it("returns typed field errors and redacts unexpected internal failures", async () => {
    await login();
    m.preview.mockRejectedValueOnce(
      new RepricingError("INVALID_REPRICING_REQUEST", 400, [
        "parameters.sharePct: invalid integer or step",
      ]),
    );
    const response = await preview(request("{}"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_REPRICING_REQUEST",
      details: ["parameters.sharePct: invalid integer or step"],
    });
    m.preview.mockRejectedValueOnce(new Error("database password=secret"));
    const failed = await preview(request("{}"));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret");
  });
});
