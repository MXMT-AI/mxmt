import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { ArticleReportRow } from "@/lib/article-report";
import { calculateGroupedReportRows } from "@/lib/grouped-reports";

function row(
  productId: string,
  brand: string | null,
  category: string | null,
  values: {
    salesUah: number;
    salesUnits: number;
    cost: number;
    stockUnits: number;
    stockUah: number;
    avg: number;
  }
): ArticleReportRow {
  const d = (value: number) => new Prisma.Decimal(value);
  return {
    productId,
    article: null,
    name: productId,
    brand,
    category,
    costPrice: d(0),
    rrp: d(0),
    retailPrice: d(0),
    discount: null,
    gmPct: null,
    salesUnits: d(values.salesUnits),
    salesUah: d(values.salesUah),
    costOfSalesUah: d(values.cost),
    gpUah: d(values.salesUah - values.cost),
    salesGmPct: null,
    stockUnits: d(values.stockUnits),
    stockUah: d(values.stockUah),
    strPct: null,
    avgSalesLastTwoWeeks: d(values.avg),
    woh: null,
    sourceValues: {},
  };
}

describe("BY BRAND and BY CATEGORY aggregation", () => {
  const rows = [
    row("A", "Brand A", "Category 1", { salesUah: 200, salesUnits: 2, cost: 100, stockUnits: 10, stockUah: 500, avg: 3 }),
    row("B", "Brand A", "Category 2", { salesUah: 300, salesUnits: 3, cost: 180, stockUnits: 5, stockUah: 250, avg: 2 }),
    row("C", null, "Category 1", { salesUah: 500, salesUnits: 5, cost: 200, stockUnits: 5, stockUah: 100, avg: 5 }),
  ];

  it("uses weighted formulas instead of averaging item ratios", () => {
    const brands = calculateGroupedReportRows(rows, "brand");
    const brand = brands.find((item) => item.groupValue === "Brand A")!;

    expect(brand.salesUah.toString()).toBe("500");
    expect(brand.salesUnits.toString()).toBe("5");
    expect(brand.costOfSalesUah.toString()).toBe("280");
    expect(brand.gpUah.toString()).toBe("220");
    expect(brand.stockUnits.toString()).toBe("15");
    expect(brand.stockUah.toString()).toBe("750");
    expect(brand.strPct?.toString()).toBe("0.25");
    expect(brand.salesSharePct?.toString()).toBe("0.5");
    expect(brand.avgSalesLastTwoWeeks.toString()).toBe("5");
    expect(brand.woh?.toString()).toBe("3");
  });

  it("keeps null values as an explicit collision-safe unassigned group", () => {
    const brands = calculateGroupedReportRows(rows, "brand");
    const unassigned = brands.find((item) => item.groupValue === null)!;

    expect(unassigned.groupKey).toBe("brand:null");
    expect(unassigned.salesUah.toString()).toBe("500");
    expect(unassigned.salesSharePct?.toString()).toBe("0.5");
    expect(brands.find((item) => item.groupValue === "Brand A")?.groupKey).toBe(
      "brand:value:Brand A"
    );
  });

  it("groups categories with the same formulas and reconciles totals", () => {
    const categories = calculateGroupedReportRows(rows, "category");
    const category = categories.find((item) => item.groupValue === "Category 1")!;

    expect(category.salesUah.toString()).toBe("700");
    expect(category.salesUnits.toString()).toBe("7");
    expect(category.stockUnits.toString()).toBe("15");
    expect(category.strPct?.toString()).toBe(new Prisma.Decimal(7).div(22).toString());
    expect(category.salesSharePct?.toString()).toBe("0.7");
    expect(category.woh?.toString()).toBe(new Prisma.Decimal(15).div(8).toString());
  });

  it("returns null percentage and WOH when aggregate denominators are zero", () => {
    const [group] = calculateGroupedReportRows(
      [row("Z", "Zero", "Zero", { salesUah: 0, salesUnits: 0, cost: 0, stockUnits: 0, stockUah: 0, avg: 0 })],
      "brand"
    );

    expect(group.strPct).toBeNull();
    expect(group.salesSharePct).toBeNull();
    expect(group.woh).toBeNull();
  });
});
