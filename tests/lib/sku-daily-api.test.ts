import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  calculate: vi.fn(),
  read: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => ({ value: m.cookies.get(key) }),
  }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/sku-daily-store", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/sku-daily-store")>();
  return { ...original, calculateSkuDaily: m.calculate, readSkuDaily: m.read };
});
import { GET } from "@/app/api/data/sku-daily/route";
import { signAccessToken } from "@/lib/auth";
import { DailySkuError } from "@/lib/sku-daily-store";
import {
  resolveDailySkuPeriod,
  DailySkuPeriodError,
} from "@/lib/sku-daily-period";
const req = (q = "") =>
  new NextRequest("https://app.example/api/data/sku-daily" + q, {
    headers: { "x-tenant-id": "b", "x-user-role": "SUPER_ADMIN" },
  });
const login = async (role = "VIEWER") =>
  m.cookies.set(
    "access_token",
    await signAccessToken({ sub: "user", tenantId: "a", role }),
  );
beforeEach(() => {
  vi.stubEnv("JWT_ACCESS_SECRET", "daily-test-secret");
  vi.resetAllMocks();
  m.cookies.clear();
  m.calculate.mockResolvedValue({ calculationId: "calculation" });
  m.read.mockResolvedValue({
    calculationId: "calculation",
    summary: { availability: { ratio: null } },
    rows: [],
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("daily SKU API tenant and snapshot boundary", () => {
  it("does not accept identity headers without a signed session", async () => {
    expect((await GET(req())).status).toBe(401);
    expect(m.calculate).not.toHaveBeenCalled();
  });
  it("allows a reader to calculate and consume derived metrics only in their signed tenant", async () => {
    await login();
    const response = await GET(req("?asOf=2026-10-25"));
    expect(response.status).toBe(200);
    expect(m.calculate).toHaveBeenCalledWith("a", { asOf: "2026-10-25" });
    expect(m.read).toHaveBeenCalledWith(
      "a",
      "calculation",
      expect.objectContaining({ page: 1, pageSize: 25, q: "", sort: "sku" }),
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("reads a frozen calculation without recalculating or changing global summary for a page/search", async () => {
    await login("ANALYST");
    expect(
      (
        await GET(
          req(
            "?calculationId=older&page=2&pageSize=10&q=PRINTWORKS&sort=weeksOnHand&direction=desc",
          ),
        )
      ).status,
    ).toBe(200);
    expect(m.calculate).not.toHaveBeenCalled();
    expect(m.read).toHaveBeenCalledWith("a", "older", {
      page: 2,
      pageSize: 10,
      q: "PRINTWORKS",
      sort: "weeksOnHand",
      direction: "desc",
    });
  });
  it.each([
    "?page=2",
    "?page=1",
    "?pageSize=25",
    "?q=PRINTWORKS",
    "?q=",
    "?sort=sku",
    "?direction=asc",
  ])("requires a frozen ID for navigation controls %s", async (query) => {
    await login();
    const response = await GET(req(query));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("CALCULATION_ID_REQUIRED");
    expect(m.calculate).not.toHaveBeenCalled();
    expect(m.read).not.toHaveBeenCalled();
  });
  it("maps an invalid stored timezone to a sanitized server failure, not INVALID_AS_OF", async () => {
    await login();
    m.calculate.mockImplementation(async () =>
      resolveDailySkuPeriod(
        "2026-10-25",
        new Date("2026-10-25T10:00Z"),
        "Invalid/Timezone",
      ),
    );
    const response = await GET(req("?asOf=2026-10-25"));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("DAILY_CALCULATION_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("Invalid/Timezone");
  });
  it.each([
    "?calculationId=",
    "?calculationId=x&asOf=2026-10-25",
    "?asOf=2026-10-25T00:00Z",
    "?page=0",
    "?pageSize=201",
    "?sort=sku;DROP",
    "?direction=DROP",
    "?q=" + "a".repeat(201),
  ])("rejects invalid bounded query %s", async (query) => {
    await login();
    expect((await GET(req(query))).status).toBe(400);
    expect(m.calculate).not.toHaveBeenCalled();
    expect(m.read).not.toHaveBeenCalled();
  });
  it("returns explicit invalid-date, source and foreign-calculation errors", async () => {
    await login();
    m.calculate.mockRejectedValueOnce(new DailySkuPeriodError("Invalid date"));
    expect((await GET(req("?asOf=2026-02-30"))).status).toBe(400);
    m.calculate.mockRejectedValueOnce(
      new DailySkuError("SALESDRIVE_NOT_CONFIGURED"),
    );
    expect((await GET(req())).status).toBe(409);
    m.read.mockRejectedValueOnce(
      new DailySkuError("DAILY_CALCULATION_NOT_FOUND", 404),
    );
    expect((await GET(req("?calculationId=foreign"))).status).toBe(404);
  });
  it("does not expose SQL or source credentials on unexpected failures", async () => {
    await login();
    m.calculate.mockRejectedValue(new Error("secret database URL"));
    const response = await GET(req());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });
});
