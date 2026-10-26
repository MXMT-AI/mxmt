import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  calculateReordering,
  parseReorderingRequest,
} from "@/lib/reorder-calc";
import type { ReorderingSku } from "@/lib/reordering-contract";
import { calculateDailySku } from "@/lib/sku-daily-metrics";
import { skuInput, context } from "../helpers/daily-sku";
const sku = (
  skuId = "a",
  overrides: Partial<ReorderingSku> = {},
): ReorderingSku => ({
  skuId,
  sku: skuId,
  name: skuId,
  barcode: null,
  brandId: "brand",
  brandName: "Brand",
  categoryId: "category",
  categoryName: "Category",
  supplierName: "Supplier",
  currency: "UAH",
  classification: "HEALTHY",
  productKind: "MERCHANDISE",
  active: true,
  inSeason: true,
  ownership: "OWN",
  quantity: "10",
  unitCost: "3.25",
  inTransitQuantity: "5",
  velocityPerWeek: "7",
  velocityState: "KNOWN",
  velocityBasis: "SNAPSHOT_DAYS",
  denominatorWeeks: "12",
  daysToZero: "10",
  policy: {
    supplierId: "supplier",
    leadDays: 30,
    coverDays: 60,
    moq: 6,
    supplierTermsVerified: true,
    supplierTermsSource: "SUPPLIER",
  },
  diagnostics: [],
  ...overrides,
});
const run = (rows: ReorderingSku[], body: Record<string, unknown> = {}) =>
  calculateReordering(
    { snapshotId: "snapshot", asOf: "2026-10-25", rows },
    parseReorderingRequest({
      snapshotId: "snapshot",
      mode: "brand",
      filters: { brandId: "brand" },
      ...body,
    }),
  );
describe("approved D14/D18–D20 reordering calculator", () => {
  it("ceils the lead-plus-cover target before subtracting stock/transit, then rounds positive demand to MOQ", () => {
    const r = run([sku()]);
    expect(r.rows[0]).toMatchObject({
      recommendedQuantity: "78",
      purchaseAmount: "253.5",
      exportEligible: true,
      urgency: "RED",
      inTransitSource: "VERIFIED_SNAPSHOT",
    });
    expect(r.totals.quantity).toBe("78");
    expect(r.canExport).toBe(true);
    expect(r.currencies[0].purchaseAmount).toBe("253.5");
  });
  it("retains fractional stock/transit and rounds the demand up rather than rounding to nearest", () => {
    const r = run(
      [
        sku("a", {
          quantity: "0.25",
          inTransitQuantity: "0.5",
          velocityPerWeek: "1.1",
        }),
      ],
      { parameters: { leadDays: 0, coverDays: 7, moq: 1 } },
    );
    expect(r.rows[0].recommendedQuantity).toBe("2");
  });
  it.each([
    {
      velocityPerWeek: "0",
      velocityState: "ZERO",
      quantity: "0",
      daysToZero: null,
    },
    { quantity: "1000" },
    { inTransitQuantity: "1000" },
  ])(
    "zero or negative demand stays zero instead of becoming one MOQ: %j",
    (overrides) => {
      const r = run([sku("a", overrides)]);
      expect(r.rows[0].recommendedQuantity).toBe("0");
      expect(r.rows[0].purchaseAmount).toBe("0");
      expect(r.canExport).toBe(false);
    },
  );
  it("uses per-SKU scenario terms before global overrides and frozen supplier settings", () => {
    const r = run([sku()], {
      parameters: { leadDays: 10, coverDays: 0, moq: 1 },
      overrides: [{ skuId: "a", leadDays: 20, moq: 4 }],
    });
    expect(r.rows[0]).toMatchObject({
      leadDays: 20,
      coverDays: 0,
      moq: 4,
      recommendedQuantity: "8",
      parameterSources: {
        leadDays: "SKU_SCENARIO",
        coverDays: "SCENARIO",
        moq: "SKU_SCENARIO",
      },
    });
  });
  it("never treats missing transit as zero; explicit zero is a scenario confirmation", () => {
    const row = sku("a", { inTransitQuantity: null });
    const unknown = run([row]);
    expect(unknown.rows[0]).toMatchObject({
      recommendedQuantity: null,
      purchaseAmount: null,
      state: "REVIEW",
      inTransitSource: "UNKNOWN",
      exportEligible: false,
    });
    expect(unknown.totals.quantity).toBeNull();
    const confirmed = run([row], {
      overrides: [{ skuId: "a", inTransitQuantity: "0" }],
    });
    expect(confirmed.rows[0]).toMatchObject({
      recommendedQuantity: "84",
      inTransitSource: "SCENARIO_CONFIRMATION",
      exportEligible: true,
    });
    expect(row.inTransitQuantity).toBeNull();
  });
  it("keeps off-season, quarantined new and inactive SKUs at zero outside shortage counts", () => {
    const rows = [
      sku("off", {
        inSeason: false,
        classification: "OFF_SEASON",
        active: false,
      }),
      sku("new", { classification: "NEW" }),
      sku("inactive", { active: false }),
    ];
    const r = run(rows);
    expect(
      r.rows.every((r) => r.recommendedQuantity === "0" && !r.exportEligible),
    ).toBe(true);
    expect(r.counts.shortageSkuCount).toBe(0);
    expect(r.counts.offSeasonSkuCount).toBe(1);
    const shortage = run(rows, { mode: "shortage", filters: {} });
    expect(shortage.rows.map((r) => r.skuId)).toEqual(["off"]);
  });
  it("counts shortage/OOS as a distinct union and recalculates the risk threshold for scenario leads", () => {
    const rows = [
      sku("oos", { classification: "OOS", quantity: "0", daysToZero: "0" }),
      sku("boundary", { daysToZero: "44", quantity: "44" }),
      sku("risk", { daysToZero: "43.999", quantity: "43.999" }),
    ];
    const r = run(rows, { mode: "shortage", filters: {} });
    expect(r.counts.shortageSkuCount).toBe(2);
    expect(r.rows.map((r) => r.skuId)).toEqual(["oos", "risk"]);
    const extended = run(rows, {
      mode: "shortage",
      filters: {},
      parameters: { leadDays: 31 },
    });
    expect(extended.counts.shortageSkuCount).toBe(3);
    expect(run([sku("a", { daysToZero: "30" })]).rows[0].urgency).toBe(
      "NORMAL",
    );
    expect(run([sku("a", { daysToZero: "29.999" })]).rows[0].urgency).toBe(
      "RED",
    );
  });
  it("does not turn healthy stock with unknown transit into a shortage candidate", () => {
    const r = run(
      [
        sku("a", {
          quantity: "100",
          daysToZero: "100",
          inTransitQuantity: null,
        }),
      ],
      { mode: "shortage", filters: {} },
    );
    expect(r.rows).toEqual([]);
  });
  it.each([
    { velocityPerWeek: null, velocityState: "UNKNOWN" },
    { velocityPerWeek: "-1", velocityState: "RETURN_DOMINATED" },
    { denominatorWeeks: "3.999" },
    { quantity: null },
    { policy: { ...sku().policy, leadDays: null } },
    { policy: { ...sku().policy, coverDays: null } },
    { policy: { ...sku().policy, moq: null } },
  ])("surfaces unavailable inputs without invented demand: %j", (overrides) => {
    const r = run([sku("a", overrides)]);
    expect(r.rows[0].recommendedQuantity).toBeNull();
    expect(r.rows[0].state).toBe("REVIEW");
    expect(r.rows[0].issues.length).toBeGreaterThan(0);
    expect(r.canExport).toBe(false);
  });
  it("uses the existing minimum-four-week denominator and discloses receipt fallback", () => {
    for (const input of [
      skuInput({ inStockDays: 7, netUnits12Weeks: "28" }),
      skuInput({
        observedDays: 7,
        netUnits12Weeks: "28",
        lastReceiptDate: "2026-10-20",
      }),
    ]) {
      const daily = calculateDailySku(input, context);
      expect(daily.denominatorWeeks).toBe("4");
      expect(daily.velocityPerWeek).toBe("7");
      const result = run([
        sku("a", {
          velocityPerWeek: daily.velocityPerWeek,
          velocityState: daily.velocityState,
          velocityBasis: daily.velocityBasis,
          denominatorWeeks: daily.denominatorWeeks,
        }),
      ]);
      expect(result.rows[0].recommendedQuantity).toBe("78");
      if (daily.velocityBasis === "RECEIPT_FALLBACK")
        expect(result.rows[0].warnings).toContain(
          "RECEIPT_DATE_VELOCITY_FALLBACK",
        );
    }
  });
  it("keeps known quantity but marks missing cost, supplier terms and consignment cash as incomplete", () => {
    for (const overrides of [
      { unitCost: null },
      { unitCost: "0" },
      { ownership: "CONSIGNMENT" },
      { ownership: "UNKNOWN" },
    ]) {
      const r = run([sku("a", overrides)]);
      expect(r.rows[0].recommendedQuantity).toBe("78");
      expect(r.rows[0].purchaseAmount).toBeNull();
      expect(r.currencies[0].purchaseAmount).toBeNull();
      expect(r.canExport).toBe(false);
    }
    const terms = run([
      sku("a", {
        policy: {
          ...sku().policy,
          supplierTermsVerified: false,
          supplierTermsSource: "CLIENT_DEFAULT",
        },
      }),
    ]);
    expect(terms.rows[0].issues).toContain("SUPPLIER_TERMS_UNVERIFIED");
    expect(terms.rows[0].parameterSources.leadDays).toBe("CLIENT_DEFAULT");
    expect(terms.canExport).toBe(false);
  });
  it("groups by stable supplier ID and currency, never supplier/brand display text", () => {
    const r = run([
      sku("a"),
      sku("b", { policy: { ...sku().policy, supplierId: "other" } }),
      sku("c", { currency: "USD" }),
    ]);
    expect(r.suppliers).toHaveLength(3);
    expect(r.currencies.map((r) => [r.currency, r.purchaseAmount])).toEqual([
      ["UAH", "507"],
      ["USD", "253.5"],
    ]);
    expect(r.totals.quantity).toBe("234");
  });
  it("rejects foreign, out-of-filter and excluded overrides, while permitting valid leads that remove a shortage", () => {
    for (const body of [
      { overrides: [{ skuId: "foreign", inTransitQuantity: "0" }] },
      { overrides: [{ skuId: "new", inTransitQuantity: "0" }] },
    ])
      expect(() =>
        run([sku(), sku("new", { classification: "NEW" })], body),
      ).toThrow("REORDERING_OVERRIDE_INELIGIBLE");
    const r = run([sku("a", { daysToZero: "40" })], {
      mode: "shortage",
      filters: {},
      overrides: [{ skuId: "a", leadDays: 1 }],
    });
    expect(r.rows).toEqual([]);
  });
  it("has deterministic IDs and sort ties independent of pages and input order", () => {
    const rows = [sku("b"), sku("a")];
    expect(run(rows).rows.map((r) => r.skuId)).toEqual(["a", "b"]);
    expect(run(rows)).toEqual(run([...rows].reverse()));
    expect(run(rows, { page: 2 }).previewId).toBe(run(rows).previewId);
  });
});
describe("reordering request boundary", () => {
  it.each([
    { mode: "brand" },
    { mode: null },
    { parameters: { leadDays: -1 } },
    { parameters: { leadDays: 3651 } },
    { parameters: { coverDays: 0.5 } },
    { parameters: { coverDays: 3651 } },
    { parameters: { moq: 0 } },
    { parameters: { moq: 1000001 } },
    { parameters: { leadDays: "30" } },
    { parameters: { leadDays: null } },
    { parameters: { qtyMultiplier: 1 } },
    { weeklyVelocity: "100" },
    { stock: "0" },
    { unitCost: "1" },
    { formula: "fake" },
    { tenantId: "b" },
    { overrides: [{ skuId: "a", inTransitQuantity: "-1" }] },
    { overrides: [{ skuId: "a", inTransitQuantity: "1e3" }] },
    { overrides: [{ skuId: "a", inTransitQuantity: 0 }] },
    { overrides: [{ skuId: "a", inTransitQuantity: "0.00001" }] },
    { overrides: [{ skuId: "a" }] },
    {
      overrides: [
        { skuId: "a", moq: 2 },
        { skuId: "a", moq: 3 },
      ],
    },
    { pageSize: 201 },
  ])("rejects invalid or authoritative client fields %j", (body) =>
    expect(() =>
      parseReorderingRequest({ snapshotId: "snapshot", ...body }),
    ).toThrow("INVALID_REORDERING_REQUEST"),
  );
  it("accepts zero-day targets and explicit transit zero without coercion", () => {
    expect(
      parseReorderingRequest({
        snapshotId: "snapshot",
        parameters: { leadDays: 0, coverDays: 0, moq: 1 },
        overrides: [{ skuId: "a", inTransitQuantity: "0.0000" }],
      }).overrides[0].inTransitQuantity,
    ).toBe("0");
  });
});
