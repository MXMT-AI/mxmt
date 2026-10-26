import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const m = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  create: vi.fn(),
  history: vi.fn(),
  file: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => ({ value: m.cookies.get(key) }),
  }),
}));
vi.mock("@/lib/scenario-export-store", async (original) => ({
  ...(await original<typeof import("@/lib/scenario-export-store")>()),
  createScenarioExport: m.create,
  readScenarioExportHistory: m.history,
  readScenarioExportFile: m.file,
}));
import { POST, GET } from "@/app/api/merchandising/exports/route";
import { GET as download } from "@/app/api/merchandising/exports/[exportId]/route";
import { signAccessToken } from "@/lib/auth";
import { ScenarioExportError } from "@/lib/scenario-export-store";
const id = "11111111-1111-4111-8111-111111111111";
const request = (query = "", body?: string) =>
  new NextRequest(`https://app.test/api/merchandising/exports${query}`, {
    ...(body !== undefined ? { method: "POST", body } : {}),
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": "b",
      "x-user-role": "SUPER_ADMIN",
    },
  });
async function login(role = "ANALYST") {
  m.cookies.set(
    "access_token",
    await signAccessToken({ sub: "owner", tenantId: "a", role }),
  );
}
beforeEach(() => {
  vi.stubEnv("JWT_ACCESS_SECRET", "scenario-export-api-test");
  vi.resetAllMocks();
  m.cookies.clear();
  m.create.mockResolvedValue({ exportId: id });
  m.history.mockResolvedValue({ rows: [] });
  const content = '\uFEFF"sku"\r\n"001"\r\n';
  m.file.mockResolvedValue({
    content,
    name: "export.csv",
    byteLength: Buffer.byteLength(content),
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("export API RBAC and bytes", () => {
  it("denies forged identity headers and viewer export/download attempts", async () => {
    expect((await POST(request("", "{}"))).status).toBe(401);
    await login("VIEWER");
    expect((await POST(request("", "{}"))).status).toBe(403);
    expect(
      (
        await download(request("?fileId=abc"), {
          params: Promise.resolve({ exportId: id }),
        })
      ).status,
    ).toBe(403);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.file).not.toHaveBeenCalled();
  });
  it("exports only in the signed analyst tenant and exposes history to authenticated viewers", async () => {
    await login();
    const response = await POST(request("", "{}"));
    expect(response.status).toBe(201);
    expect(m.create).toHaveBeenCalledWith("a", "owner", {});
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    await login("VIEWER");
    expect((await GET(request("?kind=reorder"))).status).toBe(200);
    expect(m.history).toHaveBeenCalledWith("a", "reorder");
  });
  it("returns original BOM bytes with attachment headers and tenant-scoped file lookup", async () => {
    await login();
    const response = await download(request("?fileId=abc"), {
      params: Promise.resolve({ exportId: id }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="export.csv"',
    );
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 3)).toEqual(
      Buffer.from([239, 187, 191]),
    );
    expect(m.file).toHaveBeenCalledWith("a", id, "abc");
  });
  it("rejects malformed/big bodies and ambiguous history/download queries", async () => {
    await login();
    expect((await POST(request("", "{"))).status).toBe(400);
    expect(
      (await POST(request("", '"' + "x".repeat(4 * 1024 * 1024) + '"'))).status,
    ).toBe(413);
    expect(m.create).not.toHaveBeenCalled();
    expect((await GET(request("?kind=reorder&kind=reprice"))).status).toBe(400);
    expect(
      (
        await download(request("?fileId=a&fileId=b"), {
          params: Promise.resolve({ exportId: id }),
        })
      ).status,
    ).toBe(404);
  });
  it("preserves expected conflicts while redacting unexpected database failures", async () => {
    await login();
    m.create.mockRejectedValueOnce(
      new ScenarioExportError("EXPORT_ID_CONFLICT", 409),
    );
    const conflict = await POST(request("", "{}"));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "EXPORT_ID_CONFLICT" });
    m.create.mockRejectedValueOnce(new Error("password=secret"));
    const failed = await POST(request("", "{}"));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret");
  });
});
