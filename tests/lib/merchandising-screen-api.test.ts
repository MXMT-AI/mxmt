import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const m = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  create: vi.fn(),
  read: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => ({ value: m.cookies.get(key) }),
  }),
}));
vi.mock("@/lib/merchandising-snapshot", async (original) => ({
  ...(await original<typeof import("@/lib/merchandising-snapshot")>()),
  createScreenSnapshot: m.create,
}));
vi.mock("@/lib/merchandising-screen", async (original) => ({
  ...(await original<typeof import("@/lib/merchandising-screen")>()),
  getMerchandisingScreen: m.read,
}));
import { GET } from "@/app/api/merchandising/[screen]/route";
import { POST } from "@/app/api/merchandising/snapshots/route";
import { signAccessToken } from "@/lib/auth";
import { ScreenApiError } from "@/lib/merchandising-snapshot";
import { SalesPeriodError } from "@/lib/sales-period";
const request = (query = "", body?: string) =>
  new NextRequest(`https://app.test/api/merchandising/stock${query}`, {
    headers: {
      "x-tenant-id": "b",
      "x-user-role": "SUPER_ADMIN",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { method: "POST", body } : {}),
  });
const route = (screen = "stock", q = "?snapshotId=snapshot") =>
  GET(request(q), { params: Promise.resolve({ screen }) });
async function login(role = "VIEWER") {
  m.cookies.set(
    "access_token",
    await signAccessToken({ sub: "user", tenantId: "a", role }),
  );
}
beforeEach(() => {
  vi.stubEnv("JWT_ACCESS_SECRET", "merchandising-api-test-secret");
  vi.resetAllMocks();
  m.cookies.clear();
  m.read.mockResolvedValue({
    context: { snapshotId: "snapshot" },
    table: { rows: [] },
  });
  m.create.mockResolvedValue({
    snapshotId: "snapshot",
    sourceId: "source",
    sourceState: {timezone:"Europe/Kyiv"},
    modelVersion: 1,
    createdAt: "2026-10-25T10:00:00Z",
    sales: {
      calculationId: "sales",
      calculationVersion: 1,
      context: { period: { from: "2026-09-01", to: "2026-09-30" } },
    },
    stock: {
      calculationId: "daily",
      calculationVersion: 2,
      asOf: "2026-10-25",
      cutoff: "2026-10-25T10:00:00Z",
    },
    settings: { clientConfigId: "client", configIds: ["client"] },
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("merchandising API snapshot and RBAC boundary", () => {
  it("denies forged identity headers without a signed session", async () => {
    expect((await route()).status).toBe(401);
    expect((await POST(request("", "{}"))).status).toBe(401);
    expect(m.read).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it.each(["overview", "sales", "stock", "repricing", "reordering"])(
    "serves %s only in the signed tenant and never recalculates on navigation",
    async (screen) => {
      await login();
      const response = await route(screen);
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(m.read).toHaveBeenCalledWith(
        "a",
        screen,
        expect.objectContaining({ snapshotId: "snapshot" }),
      );
      expect(m.create).not.toHaveBeenCalled();
    },
  );
  it("allows a viewer to create a derived context without source/settings activation", async () => {
    await login();
    const response = await POST(
      request(
        "",
        JSON.stringify({
          dateFrom: "2026-09-01",
          dateTo: "2026-09-30",
          asOf: "2026-10-25",
        }),
      ),
    );
    expect(response.status).toBe(201);
    expect(m.create).toHaveBeenCalledWith("a", {
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      asOf: "2026-10-25",
    });
    expect((await response.json()).context.calculationIds).toEqual({
      sales: "sales",
      stock: "daily",
    });
  });
  it("rejects unrecognized signed roles", async () => {
    await login("UNKNOWN");
    expect((await route()).status).toBe(403);
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each([
    "",
    "?snapshotId=",
    "?snapshotId=x&snapshotId=y",
    "?snapshotId=x&dateFrom=2026-09-01",
    "?snapshotId=x&calculationRunId=other",
    "?snapshotId=x&tenantId=b",
    "?snapshotId=x&page=0",
    "?snapshotId=x&pageSize=201",
    "?snapshotId=x&sort=revenue;DROP",
    "?snapshotId=x&direction=sideways",
    "?snapshotId=x&groupBy=channel",
    "?snapshotId=x&classification=bad",
    "?snapshotId=x&currency=ANYTHING",
    "?snapshotId=x&search=" + "a".repeat(201),
  ])("rejects incompatible or unbounded frozen query %s", async (q) => {
    await login();
    expect((await route("stock", q)).status).toBe(400);
    expect(m.read).not.toHaveBeenCalled();
  });
  it("retains strict pagination controls and reserves stock filters for stock views", async () => {
    await login();
    expect(
      (await route("sales", "?snapshotId=x&classification=DEAD")).status,
    ).toBe(400);
    expect(
      (await route("stock", "?snapshotId=x&pageSize=1&channelId=1")).status,
    ).toBe(200);
    expect(m.read).toHaveBeenCalledWith(
      "a",
      "stock",
      expect.objectContaining({ pageSize: 1, channelId: "1" }),
    );
  });
  it("rejects missing brand selections for the brand reordering mode", async () => {
    await login();
    expect((await route("reordering", "?snapshotId=x&mode=brand")).status).toBe(
      400,
    );
  });
  it.each([
    ["stock", "?snapshotId=x&sort=invalid", "INVALID_SCREEN_QUERY"],
    ["reordering", "?snapshotId=x&mode=brand", "BRAND_REQUIRED"],
    ["sales", "?snapshotId=x&classification=DEAD", "STOCK_FILTER_ON_SALES_VIEW"],
  ])("describes invalid %s queries without suggesting synchronization", async (screen, q, code) => {
    await login();
    const response = await route(screen, q);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid merchandising screen query.",
      code,
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each([
    '{"tenantId":"b"}',
    '{"dateFrom":"2026-09-01"}',
    '{"asOf":"not-a-date"}',
    "[]",
    "{invalid",
  ])("validates context creation %s", async (body) => {
    await login();
    expect((await POST(request("", body))).status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("bounds streamed snapshot input bytes", async () => {
    await login();
    expect(
      (await POST(request("", JSON.stringify({ asOf: "x".repeat(3000) }))))
        .status,
    ).toBe(413);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("does not leak the existence of foreign snapshots", async () => {
    await login();
    m.read.mockRejectedValue(
      new ScreenApiError("SCREEN_SNAPSHOT_NOT_FOUND", 404),
    );
    const response = await route();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Merchandising data unavailable. Check the selected snapshot, source and import progress.",
      code: "SCREEN_SNAPSHOT_NOT_FOUND",
    });
  });
  it("maps invalid calendar periods and sanitizes internal failures", async () => {
    await login();
    m.create.mockRejectedValueOnce(
      new SalesPeriodError("Select a valid reporting period."),
    );
    expect(
      (
        await POST(
          request(
            "",
            JSON.stringify({ dateFrom: "2026-02-31", dateTo: "2026-03-01" }),
          ),
        )
      ).status,
    ).toBe(400);
    m.read.mockRejectedValueOnce(new Error("private database credentials"));
    const response = await route();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private");
  });
  it("rejects unknown screens", async () => {
    await login();
    expect((await route("unknown")).status).toBe(404);
  });
});
