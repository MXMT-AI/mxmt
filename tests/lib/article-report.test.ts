import { DataRunStatus, Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  ArticleReportPeriodError,
  calculateArticleReport,
  calculateArticleReportRows,
  resolveArticleReportPeriod,
} from "@/lib/article-report";

const product = {
  productId: "SKU-1",
  article: "ART-1",
  name: "Product",
  brand: "Brand",
  category: "Category",
  retailPrice: new Prisma.Decimal(80),
  oldPrice: new Prisma.Decimal(100),
  costPrice: new Prisma.Decimal(50),
  stockUnits: new Prisma.Decimal(10),
  sourceValues: { col_b: "SKU-1" },
};

function sale(date: string, quantity: number, sales: number, cost: number) {
  return {
    paymentDate: new Date(`${date}T00:00:00.000Z`),
    resolvedProductId: "SKU-1",
    normalizedQuantity: new Prisma.Decimal(quantity),
    normalizedSales: new Prisma.Decimal(sales),
    normalizedCost: new Prisma.Decimal(cost),
  };
}

describe("ARTICLE REPORT calculation", () => {
  it("calculates the approved product, period, rolling, and inventory formulas", () => {
    const period = resolveArticleReportPeriod({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-05",
      asOfDate: "2026-08-20",
    });
    const rows = calculateArticleReportRows(
      [product],
      [
        sale("2026-08-02", 2, 160, 100),
        sale("2026-08-03", 1, 80, 50),
        sale("2026-08-04", -1, -80, -50),
        sale("2026-08-10", 6, 480, 300),
        sale("2026-08-20", 100, 8_000, 5_000),
      ],
      period,
      new Map([["SKU-1", { col_a: "SKU-1", col_z: "source-only" }]])
    );
    const row = rows[0];

    expect(row.rrp.toString()).toBe("100");
    expect(row.discount?.toString()).toBe("-0.2");
    expect(row.gmPct?.toString()).toBe("0.375");
    expect(row.salesUnits.toString()).toBe("2");
    expect(row.salesUah.toString()).toBe("160");
    expect(row.costOfSalesUah.toString()).toBe("100");
    expect(row.gpUah.toString()).toBe("60");
    expect(row.salesGmPct?.toString()).toBe("0.375");
    expect(row.stockUah.toString()).toBe("500");
    expect(row.strPct?.toString()).toBe(new Prisma.Decimal(1).div(6).toString());
    expect(row.avgSalesLastTwoWeeks.toString()).toBe("3");
    expect(row.woh?.toString()).toBe(new Prisma.Decimal(10).div(3).toString());
    expect(row.sourceValues).toEqual({
      product: { col_b: "SKU-1" },
      articleReport: { col_a: "SKU-1", col_z: "source-only" },
    });
  });

  it("creates rows for products without sales and returns null for zero denominators", () => {
    const period = resolveArticleReportPeriod({ asOfDate: "2026-08-20" });
    const [row] = calculateArticleReportRows(
      [{ ...product, oldPrice: null, retailPrice: 0, costPrice: 0, stockUnits: 0 }],
      [],
      period
    );

    expect(row.rrp.toString()).toBe("0");
    expect(row.discount).toBeNull();
    expect(row.gmPct).toBeNull();
    expect(row.salesUnits.toString()).toBe("0");
    expect(row.salesGmPct).toBeNull();
    expect(row.strPct).toBeNull();
    expect(row.avgSalesLastTwoWeeks.toString()).toBe("0");
    expect(row.woh).toBeNull();
  });

  it("does not clamp negative metrics caused by net returns", () => {
    const period = resolveArticleReportPeriod({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      asOfDate: "2026-08-20",
    });
    const [row] = calculateArticleReportRows(
      [product],
      [sale("2026-08-10", -1, -80, -50)],
      period
    );

    expect(row.salesUnits.toString()).toBe("-1");
    expect(row.salesUah.toString()).toBe("-80");
    expect(row.gpUah.toString()).toBe("-30");
    expect(row.strPct?.toString()).toBe(new Prisma.Decimal(-1).div(9).toString());
    expect(row.avgSalesLastTwoWeeks.toString()).toBe("-0.5");
    expect(row.woh?.toString()).toBe("-20");
  });

  it("uses the Kyiv calendar month by default and validates the inclusive period", () => {
    const period = resolveArticleReportPeriod({ now: new Date("2026-01-31T22:30:00.000Z") });
    expect(period.asOfDate.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(period.dateFrom.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(period.dateTo.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(period.rollingFrom.toISOString()).toBe("2026-01-18T00:00:00.000Z");
    expect(period.rollingTo.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(() =>
      resolveArticleReportPeriod({ dateFrom: "2026-08-02", dateTo: "2026-08-01" })
    ).toThrow(ArticleReportPeriodError);
    expect(() => resolveArticleReportPeriod({ dateFrom: "2026-02-30" })).toThrow(
      ArticleReportPeriodError
    );
  });

  it("persists one immutable row per product and completes the calculation run", async () => {
    const reportUpdate = vi.fn(async () => ({ id: "calc-1" }));
    const createMany = vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
    const db = {
      dataImportRun: { findFirst: vi.fn(async () => ({ id: "import-1" })) },
      reportCalculationRun: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: "calc-1", status: DataRunStatus.RUNNING, warnings: [] })),
        update: reportUpdate,
        updateMany: vi.fn(),
      },
      sourceProduct: { findMany: vi.fn(async () => [product]) },
      sourceSaleLine: { findMany: vi.fn(async () => [sale("2026-08-02", 2, 160, 100)]) },
      dataSheetSnapshot: { findUnique: vi.fn(async () => null) },
      articleReportResult: {
        createMany,
        count: vi.fn(async () => 0),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      brandReportResult: {
        createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
        count: vi.fn(async () => 0),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      categoryReportResult: {
        createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
        count: vi.fn(async () => 0),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
    };

    const result = await calculateArticleReport(
      {
        tenantId: "tenant-1",
        importRunId: "import-1",
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
        asOfDate: "2026-08-20",
      },
      db as never
    );

    expect(result.outcome).toBe("calculated");
    expect(result.rowCount).toBe(1);
    expect(result.brandRowCount).toBe(1);
    expect(result.categoryRowCount).toBe(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ tenantId: "tenant-1", calculationRunId: "calc-1", productId: "SKU-1" })],
    });
    expect(db.brandReportResult.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tenantId: "tenant-1",
          calculationRunId: "calc-1",
          brand: "Brand",
        }),
      ],
    });
    expect(db.categoryReportResult.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tenantId: "tenant-1",
          calculationRunId: "calc-1",
          category: "Category",
        }),
      ],
    });
    expect(reportUpdate).toHaveBeenCalledWith({
      where: { id: "calc-1" },
      data: expect.objectContaining({ status: DataRunStatus.SUCCESS }),
    });
  });

  it("returns an existing successful cache entry without recalculating", async () => {
    const db = {
      dataImportRun: { findFirst: vi.fn(async () => ({ id: "import-1" })) },
      reportCalculationRun: {
        findFirst: vi.fn(async () => ({ id: "calc-1", status: DataRunStatus.SUCCESS, warnings: [] })),
      },
      articleReportResult: { count: vi.fn(async () => 4050) },
      brandReportResult: { count: vi.fn(async () => 250) },
      categoryReportResult: { count: vi.fn(async () => 40) },
    };
    const result = await calculateArticleReport(
      { tenantId: "tenant-1", importRunId: "import-1", asOfDate: "2026-08-20" },
      db as never
    );

    expect(result.outcome).toBe("cached");
    expect(result.rowCount).toBe(4050);
    expect(result.brandRowCount).toBe(250);
    expect(result.categoryRowCount).toBe(40);
  });

  it("marks a calculation as failed when result persistence is incomplete", async () => {
    const reportUpdate = vi.fn(async () => ({ id: "calc-1" }));
    const db = {
      dataImportRun: { findFirst: vi.fn(async () => ({ id: "import-1" })) },
      reportCalculationRun: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: "calc-1", status: DataRunStatus.RUNNING, warnings: [] })),
        update: reportUpdate,
      },
      sourceProduct: { findMany: vi.fn(async () => [product]) },
      sourceSaleLine: { findMany: vi.fn(async () => []) },
      dataSheetSnapshot: { findUnique: vi.fn(async () => null) },
      articleReportResult: {
        createMany: vi.fn(async () => {
          throw new Error("result insert failed");
        }),
      },
      brandReportResult: { createMany: vi.fn() },
      categoryReportResult: { createMany: vi.fn() },
    };

    await expect(
      calculateArticleReport(
        { tenantId: "tenant-1", importRunId: "import-1", asOfDate: "2026-08-20" },
        db as never
      )
    ).rejects.toThrow("result insert failed");
    expect(reportUpdate).toHaveBeenLastCalledWith({
      where: { id: "calc-1" },
      data: expect.objectContaining({
        status: DataRunStatus.FAILED,
        errorMessage: "result insert failed",
      }),
    });
  });
});
