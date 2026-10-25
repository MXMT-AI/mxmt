import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { resolveSalesPeriod, SalesPeriodError } from "@/lib/sales-period";
import { calculateSalesReport } from "@/lib/sales-report-calculation";
import { defaultClientSettings } from "@/lib/merchandising-settings";
import type { SalesFact, SalesMetricContext } from "@/lib/sales-metrics";
import {
  normalizeOrder,
  type OrderPolicy,
} from "@/lib/connectors/order-normalization";
import { salesHistoryCoverage } from "@/lib/sales-report";
const period = resolveSalesPeriod({
  dateFrom: "2026-10-01",
  dateTo: "2026-10-15",
  now: new Date("2026-10-25T10:00Z"),
});
const context: SalesMetricContext = {
  period,
  history: { current: true, ly: true },
  settings: {
    ...defaultClientSettings(),
    planCurrency: "UAH",
    monthlyPlans: { "2026-10": "3100" },
  },
};
function fact(overrides: Partial<SalesFact> = {}): SalesFact {
  return {
    id: "line",
    sourceId: "source",
    orderId: "order",
    skuId: "sku",
    sku: "SKU",
    name: "Item",
    brandId: "brand",
    brand: "Brand",
    categoryId: "category",
    category: "Category",
    channelId: "1",
    channel: "Store",
    productKind: "MERCHANDISE",
    ownership: "OWN",
    commissionRate: null,
    kind: "SALE",
    statusId: 5,
    date: "2026-10-05",
    paidDate: "2026-10-05",
    revenue: "100",
    cost: "60",
    quantity: "1",
    currency: "UAH",
    excluded: false,
    stale: false,
    dateInferred: false,
    projectMappingUnavailable: false,
    ...overrides,
  };
}
const total = (facts: SalesFact[], ctx = context) =>
  calculateSalesReport(facts, ctx).summary[0];
describe("shared financial calculations", () => {
  it("uses signed returns once on the actual return date, with distinct sale orders", () => {
    const rows = [
      fact(),
      fact({ id: "second", skuId: "sku2", quantity: "2" }),
      fact({
        id: "refund",
        orderId: "refund",
        kind: "RETURN",
        date: "2026-10-10",
        paidDate: "2026-09-01",
        revenue: "-50",
        cost: "-30",
        quantity: "-0.5",
      }),
    ];
    const row = total(rows);
    expect(row.current).toMatchObject({
      revenue: "150",
      units: "2.5",
      coveredGrossProfit: "60",
      gmPct: "0.4",
      orderCount: 1,
      returnOrderCount: 1,
    });
    expect(
      total([rows[2]], {
        ...context,
        period: resolveSalesPeriod({
          dateFrom: "2026-09-01",
          dateTo: "2026-09-30",
          now: new Date("2026-10-25T10:00Z"),
        }),
      }).current.revenue,
    ).toBe("0");
  });
  it("keeps missing-cost revenue outside the covered margin denominator", () => {
    const row = total([
      fact(),
      fact({ id: "missing", revenue: "900", cost: null }),
    ]);
    expect(row.current).toMatchObject({
      revenue: "1000",
      coveredRevenue: "100",
      coveredGrossProfit: "40",
      gmPct: "0.4",
      missingProfitCount: 1,
      coverage: "PARTIAL",
    });
    expect(
      calculateSalesReport([fact({ cost: null })], context).issues,
    ).toContainEqual(
      expect.objectContaining({ code: "MISSING_COST", count: 1 }),
    );
    expect(total([fact({ cost: "0" })]).current.coveredGrossProfit).toBeNull();
  });
  it("uses commission for consignment and preserves unknown ownership and commission", () => {
    expect(
      total([
        fact({ ownership: "CONSIGNMENT", commissionRate: "0.25", cost: null }),
      ]).current.coveredGrossProfit,
    ).toBe("25");
    expect(
      total([
        fact({ ownership: "CONSIGNMENT", commissionRate: "0", cost: null }),
      ]).current.coveredGrossProfit,
    ).toBe("0");
    for (const row of [
      fact({ ownership: "UNKNOWN" }),
      fact({ ownership: "CONSIGNMENT" }),
    ])
      expect(total([row]).current.gmPct).toBeNull();
  });
  it("includes service revenue, separates gift/unknown movements, and never invents service profit", () => {
    const r = calculateSalesReport(
      [
        fact(),
        fact({
          id: "service",
          productKind: "SERVICE",
          revenue: "50",
          cost: "10",
        }),
        fact({ id: "gift", productKind: "GIFT_CARD", revenue: "1000" }),
        fact({ id: "unknown", productKind: "UNKNOWN", revenue: "2000" }),
      ],
      context,
    );
    expect(r.summary[0].current).toMatchObject({
      revenue: "150",
      units: "1",
      coveredRevenue: "100",
      coveredGrossProfit: "40",
      missingProfitCount: 1,
    });
    expect(
      r.components.find((c) => c.id === "GIFT_CARD")?.current.revenue,
    ).toBe("1000");
  });
  it("keeps only paid preorders separate and does not count refusal or excluded rows", () => {
    const r = calculateSalesReport(
      [
        fact(),
        fact({ id: "pre", kind: "PREORDER", statusId: 33, revenue: "300" }),
        fact({
          id: "unpaid",
          kind: "PREORDER",
          statusId: 33,
          paidDate: null,
          revenue: "700",
        }),
        fact({ id: "refused", kind: "REFUSAL" }),
        fact({ id: "excluded", excluded: true }),
      ],
      context,
    );
    expect(r.summary[0].current.revenue).toBe("100");
    expect(r.preorders[0]).toMatchObject({ paidAmount: "300", orderCount: 1 });
  });
  it("preserves missing amounts, zero net revenue, negative returns and LY zero as unavailable ratios", () => {
    expect(total([fact({ revenue: null })]).current).toMatchObject({
      revenue: null,
      coveredGrossProfit: null,
      gmPct: null,
    });
    expect(
      total([
        fact(),
        fact({
          id: "return",
          kind: "RETURN",
          revenue: "-100",
          cost: "-60",
          quantity: "-1",
        }),
      ]).current,
    ).toMatchObject({ revenue: "0", coveredGrossProfit: "0", gmPct: null });
    expect(total([fact()])).toMatchObject({
      revenueChangePct: null,
      comparisonReason: "LY_NON_POSITIVE",
    });
    expect(
      total([
        fact({ kind: "RETURN", revenue: "-100", cost: "-60", quantity: "-1" }),
      ]).current.coveredGrossProfit,
    ).toBe("-40");
  });
  it("compares same-date LY and requires explicit imported history coverage", () => {
    const rows = [
      fact({ revenue: "120" }),
      fact({ id: "ly", date: "2025-10-05", paidDate: "2025-10-05" }),
    ];
    expect(total(rows)).toMatchObject({
      revenueChangePct: "0.2",
      comparisonReason: null,
    });
    expect(
      total(rows, { ...context, history: { current: true, ly: false } }),
    ).toMatchObject({
      revenueChangePct: null,
      comparisonReason: "INSUFFICIENT_HISTORY",
    });
  });
  it("uses selected-day plan pace and full monthly plan attainment, including zero and missing plans", () => {
    expect(total([fact({ revenue: "1500" })]).plan).toMatchObject({
      target: "3100",
      expected: "1500",
      pacePct: "1",
    });
    expect(
      total([fact()], {
        ...context,
        settings: { ...context.settings, monthlyPlans: { "2026-10": "0" } },
      }).plan,
    ).toMatchObject({
      attainmentPct: null,
      pacePct: null,
      reason: "PLAN_ZERO",
    });
    expect(
      total([fact()], { ...context, settings: defaultClientSettings() }).plan
        .attainmentPct,
    ).toBeNull();
  });
  it("keeps currencies separate and flags one-off LY/current orders without removing them", () => {
    const r = calculateSalesReport(
      [
        fact({ revenue: "80" }),
        fact({ id: "ly", date: "2025-10-05", revenue: "100" }),
        fact({ id: "eur", currency: "EUR", revenue: "500" }),
      ],
      context,
    );
    expect(r.summary.map((s) => s.currency)).toEqual(["EUR", "UAH"]);
    expect(r.oneOffOrders.filter((o) => o.currency === "UAH")).toHaveLength(1);
    expect(r.summary[1].current.revenue).toBe("80");
  });
  it("uses identical financial totals for articles, brands, categories and channels", () => {
    const r = calculateSalesReport(
      [
        fact(),
        fact({
          id: "cons",
          ownership: "CONSIGNMENT",
          commissionRate: "0.25",
          cost: null,
        }),
      ],
      context,
    );
    for (const rows of [r.articles, r.brands, r.categories, r.channels])
      expect(rows[0].current).toEqual(r.summary[0].current);
  });
  it("does not use stale, undated or unmapped project rows in trusted totals", () => {
    const r = calculateSalesReport(
      [
        fact(),
        fact({ id: "stale", stale: true }),
        fact({ id: "date", date: null }),
        fact({ id: "project", projectMappingUnavailable: true }),
      ],
      context,
    );
    expect(r.summary[0].current.revenue).toBe("100");
    expect(r.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        "NORMALIZATION_REPLAY_REQUIRED",
        "PAYMENT_DATE_UNAVAILABLE",
        "PROJECT_MAPPING_UNVERIFIED",
      ]),
    );
  });
  it("retains all four monetary decimal places in large financial sums", () => {
    const rows = Array.from({ length: 10000 }, (_, i) =>
      fact({
        id: String(i),
        orderId: String(i),
        revenue: "99999999999999.9999",
        cost: "1",
      }),
    );
    expect(total(rows).current).toMatchObject({
      revenue: "999999999999999999",
      coveredGrossProfit: "999999999999989999",
    });
  });
  it("flags strictly more than 50% of brand LY, without removing a 50% order", () => {
    const rows = [
      fact({ id: "ly1", orderId: "LY1", date: "2025-10-05", revenue: "50" }),
      fact({ id: "ly2", orderId: "LY2", date: "2025-10-06", revenue: "50" }),
      fact({ id: "current", revenue: "50" }),
    ];
    expect(calculateSalesReport(rows, context).oneOffOrders).toEqual([]);
  });
  it("uses a full LY month for outliers even when the report covers half a month", () => {
    const rows = [
      fact({ id: "ly1", orderId: "LY1", date: "2025-10-05", revenue: "60" }),
      fact({ id: "ly2", orderId: "LY2", date: "2025-10-25", revenue: "100" }),
    ];
    const report = calculateSalesReport(rows, context);
    expect(report.summary[0].ly.revenue).toBe("60");
    expect(report.oneOffOrders).toMatchObject([
      { orderId: "LY2", month: "2025-10", brandLyMonthRevenue: "160" },
    ]);
  });
  it("compares covered margin against the saved client threshold", () => {
    expect(total([fact()]).coveredMarginBelowTarget).toBe(true);
    expect(
      total([fact()], {
        ...context,
        settings: { ...context.settings, minMarginPct: 35 },
      }).coveredMarginBelowTarget,
    ).toBe(false);
    expect(
      total([fact({ quantity: "0", revenue: "0" })]).current.orderCount,
    ).toBe(1);
  });
  it("normalizes percentage and absolute discounts once and applies return signs exactly once", () => {
    const order = {
      externalId: "o",
      observedAt: "2026-10-20T12:00Z",
      updatedAt: null,
      orderedAt: "2026-10-01",
      paidAt: "2026-10-05",
      returnedAt: "2026-10-10",
      statusId: "5",
      channelId: "1",
      lines: [
        {
          externalLineId: "1",
          productId: null,
          sku: "SKU",
          quantity: "2",
          unitPrice: "100",
          discount: "10",
          discountUnit: "percentage" as const,
          costPrice: "60",
          commission: null,
          commissionUnit: "unknown" as const,
        },
      ],
    };
    const policy: OrderPolicy = {
      statuses: { "5": "SALE", "7": "RETURN" },
      amounts: {
        price: "gross_unit",
        absoluteDiscount: "line",
        currency: "UAH",
        cost: "unit",
      },
    };
    expect(
      normalizeOrder(
        order,
        "Europe/Kyiv",
        policy,
      ).lines[0].signedRevenue?.toString(),
    ).toBe("180");
    const absolute = {
      ...order,
      lines: [{ ...order.lines[0], discountUnit: "amount" as const }],
    };
    expect(
      normalizeOrder(
        absolute,
        "Europe/Kyiv",
        policy,
      ).lines[0].signedRevenue?.toString(),
    ).toBe("190");
    expect(
      normalizeOrder(
        {
          ...absolute,
          statusId: "7",
          lines: [{ ...absolute.lines[0], quantity: "-2" }],
        },
        "Europe/Kyiv",
        policy,
      ).lines[0].signedRevenue?.toString(),
    ).toBe("-190");
  });
  it("aggregates 10,000 orders deterministically without floating-point drift", () => {
    const rows = Array.from({ length: 10000 }, (_, i) =>
      fact({ id: String(i), orderId: String(i), revenue: "0.1", cost: "0.06" }),
    );
    expect(total(rows).current).toMatchObject({
      revenue: "1000",
      coveredGrossProfit: "400",
      orderCount: 10000,
      gmPct: "0.4",
    });
  });
});
describe("financial calendar and history", () => {
  it.each([
    ["2026-10-06T09:00Z", "2026-09-01", "2026-09-30"],
    ["2026-10-07T09:00Z", "2026-10-01", "2026-10-06"],
    ["2026-01-01T09:00Z", "2025-12-01", "2025-12-31"],
  ])("resolves D15 %s", (now, from, to) =>
    expect(resolveSalesPeriod({ now: new Date(now) })).toMatchObject({
      from,
      to,
    }),
  );
  it("uses Kyiv midnight rather than UTC and clamps leap-day endpoints", () => {
    expect(
      resolveSalesPeriod({ now: new Date("2026-10-06T22:30Z") }),
    ).toMatchObject({ from: "2026-10-01", to: "2026-10-06" });
    expect(
      resolveSalesPeriod({
        dateFrom: "2024-02-29",
        dateTo: "2024-02-29",
        now: new Date("2026-10-25T10:00Z"),
      }),
    ).toMatchObject({ lyFrom: "2023-02-28", lyTo: "2023-02-28", days: 1 });
  });
  it.each([
    { dateFrom: "2026-02-30", dateTo: "2026-03-01" },
    { dateFrom: "2026-10-05" },
    { dateFrom: "2026-10-10", dateTo: "2026-10-01" },
    { dateFrom: "2025-01-01", dateTo: "2026-10-01" },
  ])("rejects invalid periods %j", (input) =>
    expect(() =>
      resolveSalesPeriod({ ...input, now: new Date("2026-10-25T10:00Z") }),
    ).toThrow(SalesPeriodError),
  );
  it("requires a completed baseline, respects missing intervals, and does not infer coverage from sales", () => {
    expect(
      salesHistoryCoverage([], null, period, "Europe/Kyiv", false),
    ).toEqual({ current: false, ly: false });
    expect(
      salesHistoryCoverage(
        [{ from: "2024-10-01T10:00Z", to: "2026-10-02T10:00Z" }],
        "2026-10-25T10:00Z",
        period,
        "Europe/Kyiv",
        false,
      ),
    ).toEqual({ current: true, ly: true });
    expect(
      salesHistoryCoverage(
        [{ from: "2026-10-01T10:00Z", to: "2026-10-25T10:00Z" }],
        null,
        period,
        "Europe/Kyiv",
        false,
      ),
    ).toEqual({ current: false, ly: false });
  });
});

it("preserves fully observed midnight window boundaries", () => {
  expect(
    salesHistoryCoverage(
      [{ from: "2025-10-01T00:00:00+03:00", to: "2026-10-16T00:00:00+03:00" }],
      null,
      period,
      "Europe/Kyiv",
      false,
    ),
  ).toEqual({ current: true, ly: true });
});
