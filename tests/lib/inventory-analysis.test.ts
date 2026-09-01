import { describe, expect, it } from "vitest";
import type { BrandMetric } from "@/lib/brand-metrics";
import { buildInventoryResults, selectInventoryAiCandidates } from "@/lib/inventory-analysis";

function metric(overrides: Partial<BrandMetric>): BrandMetric {
  return {
    brandId: "brand:value:Test",
    brandName: "Test",
    skuCount: 1,
    totalStock: 10,
    salesLast7d: 0,
    salesLast30d: 0,
    salesPrev7d: 0,
    avgDailyVelocity: 0,
    wohDays: 9999,
    strPercent: 0,
    trend7dPct: 0,
    gmPercent: 0,
    frozenCapital: 100,
    periodDays: 30,
    ...overrides,
  };
}

describe("Inventory Analyst result contract", () => {
  it("covers every brand and does not let AI mark zero-stock as excellent", () => {
    const metrics = [
      metric({
        brandId: "brand:value:Sold out",
        brandName: "Sold out",
        totalStock: 0,
        salesLast7d: 2,
        salesLast30d: 5,
        avgDailyVelocity: 0.2,
        wohDays: 0,
        trend7dPct: 100,
      }),
      metric({ brandId: "brand:value:No sales", brandName: "No sales" }),
    ];
    const aiResults = [{
      brand_id: "brand:value:Sold out",
      brand_name: "Sold out",
      status: "excellent",
      analysis: "AI incorrectly called this excellent",
      confidence: 0.9,
      metrics_evaluation: {},
      suggested_actions: [],
      urgency: "low",
    }];

    const results = buildInventoryResults(metrics, aiResults);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      brand_id: "brand:value:Sold out",
      status: "critical",
      urgency: "immediate",
      suggested_actions: ["reordering"],
    });
    expect(results[1]).toMatchObject({
      brand_id: "brand:value:No sales",
      status: "critical",
      urgency: "immediate",
    });
    expect(results[1].analysis).toContain("Немає продажів");
  });
});

describe("inventory AI enrichment", () => {
  it("prioritizes risky brands while deterministic output still covers all brands", () => {
    const metrics = Array.from({ length: 30 }, (_, index) => ({
      brandId: `brand:${index}`,
      brandName: `Brand ${index}`,
      skuCount: 1,
      totalStock: index === 29 ? 0 : 10,
      salesLast7d: index === 29 ? 5 : 10,
      salesLast30d: 10,
      salesPrev7d: 10,
      avgDailyVelocity: 1,
      wohDays: index === 29 ? 0 : 10,
      strPercent: 10,
      trend7dPct: 0,
      gmPercent: 50,
      frozenCapital: 100,
      periodDays: 30,
    }));

    const selected = selectInventoryAiCandidates(metrics, 20);

    expect(selected).toHaveLength(20);
    expect(selected.map((metric) => metric.brandId)).toContain("brand:29");
  });
});
