import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localReportStorage } from "@/lib/merchandising-publication-storage";
import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: async () => [] } }));
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
import { defaultClientSettings } from "@/lib/merchandising-settings";
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
    sourceState: { timezone: "Europe/Kyiv" },
    modelVersion: 1,
    createdAt: "2026-10-25T10:00:00Z",
    sales: {
      calculationId: "sales",
      calculationVersion: 1,
      context: {
        settings: defaultClientSettings(),
        period: { from: "2026-09-01", to: "2026-09-30" },
      },
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
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
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
      expect(response.headers.get("X-MXMT-Report-Source")).toBe("postgres");
      expect(m.read).toHaveBeenCalledWith(
        "a",
        screen,
        expect.objectContaining({ snapshotId: "snapshot" }),
      );
      expect(m.create).not.toHaveBeenCalled();
    },
  );
  it("serves a warm Redis hit and a Redis outage from the published snapshot without Postgres", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mxmt-report-cache-"));
    const hash = createHash("sha256").update("a").digest("hex");
    const version = "69c81de3-1d8d-4eec-a691-01642d0b2bbf";
    const path = `merchandising/v1/${hash}`;
    const publication = localReportStorage(directory);
    const report = { screen: "overview", context: { snapshotId: "snapshot" } };
    const publishedAt = "2026-10-29T12:00:00Z";
    try {
      await publication.write(`${path}/active.json`, JSON.stringify({
        version, snapshotId: "snapshot", navigation: { monobrand: false }, publishedAt,
      }));
      await publication.write(`${path}/${version}/overview.json`, JSON.stringify(report));
      vi.stubEnv("VERCEL", "");
      vi.stubEnv("MERCHANDISING_PUBLISHED_TENANTS", "a");
      vi.stubEnv("MERCHANDISING_PUBLICATION_DIR", directory);
      vi.stubEnv("UPSTASH_REDIS_REST_URL", "http://127.0.0.1:3199");
      vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-cache-token");

      const commands: string[] = [];
      let cached: string | null = null;
      let offline = false;
      const fetchRedis = vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("http://127.0.0.1:3199/pipeline");
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-cache-token");
        const [[command, key, value, expiry, seconds]] = JSON.parse(String(init.body));
        expect(key).toBe(`${path}/${version}/overview.json`);
        commands.push(command);
        if (offline) return Response.json({ error: "Redis unavailable" }, { status: 503 });
        if (command === "get") return Response.json([{ result: cached }]);
        expect([command, expiry, seconds]).toEqual(["set", "ex", 2592000]);
        cached = value;
        return Response.json([{ result: "OK" }]);
      });
      vi.stubGlobal("fetch", fetchRedis);
      await login();

      for (const cacheOffline of [false, false, true]) {
        offline = cacheOffline;
        const response = await route("overview");
        expect(response.status).toBe(200);
        expect(response.headers.get("X-MXMT-Report-Source")).toBe("published");
        expect(await response.json()).toEqual({ ...report, publishedAt });
      }
      expect(commands).toEqual(["get", "set", "get", "get"]);
      expect(m.read).not.toHaveBeenCalled();
      expect(m.create).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
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
  it("rejects publishing a shared snapshot as a viewer", async () => {
    await login();
    const response = await POST(request("", JSON.stringify({
      publish: true, dateFrom: "2026-09-01", dateTo: "2026-09-30",
    })));
    expect(response.status).toBe(403);
    expect(m.create).not.toHaveBeenCalled();
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
    [
      "sales",
      "?snapshotId=x&classification=DEAD",
      "STOCK_FILTER_ON_SALES_VIEW",
    ],
  ])(
    "describes invalid %s queries without suggesting synchronization",
    async (screen, q, code) => {
      await login();
      const response = await route(screen, q);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Invalid merchandising screen query.",
        code,
      });
      expect(m.read).not.toHaveBeenCalled();
    },
  );
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
      error:
        "Merchandising data unavailable. Check the selected snapshot, source and import progress.",
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

describe("Sales workspace query boundary", () => {
  it("accepts validated Sales display controls in the signed tenant", async () => {
    await login();
    expect(
      (
        await route(
          "sales",
          "?snapshotId=snapshot&groupBy=category&measure=units&metric=gmPct&others=1&page=2&channelPage=3",
        )
      ).status,
    ).toBe(200);
    expect(m.read).toHaveBeenCalledWith(
      "a",
      "sales",
      expect.objectContaining({
        groupBy: "category",
        measure: "units",
        metric: "gmPct",
        others: true,
        page: 2,
        channelPage: 3,
      }),
    );
  });
  it.each([
    "measure=usd",
    "metric=profit",
    "others=0",
    "channelPage=0",
    "channelPage=1.5",
    "channelPage=100001",
    "measure=money&measure=units",
  ])("rejects malformed Sales controls: %s", async (q) => {
    await login();
    expect((await route("sales", "?snapshotId=snapshot&" + q)).status).toBe(
      400,
    );
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each(["overview", "stock", "repricing", "reordering"])(
    "does not leak Sales controls into %s",
    async (screen) => {
      await login();
      expect(
        (await route(screen, "?snapshotId=snapshot&measure=units")).status,
      ).toBe(400);
      expect(m.read).not.toHaveBeenCalled();
    },
  );
});

describe("Stock workspace query boundary", () => {
  it("accepts independent Stock pages and validated category sorting", async () => {
    await login();
    expect(
      (
        await route(
          "stock",
          "?snapshotId=snapshot&categoryPage=2&brandPage=3&categorySort=RISK&categoryDirection=asc&classification=RISK",
        )
      ).status,
    ).toBe(200);
    expect(m.read).toHaveBeenCalledWith(
      "a",
      "stock",
      expect.objectContaining({
        categoryPage: 2,
        brandPage: 3,
        categorySort: "RISK",
        categoryDirection: "asc",
        classification: "RISK",
      }),
    );
  });
  it.each([
    "categoryPage=0",
    "brandPage=1.5",
    "brandPage=100001",
    "categoryPage=2&categoryPage=3",
    "categorySort=sql",
    "categoryDirection=up",
  ])("rejects malformed Stock controls: %s", async (q) => {
    await login();
    expect((await route("stock", "?snapshotId=snapshot&" + q)).status).toBe(
      400,
    );
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each(["overview", "sales", "repricing", "reordering"])(
    "rejects Stock-only controls on %s",
    async (screen) => {
      await login();
      expect(
        (await route(screen, "?snapshotId=snapshot&categoryPage=2")).status,
      ).toBe(400);
      expect(m.read).not.toHaveBeenCalled();
    },
  );
});
