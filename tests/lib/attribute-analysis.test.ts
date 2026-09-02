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
    expect(result.by_category[0].insight).toBe(
      "За вибраний період: валові продажі — 5 од., повернення — 0 од., чисті продажі — 5 од.; поточний залишок — 0 од."
    );
    expect(result.by_category[0].recommendation).toBe("AI action");
  });

  it("always builds the factual category description from calculated metrics", () => {
    const result = buildAttributeAnalysis([{
      attribute: "Книги",
      skuCount: 2,
      totalStock: 20,
      grossSalesLast7d: 0,
      returnsLast7d: 0,
      grossSalesLast30d: 2,
      returnsLast30d: 1,
      salesLast7d: 0,
      salesLast30d: 1,
      strPercent: 0,
      status: "slow",
    }], {
      by_category: [{
        category: "Книги",
        insight: "Продажів не було",
        recommendation: "Перевірити викладку",
      }],
    });

    expect(result.by_category[0]).toMatchObject({
      status: "slow",
      insight: "STR за 7 днів — 0%, валові продажі за вибраний період — 2 од., повернення — 1 од., чисті продажі — 1 од., залишок — 20 од.",
      recommendation: "Перевірити викладку",
    });
  });
});
