import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  get: vi.fn(),
  read: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => ({ value: m.cookies.get(key) }),
  }),
}));
vi.mock("@/lib/sales-report", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/sales-report")>();
  return {
    ...original,
    getSalesReport: m.get,
    readPublishedSalesReport: m.read,
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { GET } from "@/app/api/data/sales/route";
import { signAccessToken } from "@/lib/auth";
import { SalesReportError } from "@/lib/sales-report";
import { calculateSalesReport } from "@/lib/sales-report-calculation";
import { resolveSalesPeriod, SalesPeriodError } from "@/lib/sales-period";
import { defaultClientSettings } from "@/lib/merchandising-settings";
function req(q = "") {
  return new NextRequest("https://app.example/api/data/sales" + q, {
    headers: { "x-tenant-id": "b", "x-user-role": "SUPER_ADMIN" },
  });
}
async function login(role = "VIEWER") {
  m.cookies.set(
    "access_token",
    await signAccessToken({ sub: "user", tenantId: "a", role }),
  );
}
function fixture() {
  const report = calculateSalesReport([], {
    period: resolveSalesPeriod({ now: new Date("2026-10-25T10:00Z") }),
    history: { current: false, ly: false },
    settings: defaultClientSettings(),
  });
  return {
    ...report,
    calculationRunId: "report",
    inputKey: "abc",
    calculatedAt: "2026-10-25T10:00Z",
    provenance: { sourceId: "source" },
  };
}
beforeEach(() => {
  vi.stubEnv("JWT_ACCESS_SECRET", "sales-test-secret");
  vi.resetAllMocks();
  m.cookies.clear();
  m.get.mockResolvedValue(fixture());
  m.read.mockResolvedValue(fixture());
});
afterEach(() => vi.unstubAllEnvs());
describe("authenticated deterministic sales report API", () => {
  it("rejects forged identity headers without a signed session", async () => {
    expect((await GET(req())).status).toBe(401);
    expect(m.get).not.toHaveBeenCalled();
  });
  it("allows a reader to load reports only in their signed tenant", async () => {
    await login();
    const response = await GET(
      req("?dateFrom=2026-10-01&dateTo=2026-10-15&view=channels"),
    );
    expect(response.status).toBe(200);
    expect(m.get).toHaveBeenCalledWith("a", {
      dateFrom: "2026-10-01",
      dateTo: "2026-10-15",
    });
    const body = await response.json();
    expect(body.view).toBe("channels");
    expect(body.articles).toBeUndefined();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it.each([
    "?view=unknown",
    "?page=0",
    "?pageSize=201",
    "?direction=drop",
    "?format=json",
    "?calculationRunId=",
  ])("rejects invalid read boundaries %s", async (q) => {
    await login();
    expect((await GET(req(q))).status).toBe(400);
    expect(m.get).not.toHaveBeenCalled();
  });
  it("reads an explicit frozen report without recalculation and sanitizes storage failures", async () => {
    await login();
    expect((await GET(req("?calculationRunId=report"))).status).toBe(200);
    expect(m.read).toHaveBeenCalledWith("a", "report");
    expect(m.get).not.toHaveBeenCalled();
    m.read.mockRejectedValue(new Error("secret database URL"));
    const response = await GET(req("?calculationRunId=other"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });
  it("uses explicit period and import errors instead of successful empty financial totals", async () => {
    await login();
    m.get.mockRejectedValueOnce(new SalesPeriodError("Invalid period"));
    expect((await GET(req())).status).toBe(400);
    m.get.mockRejectedValueOnce(new SalesReportError("SALES_IMPORT_NOT_READY"));
    expect((await GET(req())).status).toBe(409);
  });
  it("requires a frozen calculation for CSV and exports server numbers without recomputing", async () => {
    await login();
    expect((await GET(req("?format=csv"))).status).toBe(400);
    const response = await GET(
      req("?format=csv&view=brands&calculationRunId=report"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(await response.text()).toContain('"Formula version";"1"');
    expect(m.get).not.toHaveBeenCalled();
  });
  it("bounds search and safely quotes text fields in CSV", async () => {
    await login();
    const f = fixture();
    f.brands = [
      {
        revenueDelta: null,
        unitsDelta: null,
        coveredMarginBelowTarget: null,
        marginTargetPct: "0.45",
        id: "brand",
        name: '=HYPERLINK("https://example.test")',
        currency: "UAH",
        current: {
          currency: "UAH",
          revenue: "10",
          units: "1",
          orderCount: 1,
          returnOrderCount: 0,
          coveredRevenue: "10",
          coveredGrossProfit: "4",
          gmPct: "0.4",
          lineCount: 1,
          missingRevenueCount: 0,
          missingProfitCount: 0,
          coverage: "COMPLETE",
        },
        ly: {
          currency: "UAH",
          revenue: "0",
          units: "0",
          orderCount: 0,
          returnOrderCount: 0,
          coveredRevenue: "0",
          coveredGrossProfit: "0",
          gmPct: null,
          lineCount: 0,
          missingRevenueCount: 0,
          missingProfitCount: 0,
          coverage: "COMPLETE",
        },
        revenueChangePct: null,
        comparisonReason: "LY_NON_POSITIVE",
      },
    ];
    m.read.mockResolvedValue(f);
    const response = await GET(
      req("?format=csv&view=brands&calculationRunId=report"),
    );
    expect(await response.text()).toContain("'\u003dHYPERLINK");
    expect((await GET(req("?q=" + "a".repeat(201)))).status).toBe(400);
  });
});
it("localizes CSV headers using the explicitly requested page locale", async () => {
  await login();
  const response = await GET(req("?format=csv&view=brands&calculationRunId=report&locale=uk"));
  expect(response.status).toBe(200);
  const csv = await response.text();
  expect(csv).toContain('"Версія формули";"1"');
  expect(csv).toContain('"Назва"');
  expect(m.get).not.toHaveBeenCalled();
  expect((await GET(req("?format=csv&calculationRunId=report&locale=fr"))).status).toBe(400);
});
