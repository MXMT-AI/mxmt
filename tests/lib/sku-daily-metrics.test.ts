import { describe, it, expect } from "vitest";
import {
  calculateDailySku,
  summarizeDailySkus,
  availabilityTone,
  type DailySkuInput,
  type DailySkuContext,
} from "@/lib/sku-daily-metrics";
import {
  resolveDailySkuPeriod,
  DailySkuPeriodError,
} from "@/lib/sku-daily-period";
const context: DailySkuContext = {
  asOf: "2026-10-25",
  windowFrom: "2026-08-02",
  windowTo: "2026-10-24",
  cogsFrom: "2026-07-01",
  cogsTo: "2026-09-30",
  sourceBusy: false,
  turnoverNormMonths: 3,
};
export function skuInput(v: Partial<DailySkuInput> = {}): DailySkuInput {
  return {
    skuId: "sku",
    sku: "SKU",
    name: "Item",
    brandId: "brand",
    categoryId: "category",
    productKind: "MERCHANDISE",
    seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    snapshotId: "snapshot",
    observedAt: "2026-10-25T03:00:00+03:00",
    quantity: "14",
    costPrice: "10",
    retailPrice: "20",
    currency: "UAH",
    observedDays: 84,
    inStockDays: 56,
    invalidSnapshotDays: 0,
    firstReceiptDate: "2026-01-01",
    lastReceiptDate: "2026-01-01",
    lastSaleDate: "2026-10-20",
    netUnits12Weeks: "56",
    netUnitsSinceReceipt: "86",
    cogs3Months: "84",
    missingCostLines: 0,
    currencyMismatch: false,
    blockedOrderLines: 0,
    velocitySalesCovered: true,
    cohortSalesCovered: true,
    activitySalesCovered: true,
    receiptHistoryCovered: true,
    cogsHistoryCovered: true,
    inputHash: "fixture",
    ...v,
  };
}
const calculate = (v: Partial<DailySkuInput> = {}, ctx = context) =>
  calculateDailySku(skuInput(v), ctx);
describe("daily SKU deterministic formulas", () => {
  it("uses 12 completed weeks and observed in-stock days, with unrounded WOH and days to zero", () => {
    expect(calculate()).toMatchObject({
      velocityPerWeek: "7",
      velocityState: "KNOWN",
      velocityBasis: "SNAPSHOT_DAYS",
      denominatorWeeks: "8",
      weeksOnHand: "2",
      daysToZero: "14",
      sellThroughRatio: "0.86",
      stockCostValue: "140",
      stockRetailValue: "280",
      turnoverMonths: "5",
      turnoverTone: "RED",
    });
  });
  it("caps recent PRINTWORKS receipt fallback at a minimum four weeks instead of inflating ROS", () => {
    const row = calculate({
      sku: "PRINTWORKS",
      observedDays: 2,
      inStockDays: 2,
      firstReceiptDate: "2026-10-23",
      lastReceiptDate: "2026-10-23",
      netUnits12Weeks: "12",
    });
    expect(row).toMatchObject({
      velocityPerWeek: "3",
      denominatorWeeks: "4",
      velocityBasis: "RECEIPT_FALLBACK",
      snapshotHistory: { complete: false, observedDays: 2 },
    });
    expect(row.diagnostics).toContain("RECEIPT_DATE_VELOCITY_FALLBACK");
  });
  it("does not reset first-receipt STR when a later receipt changes the fallback exposure", () => {
    const one = calculate({ observedDays: 2, lastReceiptDate: "2026-01-01" }),
      two = calculate({ observedDays: 2, lastReceiptDate: "2026-10-23" });
    expect(two.sellThroughRatio).toBe(one.sellThroughRatio);
    expect(two.firstReceiptDate).toBe("2026-01-01");
    expect(two.denominatorWeeks).toBe("4");
    expect(one.denominatorWeeks).toBe("12");
  });
  it("does not count missing snapshot days as observed stockouts", () => {
    const row = calculate({ observedDays: 50, inStockDays: 50 });
    expect(row.snapshotHistory.complete).toBe(false);
    expect(row.velocityBasis).toBe("RECEIPT_FALLBACK");
    expect(row.denominatorWeeks).toBe("12");
  });
  it("distinguishes true zero velocity, unknown exposure, incomplete sales and return-dominated demand", () => {
    expect(calculate({ netUnits12Weeks: "0" })).toMatchObject({
      velocityPerWeek: "0",
      velocityState: "ZERO",
      weeksOnHand: null,
      daysToZero: null,
    });
    expect(
      calculate({
        observedDays: 0,
        lastReceiptDate: null,
        netUnits12Weeks: "0",
      }),
    ).toMatchObject({ velocityPerWeek: null, velocityState: "UNKNOWN" });
    expect(calculate({ velocitySalesCovered: false })).toMatchObject({
      velocityPerWeek: null,
      velocityState: "UNKNOWN",
      salesUnits12Weeks: null,
    });
    expect(calculate({ netUnits12Weeks: "-2" })).toMatchObject({
      velocityPerWeek: null,
      velocityState: "RETURN_DOMINATED",
    });
  });
  it("preserves zero stock and fractional quantities without NaN or infinity", () => {
    expect(calculate({ quantity: "0" })).toMatchObject({
      weeksOnHand: "0",
      daysToZero: "0",
      stockCostValue: "0",
      turnoverMonths: "0",
      sellThroughRatio: "1",
    });
    const fractional = calculate({
      quantity: "0.5",
      netUnits12Weeks: "1.5",
      netUnitsSinceReceipt: "1.5",
    });
    expect(fractional.sellThroughRatio).toBe("0.75");
    expect(JSON.stringify(fractional)).not.toMatch(/NaN|Infinity/);
  });
  it("does not turn missing or negative stock into zero or use another source date", () => {
    for (const v of [{ snapshotId: null, quantity: null }, { quantity: "-1" }])
      expect(calculate(v)).toMatchObject({
        quantity: null,
        weeksOnHand: null,
        stockCostValue: null,
        sellThroughRatio: null,
      });
  });
  it("requires the verified first receipt and complete cohort history for STR", () => {
    expect(calculate({ firstReceiptDate: null }).sellThroughRatio).toBeNull();
    expect(
      calculate({ cohortSalesCovered: false }).sellThroughRatio,
    ).toBeNull();
    expect(
      calculate({ netUnitsSinceReceipt: "-1" }).sellThroughRatio,
    ).toBeNull();
    expect(
      calculate({ quantity: "0", netUnitsSinceReceipt: "0" }).sellThroughRatio,
    ).toBeNull();
  });
  it("keeps missing cost, missing currency and zero/negative COGS unavailable for turnover", () => {
    for (const v of [
      { missingCostLines: 1 },
      { currencyMismatch: true },
      { cogsHistoryCovered: false },
      { costPrice: null },
      { currency: null },
      { cogs3Months: "0" },
      { cogs3Months: "-1" },
    ])
      expect(calculate(v).turnoverMonths).toBeNull();
    expect(calculate({ costPrice: null }).stockCostValue).toBeNull();
    expect(calculate({ costPrice: null, quantity: "0" }).stockCostValue).toBe(
      "0",
    );
  });
  it("applies the saved turnover norm before rounding", () => {
    expect(
      calculate({}, { ...context, turnoverNormMonths: 5 }).turnoverTone,
    ).toBe("GREEN");
    expect(
      calculate({}, { ...context, turnoverNormMonths: 4 }).turnoverTone,
    ).toBe("AMBER");
  });
  it("defines activity with 90/60-day boundaries, season and product eligibility", () => {
    expect(
      calculate({ lastSaleDate: "2026-07-28", lastReceiptDate: "2026-01-01" })
        .active,
    ).toBe(true);
    expect(
      calculate({ lastSaleDate: "2026-07-27", lastReceiptDate: "2026-01-01" })
        .active,
    ).toBe(false);
    expect(
      calculate({ lastSaleDate: null, lastReceiptDate: "2026-08-27" }).active,
    ).toBe(true);
    expect(
      calculate({ lastSaleDate: null, lastReceiptDate: "2026-08-26" }).active,
    ).toBe(false);
    for (const v of [
      { seasonMonths: [11] },
      { productKind: "SERVICE" as const },
      { productKind: "GIFT_CARD" as const },
    ])
      expect(calculate(v).active).toBe(false);
    expect(
      calculate({
        lastSaleDate: null,
        lastReceiptDate: null,
        activitySalesCovered: false,
      }).active,
    ).toBeNull();
  });
  it("does not infer inactivity or a confirmed first cohort when receipt history is missing", () => {
    const row = calculate({ lastSaleDate: null, receiptHistoryCovered: false });
    expect(row.active).toBeNull();
    expect(row.sellThroughRatio).toBeNull();
    expect(row.diagnostics).toContain("RECEIPT_HISTORY_INCOMPLETE");
  });
  it("does not turn stale order inputs or a running source into known demand", () => {
    expect(calculate({ blockedOrderLines: 1 }).velocityPerWeek).toBeNull();
    expect(calculate({}, { ...context, sourceBusy: true }).velocityState).toBe(
      "UNKNOWN",
    );
  });
});
describe("daily availability and valuation summaries", () => {
  it.each([
    ["0.6999", "RED"],
    ["0.70", "AMBER"],
    ["0.8499", "AMBER"],
    ["0.85", "GREEN"],
    [null, "UNAVAILABLE"],
  ])("classifies %s before display rounding", (ratio, tone) =>
    expect(availabilityTone(ratio)).toBe(tone),
  );
  it("uses active distinct SKU rows and excludes service/gift/off-season rows", () => {
    const result = summarizeDailySkus(
      [
        calculate(),
        calculate({ skuId: "zero", quantity: "0" }),
        calculate({ skuId: "service", productKind: "SERVICE" }),
        calculate({ skuId: "off-season", seasonMonths: [11] }),
      ],
      3,
    );
    expect(result.availability).toMatchObject({
      ratio: "0.5",
      activeSkuCount: 2,
      activeInStockSkuCount: 1,
    });
  });
  it("does not inflate availability when activity or active stock is unknown", () => {
    expect(
      summarizeDailySkus(
        [
          calculate(),
          calculate({
            skuId: "unknown",
            lastSaleDate: null,
            lastReceiptDate: null,
            activitySalesCovered: false,
          }),
        ],
        3,
      ).availability.ratio,
    ).toBeNull();
    expect(
      summarizeDailySkus([calculate({ quantity: null })], 3).availability,
    ).toMatchObject({ ratio: null, unknownStockSkuCount: 1 });
    expect(
      summarizeDailySkus(
        [calculate({ lastSaleDate: null, lastReceiptDate: "2026-01-01" })],
        3,
      ).availability.ratio,
    ).toBeNull();
  });
  it("keeps currencies and covered valuations separate, computing aggregate turnover from aggregate COGS", () => {
    const result = summarizeDailySkus(
      [
        calculate(),
        calculate({ skuId: "missing", costPrice: null }),
        calculate({ skuId: "eur", currency: "EUR" }),
      ],
      3,
    );
    expect(result.byCurrency.find((c) => c.currency === "UAH")).toMatchObject({
      stockCost: null,
      coveredStockCost: "140",
      missingCostSkuCount: 1,
      turnoverMonths: null,
    });
    expect(result.byCurrency.find((c) => c.currency === "EUR")?.stockCost).toBe(
      "140",
    );
  });
  it("aggregates 10,000 materialized rows without floating-point drift", () => {
    const row = calculate();
    const result = summarizeDailySkus(
      Array.from({ length: 10000 }, (_, i) => ({
        ...row,
        skuId: String(i),
        stockCostValue: "0.1",
      })),
      3,
    );
    expect(result.byCurrency[0].stockCost).toBe("1000");
    expect(result.availability.ratio).toBe("1");
  });
});
describe("daily business calendar", () => {
  it("uses 84 completed calendar days and current actual observation date, including DST", () => {
    const p = resolveDailySkuPeriod(
      undefined,
      new Date("2026-10-25T10:00:00Z"),
    );
    expect(p).toMatchObject({
      asOf: "2026-10-25",
      windowFrom: "2026-08-02",
      windowTo: "2026-10-24",
      cogsFrom: "2026-07-01",
      cogsTo: "2026-09-30",
    });
  });
  it("includes the ending month only when that full calendar month has completed", () => {
    expect(
      resolveDailySkuPeriod("2024-02-29", new Date("2026-10-25T10:00Z")),
    ).toMatchObject({ cogsFrom: "2023-12-01", cogsTo: "2024-02-29" });
    expect(
      resolveDailySkuPeriod("2026-10-31", new Date("2026-10-31T10:00Z")),
    ).toMatchObject({ cogsFrom: "2026-07-01", cogsTo: "2026-09-30" });
  });
  it.each(["2026-02-30", "2026-10-26", "2026-10-25T00:00Z", ""])(
    "rejects invalid/future asOf %s",
    (asOf) =>
      expect(() =>
        resolveDailySkuPeriod(asOf, new Date("2026-10-25T10:00Z")),
      ).toThrow(DailySkuPeriodError),
  );
});
