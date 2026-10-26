import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  calculateRepricing,
  parseRepricingRequest,
  repricingEligibility,
  type RepricingSku,
} from "@/lib/repricing";
const sku = (
  skuId: string,
  overrides: Partial<RepricingSku> = {},
): RepricingSku => ({
  skuId,
  sku: skuId,
  name: skuId,
  barcode: null,
  brandId: "brand",
  brandName: "Brand",
  categoryId: "cat",
  categoryName: "Category",
  classification: "DEAD",
  productKind: "MERCHANDISE",
  ownership: "OWN",
  currency: "UAH",
  quantity: "10",
  unitCost: "100",
  currentPrice: "400",
  lastSaleDate: "2026-01-01",
  firstReceiptDate: "2025-01-01",
  neverSold: false,
  sold: { 1: "0", 3: "2", 7: "4" },
  ...overrides,
});
const run = (rows: RepricingSku[], body: Record<string, unknown> = {}) =>
  calculateRepricing(
    { id: "inputs", snapshotId: "snapshot", asOf: "2026-10-25", rows },
    parseRepricingRequest({ inputSetId: "inputs", ...body }),
  );
function edit(
  rows: RepricingSku[],
  body: Record<string, unknown> = {},
  changes: Record<string, unknown> = {},
) {
  return run(rows, {
    ...body,
    editContext: run(rows, body).editContext,
    ...changes,
  });
}
describe("R1–R4 deterministic repricing", () => {
  it("ceil selects 22 of 31, breaks ties by SKU ID, and interpolates max to min", () => {
    const rows = Array.from({ length: 31 }, (_, i) =>
      sku(String(i).padStart(2, "0")),
    ).reverse();
    const r = run(rows);
    expect(r.counts.automaticSelectionCount).toBe(22);
    expect(r.rows.filter((x) => x.selected).map((x) => x.skuId)).toEqual(
      Array.from({ length: 22 }, (_, i) => String(i).padStart(2, "0")),
    );
    expect(r.rows[0].targetDiscountPct).toBe("40");
    expect(r.rows[21].targetDiscountPct).toBe("15");
    expect(run([...rows].reverse())).toEqual(r);
  });
  it("uses max for k=1, handles k=0 and re-ranks the final manual selection", () => {
    const rows = [sku("a"), sku("b"), sku("c")];
    const body = { parameters: { sharePct: 10 } };
    expect(run(rows, body).rows[0].targetDiscountPct).toBe("40");
    const empty = edit(rows, body, {
      selection: [{ skuId: "a", included: false }],
    });
    expect(empty.totals.skuCount).toBe(0);
    expect(empty.totals.weightedDiscount).toBeNull();
    expect(empty.canExport).toBe(false);
    const added = edit(rows, body, {
      selection: [{ skuId: "c", included: true }],
    });
    expect(added.rows[0].targetDiscountPct).toBe("40");
    expect(added.rows[2].targetDiscountPct).toBe("15");
    expect(added.counts.selectedSkuCount).toBe(2);
  });
  it("ranks turnover by age, explicitly handles never-sold stock and season maximum", () => {
    const rows = [
      sku("a", { lastSaleDate: "2026-10-01" }),
      sku("b", { lastSaleDate: null, neverSold: true }),
      sku("c", { lastSaleDate: null }),
    ];
    const r = run(rows, { parameters: { goal: "TURNOVER", sharePct: 100 } });
    expect(r.rows.find((x) => x.skuId === "b")!.rank).toBe(0);
    expect(r.rows.find((x) => x.skuId === "c")!.eligibilityReasons).toContain(
      "LAST_SALE_UNVERIFIED",
    );
    expect(
      run(rows, { parameters: { goal: "SEASON", sharePct: 100 } }).rows.every(
        (x) => x.targetDiscountPct === "40",
      ),
    ).toBe(true);
  });
  it("combines all filters with AND and treats unknown history as unknown", () => {
    const rows = [
      sku("yes"),
      sku("risk", { classification: "RISK" }),
      sku("brand", { brandId: "other" }),
      sku("cat", { categoryId: "other" }),
      sku("price", { currentPrice: "500" }),
      sku("stock", { quantity: "11" }),
      sku("sold", { sold: { 1: "0", 3: "3", 7: "4" } }),
      sku("unknown", { sold: { 1: null, 3: null, 7: null } }),
    ];
    const f = {
      status: "DEAD",
      brandId: "brand",
      categoryId: "cat",
      priceMin: "400",
      priceMax: "400",
      stockMin: "10",
      stockMax: "10",
      soldMonths: 3,
      soldMax: "2",
    };
    expect(run(rows, { filters: f }).rows.map((x) => x.skuId)).toEqual(["yes"]);
    expect(
      run(rows, { filters: { ...f, soldMonths: 1 } }).rows.map((x) => x.skuId),
    ).toEqual(["sold", "yes"]);
    expect(run(rows).counts.unknownSoldSkuCount).toBe(1);
  });
  it.each([
    { ownership: "CONSIGNMENT" },
    { ownership: "UNKNOWN" },
    { currentPrice: "0" },
    { unitCost: "0" },
    { unitCost: null },
    { currency: "USD" },
    { productKind: "SERVICE" },
    { classification: "ACTIVE" },
    { quantity: "0" },
  ])("rejects ineligible facts %j", (overrides) => {
    const row = sku("bad", overrides);
    expect(repricingEligibility(row).length).toBeGreaterThan(0);
    expect(run([row]).counts.eligibleSkuCount).toBe(0);
  });
  it("rounds half-up to 10 and clamps the automatic floor to ceil(cost/10)*10", () => {
    const r = run(
      [
        sku("half", { currentPrice: "350", unitCost: "10" }),
        sku("floor", { currentPrice: "300", unitCost: "235" }),
      ],
      {
        parameters: {
          minDiscountPct: 35,
          maxDiscountPct: 50,
          sharePct: 100,
          goal: "SEASON",
        },
      },
    );
    expect(r.rows.find((x) => x.skuId === "half")!.newPrice).toBe("180");
    expect(r.rows.find((x) => x.skuId === "floor")).toMatchObject({
      newPrice: "240",
      floorLimited: true,
    });
  });
  it("preserves manual cents and rejects manual values below the protected rounded floor", () => {
    const rows = [sku("a", { unitCost: "235" })];
    expect(
      edit(rows, {}, { manualPrices: [{ skuId: "a", price: "240.01" }] })
        .rows[0].newPrice,
    ).toBe("240.01");
    expect(() =>
      edit(rows, {}, { manualPrices: [{ skuId: "a", price: "235" }] }),
    ).toThrow("INVALID_MANUAL_REPRICING_PRICE");
    expect(
      edit(rows, {}, { manualPrices: [{ skuId: "a", price: "450" }] }).rows[0]
        .effectiveDiscount,
    ).toBe("-0.125");
  });
  it("requires explicit liquidation and a reason for below-cost prices", () => {
    const rows = [sku("a")];
    expect(() =>
      edit(
        rows,
        { parameters: { costProtection: false } },
        { manualPrices: [{ skuId: "a", price: "90" }] },
      ),
    ).toThrow("INVALID_MANUAL_REPRICING_PRICE");
    const r = edit(
      rows,
      {
        parameters: {
          costProtection: false,
          liquidation: true,
          liquidationReason: "Clear discontinued stock",
        },
      },
      { manualPrices: [{ skuId: "a", price: "90" }] },
    );
    expect(r.rows[0].marginTone).toBe("RED");
    expect(r.totals.grossProfit).toBe("-100");
  });
  it("blocks automatic zero prices and automatic increases rather than exporting partial selections", () => {
    const zero = run([sku("a", { currentPrice: "1", unitCost: "0.1" })], {
      parameters: {
        costProtection: false,
        liquidation: true,
        liquidationReason: "Liquidation",
      },
    });
    expect(zero.rows[0].priceErrors).toContain("NON_POSITIVE_PRICE");
    expect(zero.canExport).toBe(false);
    const increase = run(
      [sku("a", { currentPrice: "235", unitCost: "235" }), sku("b")],
      { parameters: { sharePct: 100 } },
    );
    expect(increase.rows[0].priceErrors).toContain("AUTOMATIC_PRICE_INCREASE");
    expect(increase.counts.blockedSelectedSkuCount).toBe(1);
    expect(increase.canExport).toBe(false);
  });
  it("weights discount by original stock value, reconciles GP, and excludes unchecked rows", () => {
    const rows = [
      sku("a", { quantity: "10", currentPrice: "100", unitCost: "10" }),
      sku("b", { quantity: "1", currentPrice: "1000", unitCost: "100" }),
    ];
    const r = edit(
      rows,
      { parameters: { sharePct: 100 } },
      {
        manualPrices: [
          { skuId: "a", price: "50" },
          { skuId: "b", price: "900" },
        ],
      },
    );
    expect(r.totals).toMatchObject({
      quantity: "11",
      costCapital: "200",
      oldPotentialRevenue: "2000",
      potentialRevenue: "1400",
      weightedDiscount: "0.3",
      grossProfit: "1200",
    });
    const unchecked = edit(
      rows,
      { parameters: { sharePct: 100 } },
      {
        selection: [{ skuId: "b", included: false }],
        manualPrices: [{ skuId: "b", price: "900" }],
      },
    );
    expect(unchecked.totals.quantity).toBe("10");
    expect(unchecked.rows.find((x) => x.skuId === "b")!.marginTone).toBe(
      "GRAY",
    );
  });
  it("rejects foreign/ineligible edits and resets edits when parameters or filters change", () => {
    const rows = [sku("a"), sku("bad", { ownership: "CONSIGNMENT" })];
    for (const id of ["foreign", "bad"])
      expect(() =>
        edit(rows, {}, { selection: [{ skuId: id, included: true }] }),
      ).toThrow("REPRICING_EDIT_INELIGIBLE");
    expect(() =>
      run(rows, {
        parameters: { sharePct: 100 },
        selection: [{ skuId: "a", included: true }],
        editContext: run(rows).editContext,
      }),
    ).toThrow("STALE_REPRICING_EDITS");
    expect(run(rows, { page: 2 }).previewId).toBe(run(rows).previewId);
  });
});
describe("repricing boundary validation", () => {
  it.each([
    { parameters: { goal: null } },
    { filters: { status: null } },
    { filters: { soldMonths: null } },
    { parameters: { minDiscountPct: 4 } },
    { parameters: { minDiscountPct: 36 } },
    { parameters: { maxDiscountPct: 19 } },
    { parameters: { maxDiscountPct: 61 } },
    { parameters: { minDiscountPct: 35, maxDiscountPct: 20 } },
    { parameters: { sharePct: 71 } },
    { parameters: { sharePct: 5 } },
    { parameters: { durationDays: 7 } },
    { parameters: { costProtection: "false" } },
    { parameters: { liquidation: true } },
    { parameters: { costProtection: false, liquidation: true } },
    { parameters: { liquidationReason: "orphan" } },
    { manualPrices: [{ skuId: "a", price: "1.001" }] },
    { manualPrices: [{ skuId: "a", price: "0" }] },
    { manualPrices: [{ skuId: "a", price: 100 }] },
    { manualPrices: [{ skuId: "a", price: "1e3" }] },
    { selection: [{ skuId: "a" }] },
    {
      selection: [
        { skuId: "a", included: true },
        { skuId: "a", included: false },
      ],
    },
    { filters: { priceMin: "10", priceMax: "9" } },
    { tenantId: "forged" },
    { rows: [] },
    { pageSize: 201 },
  ])("rejects invalid input %j", (body) =>
    expect(() =>
      parseRepricingRequest({ inputSetId: "inputs", ...body }),
    ).toThrow("INVALID_REPRICING_REQUEST"),
  );
  it("accepts parameter endpoints, all presets, and bounded positive prices", () => {
    expect(
      parseRepricingRequest({
        inputSetId: "inputs",
        parameters: {
          minDiscountPct: 5,
          maxDiscountPct: 60,
          sharePct: 10,
          durationDays: 4,
        },
      }).parameters.sharePct,
    ).toBe(10);
  });
});
