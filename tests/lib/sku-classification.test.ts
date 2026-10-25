import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { Temporal } from "@js-temporal/polyfill";
import {
  classifyDailySku,
  summarizeSkuClassification,
  type ClassifiedDailySku,
} from "@/lib/classify";
import {
  calculateDailySku,
  summarizeDailySkus,
  type DailySkuInput,
} from "@/lib/sku-daily-metrics";
import { summarizeDailyBrands } from "@/lib/brand-metrics";
import {
  resolveMerchandisingPolicy,
  type PolicyInputs,
} from "@/lib/merchandising-policy";
import { defaultClientSettings } from "@/lib/merchandising-settings";
import { context, skuInput } from "../helpers/daily-sku";
const policy = resolveMerchandisingPolicy({ brandOwnership: "OWN" });
const ago = (days: number) =>
  Temporal.PlainDate.from(context.asOf).subtract({ days }).toString();
function calculate(
  input: Partial<DailySkuInput> = {},
  terms: PolicyInputs = {},
  settings = defaultClientSettings(),
): ClassifiedDailySku {
  const row = calculateDailySku(skuInput(input), context);
  return {
    ...row,
    ...classifyDailySku(
      row,
      resolveMerchandisingPolicy({ brandOwnership: "OWN", ...terms }, settings),
    ),
    brandName: "Brand",
    brandOwnership: terms.brandOwnership ?? "OWN",
  };
}
describe("versioned section 8 classification", () => {
  it.each([
    ["12", "HEALTHY"],
    ["12.000000000000000001", "RISK"],
    ["26", "RISK"],
    ["26.000000000000000001", "DEAD"],
  ])("uses unrounded WOH %s => %s", (stock, expected) => {
    expect(
      calculate({ quantity: stock, netUnits12Weeks: "8" }).classification,
    ).toBe(expected);
  });
  it.each([
    [89, "HEALTHY"],
    [90, "DEAD"],
    [91, "DEAD"],
  ])("applies last-sale age %s inclusively", (days, expected) => {
    expect(calculate({ lastSaleDate: ago(days) }).classification).toBe(
      expected,
    );
  });
  it.each([60, 90, 120] as const)(
    "uses configurable %s-day thresholds",
    (deadDays) => {
      expect(
        calculate(
          { lastSaleDate: ago(deadDays) },
          {},
          { ...defaultClientSettings(), deadDays },
        ).classification,
      ).toBe("DEAD");
      expect(
        calculate(
          { lastSaleDate: ago(deadDays - 1) },
          {},
          { ...defaultClientSettings(), deadDays },
        ).classification,
      ).toBe("HEALTHY");
    },
  );
  it("ends six-week quarantine at exactly 42 calendar days and never resets it on replenishment", () => {
    expect(
      calculate({
        firstReceiptDate: ago(41),
        lastReceiptDate: ago(1),
        quantity: "10000",
        seasonMonths: [1],
      }).classification,
    ).toBe("NEW");
    expect(
      calculate({ firstReceiptDate: ago(42), lastReceiptDate: ago(1) })
        .classification,
    ).toBe("HEALTHY");
    expect(calculate({ lastReceiptDate: ago(1) }).classification).toBe(
      "HEALTHY",
    );
  });
  it("applies service/error/new/off-season/active-OOS before dead stock", () => {
    expect(
      calculate({ productKind: "SERVICE", quantity: null }).classification,
    ).toBe("SERVICE");
    expect(calculate({ productKind: "GIFT_CARD" }).classification).toBe(
      "SERVICE",
    );
    expect(
      calculate({ quantity: null, firstReceiptDate: ago(1), seasonMonths: [1] })
        .classification,
    ).toBe("DATA_ERROR");
    expect(
      calculate({ firstReceiptDate: ago(1), quantity: "0", seasonMonths: [1] })
        .classification,
    ).toBe("NEW");
    expect(
      calculate({ quantity: "0", seasonMonths: [1], lastSaleDate: ago(90) })
        .classification,
    ).toBe("OFF_SEASON");
    expect(
      calculate({
        quantity: "0",
        lastSaleDate: ago(90),
        lastReceiptDate: ago(1),
      }).classification,
    ).toBe("OOS");
  });
  it("distinguishes zero velocity from unknown demand and known never-sold history", () => {
    expect(calculate({ netUnits12Weeks: "0" })).toMatchObject({
      classification: "DEAD",
      weeksOnHand: null,
      shortage: false,
    });
    expect(calculate({ netUnits12Weeks: "0", quantity: "0" })).toMatchObject({
      classification: "OOS",
      shortage: true,
      shortageRisk: false,
    });
    expect(calculate({ velocitySalesCovered: false }).classification).toBe(
      "DATA_ERROR",
    );
    expect(calculate({ netUnits12Weeks: "-1" }).classification).toBe(
      "DATA_ERROR",
    );
    expect(calculate({ firstReceiptDate: null }).classification).toBe(
      "DATA_ERROR",
    );
    expect(
      calculate({ lastSaleDate: null, cohortSalesCovered: false })
        .classification,
    ).toBe("DATA_ERROR");
    expect(
      calculate({
        lastSaleDate: null,
        netUnits12Weeks: "0",
        netUnitsSinceReceipt: "0",
      }).classification,
    ).toBe("DEAD");
  });
  it("does not turn ancillary cost/history diagnostics or receipt fallback into a physical data error", () => {
    expect(
      calculate({ observedDays: 2, costPrice: null, cogsHistoryCovered: false })
        .classification,
    ).toBe("HEALTHY");
  });
  it("uses supplier lead overrides only when verified and tests the strict safety threshold", () => {
    expect(
      calculate({ quantity: "44", netUnits12Weeks: "56" }).shortageRisk,
    ).toBe(false);
    expect(
      calculate({ quantity: "43.9999", netUnits12Weeks: "56" }).shortageRisk,
    ).toBe(true);
    expect(
      calculate(
        { quantity: "20", netUnits12Weeks: "56" },
        { leadDays: 1, supplierTermsVerified: true },
      ).shortageRisk,
    ).toBe(false);
    expect(
      calculate(
        { quantity: "20", netUnits12Weeks: "56" },
        { leadDays: 1, supplierTermsVerified: false },
      ).shortageRisk,
    ).toBe(true);
  });
  it("counts the union of eligible shortages once and excludes new, invalid, inactive and off-season SKUs", () => {
    const oos = calculate({ skuId: "oos", quantity: "0" });
    expect(oos).toMatchObject({ shortageRisk: true, shortage: true });
    const rows = [
      oos,
      calculate({ skuId: "risk" }),
      calculate({ skuId: "new", firstReceiptDate: ago(1) }),
      calculate({ skuId: "invalid", quantity: null }),
      calculate({ skuId: "inactive", quantity: "0", lastSaleDate: ago(90) }),
      calculate({ skuId: "off", quantity: "0", seasonMonths: [1] }),
    ];
    expect(summarizeSkuClassification(rows)).toMatchObject({
      shortageSkuCount: 2,
      oosSkuCount: 1,
      shortageRiskSkuCount: 2,
      offSeasonSkuCount: 1,
    });
    const summary = summarizeDailySkus(
      [
        oos,
        calculate({ skuId: "off", quantity: "100", seasonMonths: [1] }),
        calculate({
          skuId: "unknown-off",
          productKind: "UNKNOWN",
          seasonMonths: [1],
        }),
      ],
      3,
    );
    expect(summary.availability).toMatchObject({
      activeSkuCount: 1,
      activeInStockSkuCount: 0,
      ratio: "0",
    });
  });
  it("returns consignment action and preserves explicit SKU ownership overrides and unknowns", () => {
    const input = { quantity: "10000" };
    expect(
      calculate(input, { brandOwnership: "CONSIGNMENT" }).recommendation,
    ).toBe("DISCUSS_SUPPLIER_RETURN");
    expect(
      calculate(input, {
        brandOwnership: "CONSIGNMENT",
        ownershipOverride: "OWN",
      }).recommendation,
    ).toBe("REVIEW_MARKDOWN");
    expect(calculate(input, { brandOwnership: "UNKNOWN" })).toMatchObject({
      classification: "DEAD",
      recommendation: "REVIEW_DATA",
      warnings: ["OWNERSHIP_UNKNOWN"],
    });
  });
});
describe("K4 signals from the same daily rows", () => {
  const brands = (rows: ClassifiedDailySku[]) =>
    summarizeDailyBrands(rows, policy);
  it("prioritizes missing brand, first receipt, season and WOH in that order", () => {
    const recent = calculate({
      firstReceiptDate: ago(1),
      quantity: "10000",
      seasonMonths: [1],
    });
    expect(brands([{ ...recent, brandId: null }])[0].signal).toBe(
      "MISSING_BRAND",
    );
    expect(brands([recent])[0].signal).toBe("NEW");
    expect(
      brands([calculate({ seasonMonths: [1], quantity: "10000" })])[0].signal,
    ).toBe("OFF_SEASON");
    expect(
      brands([
        calculate({
          firstReceiptDate: ago(42),
          lastReceiptDate: ago(1),
          quantity: "10000",
        }),
      ])[0].signal,
    ).toBe("DEAD");
    expect(
      brands([
        calculate({ firstReceiptDate: ago(1) }),
        calculate({ skuId: "old", firstReceiptDate: ago(100) }),
      ])[0].signal,
    ).toBe("HEALTHY");
  });
  it.each([
    ["12", "HEALTHY"],
    ["12.0001", "RISK"],
    ["26", "RISK"],
    ["26.0001", "DEAD"],
  ])("classifies exact brand WOH %s", (quantity, signal) => {
    expect(
      brands([calculate({ quantity, netUnits12Weeks: "8" })])[0].signal,
    ).toBe(signal);
  });
  it("divides total stock by total velocity and aggregates STR over the same covered subset", () => {
    const one = calculate({
      quantity: "100",
      netUnits12Weeks: "8",
      netUnitsSinceReceipt: "100",
    });
    const two = calculate({
      skuId: "two",
      quantity: "10",
      netUnits12Weeks: "72",
      netUnitsSinceReceipt: "10",
    });
    expect(brands([one, two])[0]).toMatchObject({
      weeksOnHand: "11",
      signal: "HEALTHY",
      sellThroughRatio: "0.5",
      strComplete: true,
    });
    expect(
      brands([one, { ...two, cohortHistoryComplete: false }])[0],
    ).toMatchObject({
      sellThroughRatio: "0.5",
      strCoveredSkuCount: 1,
      strComplete: false,
    });
  });
  it("shows partial coverage and ownership warnings instead of a fabricated healthy signal", () => {
    const unknown = calculate(
      { velocitySalesCovered: false },
      { brandOwnership: "UNKNOWN" },
    );
    expect(brands([unknown])[0]).toMatchObject({
      signal: "UNAVAILABLE",
      warnings: ["OWNERSHIP_UNKNOWN"],
      weeksOnHand: null,
    });
    expect(brands([calculate({ netUnits12Weeks: "0" })])[0].signal).toBe(
      "DEAD",
    );
    expect(
      brands([calculate({ netUnits12Weeks: "0", quantity: "0" })])[0].signal,
    ).toBe("UNAVAILABLE");
    expect(brands([calculate({ productKind: "SERVICE" })])).toEqual([]);
  });
});
