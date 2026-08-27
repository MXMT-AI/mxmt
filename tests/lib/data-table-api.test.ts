import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  getDataTable,
  parseDataTableQuery,
  toApiValue,
} from "@/lib/data-table-api";

function query(value = "") {
  return parseDataTableQuery(new URLSearchParams(value));
}

function baseDatabase() {
  return {
    dataSource: {
      findFirst: vi.fn(async () => ({ activeImportRunId: "import-1" })),
    },
    dataImportRun: { findFirst: vi.fn(async () => ({ id: "import-1" })) },
    reportCalculationRun: {
      findFirst: vi.fn(async () => ({
        id: "calc-1",
        importRunId: "import-1",
        dateFrom: new Date("2026-08-01T00:00:00.000Z"),
        dateTo: new Date("2026-08-31T00:00:00.000Z"),
        asOfDate: new Date("2026-08-27T00:00:00.000Z"),
      })),
    },
    dataSheetSnapshot: {
      findFirst: vi.fn(async ({ where }: { where: { sheetKey: string } }) =>
        where.sheetKey === "article_report_source"
          ? { columns: [{ key: "col_a", label: "ID" }, { key: "col_z", label: "Source field" }] }
          : { id: "snapshot-1", columns: [{ key: "col_a", label: "ID" }, { key: "col_b", label: "Name" }] }
      ),
    },
    dataSheetRow: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => [{ rowNumber: 2, data: { col_a: "SKU-1", col_b: "Product" } }]),
    },
    articleReportResult: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => [{
        productId: "SKU-1",
        article: "ART-1",
        name: "Product",
        brand: "Brand",
        category: "Category",
        costPrice: new Prisma.Decimal("40.125"),
        rrp: new Prisma.Decimal(120),
        retailPrice: new Prisma.Decimal(100),
        discount: new Prisma.Decimal("-0.1666666667"),
        gmPct: new Prisma.Decimal("0.59875"),
        salesUnits: new Prisma.Decimal(2),
        salesUah: new Prisma.Decimal("200.25"),
        costOfSalesUah: new Prisma.Decimal("80.25"),
        gpUah: new Prisma.Decimal(120),
        salesGmPct: new Prisma.Decimal("0.5992509363"),
        stockUnits: new Prisma.Decimal(3),
        stockUah: new Prisma.Decimal("120.375"),
        strPct: new Prisma.Decimal("0.4"),
        avgSalesLastTwoWeeks: new Prisma.Decimal(1),
        woh: new Prisma.Decimal(3),
        sourceValues: { articleReport: { col_a: "SKU-1", col_z: "Source value" } },
      }]),
    },
    brandReportResult: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => []),
    },
    categoryReportResult: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => [{
        category: null,
        salesUah: new Prisma.Decimal(200),
        salesUnits: new Prisma.Decimal(2),
        costOfSalesUah: new Prisma.Decimal(80),
        gpUah: new Prisma.Decimal(120),
        stockUnits: new Prisma.Decimal(3),
        stockUah: new Prisma.Decimal(120),
        strPct: new Prisma.Decimal("0.4"),
        salesSharePct: new Prisma.Decimal(1),
        avgSalesLastTwoWeeks: new Prisma.Decimal(1),
        woh: new Prisma.Decimal(3),
      }]),
    },
  };
}

describe("data table API service", () => {
  it("normalizes bounded pagination and filter parameters", () => {
    expect(query("page=0&pageSize=999&search=%20hello%20&sort=salesUah&direction=desc")).toEqual({
      page: 1,
      pageSize: 200,
      search: "hello",
      sort: "salesUah",
      direction: "desc",
      importRunId: null,
      calculationRunId: null,
    });
  });

  it("serializes Decimal, Date, nested arrays, and objects safely", () => {
    expect(toApiValue({
      amount: new Prisma.Decimal("123.4567"),
      date: new Date("2026-08-01T00:00:00.000Z"),
      nested: [new Prisma.Decimal("0.1")],
    })).toEqual({
      amount: "123.4567",
      date: "2026-08-01T00:00:00.000Z",
      nested: ["0.1"],
    });
  });

  it("returns raw source columns and enforces tenant scope in every query", async () => {
    const db = baseDatabase();
    const result = await getDataTable("tenant-1", "product_yml", query("search=SKU"), db as never);

    expect(result.columns.map((column) => column.label)).toEqual(["Row", "ID", "Name"]);
    expect(result.rows).toEqual([{ rowNumber: 2, col_a: "SKU-1", col_b: "Product" }]);
    expect(db.dataSheetSnapshot.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", importRunId: "import-1", sheetKey: "product_yml" },
      select: { id: true, columns: true },
    });
    expect(db.dataSheetRow.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ tenantId: "tenant-1", snapshotId: "snapshot-1" }),
    });
  });

  it("returns calculated decimals as strings and prefixes source-only ARTICLE columns", async () => {
    const db = baseDatabase();
    const result = await getDataTable("tenant-1", "article_report", query(), db as never);

    expect(result.rows[0]).toEqual(expect.objectContaining({
      productId: "SKU-1",
      salesUah: "200.25",
      discount: "-0.1666666667",
      source_col_z: "Source value",
    }));
    expect(result.columns).toContainEqual(expect.objectContaining({
      key: "source_col_z",
      label: "Source: Source field",
      sourceOnly: true,
      defaultVisible: false,
    }));
    expect(result.context).toEqual({
      importRunId: "import-1",
      calculationRunId: "calc-1",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      asOfDate: "2026-08-27",
    });
  });

  it("returns the explicit null category group and allows category sorting", async () => {
    const db = baseDatabase();
    const result = await getDataTable(
      "tenant-1",
      "by_category",
      query("sort=category&direction=desc"),
      db as never
    );

    expect(result.rows[0]).toEqual(expect.objectContaining({ category: null, salesUah: "200" }));
    expect(db.categoryReportResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { category: "desc" } })
    );
  });
});
