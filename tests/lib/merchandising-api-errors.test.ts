import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ requireApiUser: async () => ({ user: { tenantId: "a" }, response: null }) }));
vi.mock("@/lib/merchandising-screen", () => ({ getMerchandisingScreen: mocks.read }));
import { GET } from "@/app/api/merchandising/[screen]/route";
import { ScreenApiError } from "@/lib/merchandising-snapshot";
afterEach(() => { vi.restoreAllMocks(); mocks.read.mockReset(); });
const request = () => new NextRequest("https://app.test/api/merchandising/repricing?snapshotId=s", {
  headers: { "x-request-id": "local-repricing-probe" },
});
it("correlates an unexpected first-open failure with a server log without exposing internal errors", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.read.mockRejectedValueOnce(new Error("Private database transport failure"));
  const response = await GET(request(), { params: Promise.resolve({ screen: "repricing" }) });
  const body = await response.json();
  expect(response.status).toBe(503);
  expect(response.headers.get("x-request-id")).toBe("local-repricing-probe");
  expect(body).toMatchObject({ code: "SCREEN_DATA_UNAVAILABLE", requestId: "local-repricing-probe" });
  expect(JSON.stringify(body)).not.toContain("Private database");
  expect(errorLog).toHaveBeenCalledTimes(1);
  const log = JSON.parse(errorLog.mock.calls[0][0]);
  expect(log).toMatchObject({ level: "error", requestId: "local-repricing-probe", route: "api.merchandising.screen", method: "GET", path: "/api/merchandising/repricing", error: { message: "Private database transport failure" } });
  expect(log).not.toHaveProperty("cookies");
  expect(log).not.toHaveProperty("body");
  expect(mocks.read).toHaveBeenCalledTimes(1);
});
it("keeps expected source-readiness failures distinct and does not log them as crashes", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.read.mockRejectedValueOnce(new ScreenApiError("SHEETS_IMPORT_REQUIRED"));
  const response = await GET(request(), { params: Promise.resolve({ screen: "repricing" }) });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "SHEETS_IMPORT_REQUIRED" });
  expect(response.headers.get("x-request-id")).toBe("local-repricing-probe");
  expect(errorLog).not.toHaveBeenCalled();
});

it.each(["", "   "])("generates one correlated ID for an empty request header (%j)", async (header) => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.read.mockRejectedValueOnce(new Error("Private storage error"));
  const response = await GET(new NextRequest("https://app.test/api/merchandising/repricing?snapshotId=s", {
    headers: { "x-request-id": header },
  }), { params: Promise.resolve({ screen: "repricing" }) });
  const body = await response.json();
  expect(response.status).toBe(503);
  expect(body.requestId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  expect(response.headers.get("x-request-id")).toBe(body.requestId);
  expect(JSON.parse(errorLog.mock.calls[0][0]).requestId).toBe(body.requestId);
});
