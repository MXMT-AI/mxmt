import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ requireApiUser: m.auth }));
vi.mock("@/lib/drive-connection", async original => ({
  ...await original<typeof import("@/lib/drive-connection")>(), readDriveConnection: m.read, saveDriveConnection: m.save,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { GET, PUT } from "@/app/api/settings/google-sheets/route";
import { DriveConnectionError } from "@/lib/drive-connection";
const connection = { fileId: "demo_workbook_12345", revision: 1, origin: "tenant" };
const request = (body: unknown) => new NextRequest("https://app.test/api/settings/google-sheets", {
  method: "PUT", headers: { "content-type": "application/json", "x-tenant-id": "forged" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ user: { tenantId: "demo", userId: "owner", role: "ADMIN" }, response: null });
  m.read.mockResolvedValue(connection); m.save.mockResolvedValue(connection);
});
it("reads only the signed session's cabinet without caching its configuration", async () => {
  const response = await GET();
  expect(m.read).toHaveBeenCalledWith("demo");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ connection });
});
it("saves only for the session's tenant and actor and requires ADMIN", async () => {
  const response = await PUT(request({ url: "demo_workbook_12345", revision: 0 }));
  expect(response.status).toBe(200); expect(m.auth).toHaveBeenCalledWith("ADMIN");
  expect(m.save).toHaveBeenCalledWith("demo", "owner", "demo_workbook_12345", 0);
});
it("rejects a forged tenant in the body", async () => {
  expect((await PUT(request({ url: "demo_workbook_12345", revision: 0, tenantId: "zavod" }))).status).toBe(400);
  expect(m.save).not.toHaveBeenCalled();
});
it("does not read or write configuration when authentication fails", async () => {
  m.auth.mockResolvedValue({ user: null, response: NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 }) });
  expect((await GET()).status).toBe(401);
  expect((await PUT(request({}))).status).toBe(401);
  expect(m.read).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled();
});
it("returns revision conflicts and sanitizes unexpected database errors", async () => {
  m.save.mockRejectedValueOnce(new DriveConnectionError("SHEETS_CONNECTION_CHANGED", 409));
  expect((await PUT(request({ url: "demo_workbook_12345", revision: 0 }))).status).toBe(409);
  m.save.mockRejectedValueOnce(Error("private database credentials"));
  const response = await PUT(request({ url: "demo_workbook_12345", revision: 0 }));
  expect(response.status).toBe(500); expect(await response.text()).not.toContain("private database");
});
