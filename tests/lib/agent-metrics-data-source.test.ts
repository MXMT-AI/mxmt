import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveAgentImportRunId: vi.fn(),
  sourceProductFindMany: vi.fn(),
  sourceSaleLineFindMany: vi.fn(),
  dataSheetSnapshotFindUnique: vi.fn(),
}));

vi.mock("@/lib/agent-data-source", () => ({
  getActiveAgentImportRunId: mocks.getActiveAgentImportRunId,
  brandValueFromAgentId: (brandId: string) => {
    if (brandId === "brand:null") return null;
    return brandId.replace(/^brand:value:/, "");
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sourceProduct: { findMany: mocks.sourceProductFindMany },
    sourceSaleLine: { findMany: mocks.sourceSaleLineFindMany },
    dataSheetSnapshot: { findUnique: mocks.dataSheetSnapshotFindUnique },
  },
}));

import { getAttributeMetrics } from "@/lib/attribute-metrics";
import { getBrandMetrics } from "@/lib/brand-metrics";
import { getChannelMetrics } from "@/lib/channel-metrics";
import { simulatePromo } from "@/lib/promo-calc";
import { simulateReorder } from "@/lib/reorder-calc";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("agent metrics use the active normalized import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveAgentImportRunId.mockResolvedValue("import-1");
    mocks.dataSheetSnapshotFindUnique.mockResolvedValue({
      columns: [{ key: "col_i", label: "sajt" }],
    });
  });

  it("builds brand metrics from SourceProduct and SourceSaleLine", async () => {
    mocks.sourceProductFindMany.mockResolvedValue([
      { productId: "p1", brand: "A", costPrice: 40, stockUnits: 10 },
      { productId: "p2", brand: "A", costPrice: 20, stockUnits: 5 },
      { productId: "p3", brand: null, costPrice: 10, stockUnits: 2 },
    ]);
    mocks.sourceSaleLineFindMany.mockResolvedValue([
      { resolvedProductId: "p1", paymentDate: date("2026-08-29"), normalizedQuantity: 2, normalizedSales: 200, normalizedCost: 80 },
      { resolvedProductId: "p2", paymentDate: date("2026-08-20"), normalizedQuantity: 1, normalizedSales: 80, normalizedCost: 20 },
      { resolvedProductId: "p1", paymentDate: date("2026-08-10"), normalizedQuantity: 1, normalizedSales: 100, normalizedCost: 40 },
    ]);

    const result = await getBrandMetrics("tenant-1", date("2026-09-01"));
    const brand = result.find((item) => item.brandName === "A")!;

    expect(mocks.sourceProductFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-1", importRunId: "import-1" },
    }));
    expect(brand).toMatchObject({
      brandId: "brand:value:A",
      skuCount: 2,
      totalStock: 15,
      salesLast7d: 2,
      salesLast30d: 4,
      gmPercent: 63.2,
      frozenCapital: 500,
    });
    expect(result.find((item) => item.brandId === "brand:null")?.brandName).toBe("Без бренда");
  });

  it("groups ZAVOD_API sales by its opaque sajt channel code", async () => {
    mocks.sourceProductFindMany.mockResolvedValue([{ stockUnits: 20 }, { stockUnits: 30 }]);
    mocks.sourceSaleLineFindMany.mockResolvedValue([
      { resolvedProductId: "p1", paymentDate: date("2026-08-30"), normalizedQuantity: 5, normalizedSales: 500, sourceValues: { col_i: 38 } },
      { resolvedProductId: "p2", paymentDate: date("2026-08-15"), normalizedQuantity: 2, normalizedSales: 150, sourceValues: { col_i: "79" } },
      { resolvedProductId: "p2", paymentDate: date("2026-08-31"), normalizedQuantity: -1, normalizedSales: -75, sourceValues: { col_i: "88" } },
      { resolvedProductId: "p3", paymentDate: date("2026-08-29"), normalizedQuantity: 1, normalizedSales: 25, sourceValues: {} },
    ]);

    const result = await getChannelMetrics("tenant-1", date("2026-09-01"));

    expect(result.totalStock).toBe(50);
    expect(result.channels).toEqual([
      {
        channel: "Site 38",
        grossSalesLast7d: 5,
        returnsLast7d: 0,
        grossSalesLast30d: 5,
        returnsLast30d: 0,
        grossRevenue30d: 500,
        returnsRevenue30d: 0,
        salesLast7d: 5,
        salesLast30d: 5,
        revenue30d: 500,
        skuCount: 1,
        strPercent: 10,
      },
      {
        channel: "Site 79",
        grossSalesLast7d: 0,
        returnsLast7d: 0,
        grossSalesLast30d: 2,
        returnsLast30d: 0,
        grossRevenue30d: 150,
        returnsRevenue30d: 0,
        salesLast7d: 0,
        salesLast30d: 2,
        revenue30d: 150,
        skuCount: 0,
        strPercent: 0,
      },
      {
        channel: "Невідомий канал",
        grossSalesLast7d: 1,
        returnsLast7d: 0,
        grossSalesLast30d: 1,
        returnsLast30d: 0,
        grossRevenue30d: 25,
        returnsRevenue30d: 0,
        salesLast7d: 1,
        salesLast30d: 1,
        revenue30d: 25,
        skuCount: 1,
        strPercent: 2,
      },
      {
        channel: "Site 88",
        grossSalesLast7d: 0,
        returnsLast7d: 1,
        grossSalesLast30d: 0,
        returnsLast30d: 1,
        grossRevenue30d: 0,
        returnsRevenue30d: 75,
        salesLast7d: -1,
        salesLast30d: -1,
        revenue30d: -75,
        skuCount: 0,
        strPercent: 0,
      },
    ]);
    expect(mocks.sourceSaleLineFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ sourceValues: true }),
    }));
  });

  it("groups normalized products and net sales by category", async () => {
    mocks.sourceProductFindMany.mockResolvedValue([
      { productId: "p1", category: "Shoes", stockUnits: 10 },
      { productId: "p2", category: "Shoes", stockUnits: 10 },
      { productId: "p3", category: null, stockUnits: 5 },
    ]);
    mocks.sourceSaleLineFindMany.mockResolvedValue([
      { resolvedProductId: "p1", paymentDate: date("2026-08-30"), normalizedQuantity: 4 },
      { resolvedProductId: "p1", paymentDate: date("2026-08-31"), normalizedQuantity: -1 },
    ]);

    const result = await getAttributeMetrics("tenant-1", date("2026-09-01"));

    expect(result.byCategory[0]).toMatchObject({
      attribute: "Shoes",
      skuCount: 2,
      totalStock: 20,
      grossSalesLast7d: 4,
      returnsLast7d: 1,
      grossSalesLast30d: 4,
      returnsLast30d: 1,
      salesLast7d: 3,
      salesLast30d: 3,
      strPercent: 20,
      status: "normal",
    });
    expect(result.byCategory.find((item) => item.attribute === "Other")?.status).toBe("dead");
    expect(result.bySubcategory).toEqual([]);
  });

  it("distinguishes sold-out and inactive categories from dead stock", async () => {
    mocks.sourceProductFindMany.mockResolvedValue([
      { productId: "sold-out", category: "Sold out", stockUnits: 0 },
      { productId: "inactive", category: "Inactive", stockUnits: 0 },
    ]);
    mocks.sourceSaleLineFindMany.mockResolvedValue([
      { resolvedProductId: "sold-out", paymentDate: date("2026-08-30"), normalizedQuantity: 2 },
    ]);

    const result = await getAttributeMetrics("tenant-1", date("2026-09-01"));

    expect(result.byCategory.find((item) => item.attribute === "Sold out")?.status).toBe("stockout");
    expect(result.byCategory.find((item) => item.attribute === "Inactive")?.status).toBe("inactive");
    expect(result.deadCategories).toEqual([]);
  });

  it("keeps selling categories slow instead of dead and merges category aliases", async () => {
    mocks.sourceProductFindMany.mockResolvedValue([
      { productId: "p1", category: "Книги", stockUnits: 10 },
      { productId: "p2", category: "  Книжки\u00a0", stockUnits: 10 },
    ]);
    mocks.sourceSaleLineFindMany.mockResolvedValue([
      { resolvedProductId: "p1", paymentDate: date("2026-08-10"), normalizedQuantity: 2 },
      { resolvedProductId: "p2", paymentDate: date("2026-08-11"), normalizedQuantity: -1 },
    ]);

    const result = await getAttributeMetrics("tenant-1", date("2026-09-01"));

    expect(result.byCategory).toHaveLength(1);
    expect(result.byCategory[0]).toMatchObject({
      attribute: "Книги",
      skuCount: 2,
      totalStock: 20,
      grossSalesLast7d: 0,
      returnsLast7d: 0,
      grossSalesLast30d: 2,
      returnsLast30d: 1,
      salesLast30d: 1,
      strPercent: 0,
      status: "slow",
    });
    expect(result.deadCategories).toEqual([]);
  });

  it("returns empty metrics when the tenant has no active successful import", async () => {
    mocks.getActiveAgentImportRunId.mockResolvedValue(null);

    await expect(getBrandMetrics("tenant-1")).resolves.toEqual([]);
    await expect(getChannelMetrics("tenant-1")).resolves.toMatchObject({ channels: [] });
    await expect(getAttributeMetrics("tenant-1")).resolves.toMatchObject({ byCategory: [] });
    expect(mocks.sourceProductFindMany).not.toHaveBeenCalled();
  });

  it("runs repricing simulation against normalized products and net sale lines", async () => {
    mocks.sourceProductFindMany.mockResolvedValue([{
      productId: "p1",
      article: "SKU-1",
      vendorCode: null,
      name: "Boot",
      category: "Shoes",
      retailPrice: 100,
      costPrice: 40,
      stockUnits: 10,
    }]);
    mocks.sourceSaleLineFindMany.mockResolvedValue([
      { resolvedProductId: "p1", normalizedQuantity: 6 },
      { resolvedProductId: "p1", normalizedQuantity: -1 },
    ]);

    const result = await simulatePromo({
      tenantId: "tenant-1",
      brandId: "brand:value:A",
      discountPercent: 20,
      durationDays: 10,
      unitsToSellPercent: 50,
      asOf: date("2026-09-01"),
      dateFrom: date("2026-08-22"),
    });

    expect(result.brandName).toBe("A");
    expect(result.rows[0]).toMatchObject({
      sku: "SKU-1",
      stock: 10,
      velocityPerDay: 0.5,
      promoUnits: 5,
      newPrice: 80,
      promoRevenue: 400,
      capitalReleased: 200,
    });
  });

  it("runs reordering simulation against normalized products and net sale lines", async () => {
    mocks.sourceProductFindMany.mockResolvedValue([{
      productId: "p1",
      article: null,
      vendorCode: "V-1",
      name: "Boot",
      category: "Shoes",
      costPrice: 40,
      stockUnits: 5,
    }]);
    mocks.sourceSaleLineFindMany.mockResolvedValue([
      { resolvedProductId: "p1", normalizedQuantity: 10 },
    ]);

    const result = await simulateReorder({
      tenantId: "tenant-1",
      brandId: "brand:value:A",
      qtyMultiplier: 1,
      asOf: date("2026-09-01"),
      dateFrom: date("2026-08-22"),
    });

    expect(result.rows[0]).toMatchObject({
      sku: "V-1",
      stock: 5,
      velocityPerDay: 1,
      orderQty: 40,
      orderCost: 1600,
      stockAfter: 45,
    });
  });
});
