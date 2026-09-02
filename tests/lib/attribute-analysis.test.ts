import { describe, expect, it } from "vitest";
import { buildAttributeAnalysis } from "@/lib/attribute-analysis";

describe("attribute analysis", () => {
  it("keeps data-derived stockout/inactive statuses even when AI says dead", () => {
    const categories = [
      {
        attribute: "Окуляри",
        skuCount: 2,
        totalStock: 0,
        grossSalesLast7d: 3,
        returnsLast7d: 0,
        grossSalesLast30d: 5,
        returnsLast30d: 0,
        salesLast7d: 3,
        salesLast30d: 5,
        strPercent: 0,
        status: "stockout" as const,
      },
      {
        attribute: "Журнали",
        skuCount: 1,
        totalStock: 0,
        grossSalesLast7d: 0,
        returnsLast7d: 0,
        grossSalesLast30d: 0,
        returnsLast30d: 0,
        salesLast7d: 0,
        salesLast30d: 0,
        strPercent: 0,
        status: "inactive" as const,
      },
    ];

    const result = buildAttributeAnalysis(categories, {
      by_category: categories.map((category) => ({
        category: category.attribute,
        status: "dead",
        insight: "AI text",
        recommendation: "AI action",
      })),
    });

    expect(result.by_category.map((category) => category.status)).toEqual(["stockout", "inactive"]);
    expect(result.dead_stock).toEqual([]);
    expect(result.by_category[0].insight).toBe("AI text");
  });
});
