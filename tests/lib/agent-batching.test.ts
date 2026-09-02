import { describe, expect, it } from "vitest";
import { runAgentBatches } from "@/lib/agent-batching";
import {
  buildCommercialFallback,
  buildReorderingFallback,
  buildRepricingFallback,
  maxSafeDiscountPercent,
  normalizeRepricingResult,
  normalizeReorderingResult,
} from "@/lib/agent-fallbacks";
import type { BrandMetric } from "@/lib/brand-metrics";

describe("batched agent execution", () => {
  it("preserves successful batches and substitutes a fallback for a failed batch", async () => {
    const result = await runAgentBatches({
      items: [1, 2, 3, 4, 5],
      batchSize: 2,
      concurrency: 2,
      runBatch: async (items) => {
        if (items.includes(3)) throw new Error("provider timeout");
        return items.map((item) => `ai-${item}`);
      },
      fallbackBatch: (items) => items.map((item) => `fallback-${item}`),
    });

    expect(result.results).toEqual(["ai-1", "ai-2", "fallback-3", "fallback-4", "ai-5"]);
    expect(result.errors).toEqual([{ batchIndex: 1, message: "provider timeout" }]);
  });
});

describe("decision agent fallbacks", () => {
  it("keeps repricing simulation usable when an AI batch times out", () => {
    const metric: BrandMetric = {
      brandId: "brand:value:A",
      brandName: "A",
      skuCount: 3,
      totalStock: 100,
      salesLast7d: 1,
      salesLast30d: 10,
      salesPrev7d: 3,
      avgDailyVelocity: 0.3,
      wohDays: 333,
      strPercent: 1,
      trend7dPct: -40,
      gmPercent: 55,
      frozenCapital: 10_000,
      periodDays: 30,
    };

    const result = buildRepricingFallback(metric);

    expect(result.options).toHaveLength(3);
    expect(result.options.filter((option) => option.evaluation.recommended)).toHaveLength(1);
    expect(result.options.map((option) => option.strategy_type)).toEqual([
      "AGGRESSIVE",
      "BALANCED",
      "CONSERVATIVE",
    ]);
  });

  it("selects a no-discount conservative option for a growing brand", () => {
    const metric: BrandMetric = {
      brandId: "brand:value:GROWING",
      brandName: "Growing",
      skuCount: 3,
      totalStock: 100,
      salesLast7d: 10,
      salesLast30d: 20,
      salesPrev7d: 5,
      avgDailyVelocity: 0.67,
      wohDays: 149,
      strPercent: 10,
      trend7dPct: 100,
      gmPercent: 55,
      frozenCapital: 10_000,
      periodDays: 30,
    };
    const ai = buildRepricingFallback(metric);
    ai.options.forEach((option) => {
      option.evaluation.recommended = option.strategy_type === "BALANCED";
      option.evaluation.score = option.strategy_type === "BALANCED" ? 10 : 4;
    });

    const result = normalizeRepricingResult(metric, ai);
    const recommended = result.options.find((option) => option.evaluation.recommended)!;

    expect(recommended.strategy_type).toBe("CONSERVATIVE");
    expect(recommended.discount_percent).toBe(0);
    expect(recommended.evaluation.score).toBeGreaterThan(
      Math.max(...result.options.filter((option) => !option.evaluation.recommended).map((option) => option.evaluation.score))
    );
  });

  it("caps discounts at a safe margin and calculates DOH on the server", () => {
    const metric: BrandMetric = {
      brandId: "brand:value:LOW_MARGIN",
      brandName: "Low margin",
      skuCount: 3,
      totalStock: 100,
      salesLast7d: 1,
      salesLast30d: 9,
      salesPrev7d: 3,
      avgDailyVelocity: 0.3,
      wohDays: 333,
      strPercent: 1,
      trend7dPct: -67,
      gmPercent: 40,
      frozenCapital: 10_000,
      periodDays: 30,
    };
    const ai = buildRepricingFallback(metric);
    const aggressive = ai.options.find((option) => option.strategy_type === "AGGRESSIVE")!;
    aggressive.discount_percent = 70;
    aggressive.forecast.units_to_sell_percent = 50;

    const result = normalizeRepricingResult(metric, ai);
    const recommended = result.options.find((option) => option.evaluation.recommended)!;

    expect(maxSafeDiscountPercent(metric)).toBe(33);
    expect(recommended.strategy_type).toBe("AGGRESSIVE");
    expect(recommended.discount_percent).toBe(33);
    expect(recommended.forecast.margin_after_percent).toBeGreaterThanOrEqual(10);
    expect(recommended.forecast.woh_after).toBe(167);
    expect(recommended.evaluation.risks[0]).toContain("обмежено до 33%");
  });

  it("does not invent post-promo stock days without sales history", () => {
    const metric: BrandMetric = {
      brandId: "brand:value:NO_SALES",
      brandName: "No sales",
      skuCount: 2,
      totalStock: 50,
      salesLast7d: 0,
      salesLast30d: 0,
      salesPrev7d: 0,
      avgDailyVelocity: 0,
      wohDays: 9999,
      strPercent: 0,
      trend7dPct: 0,
      gmPercent: 60,
      frozenCapital: 5_000,
      periodDays: 30,
    };

    const result = normalizeRepricingResult(metric, buildRepricingFallback(metric));

    expect(result.options.every((option) => option.forecast.woh_after === null)).toBe(true);
    expect(result.current_situation).toContain("прогноз днів запасу недоступний");
  });

  it("keeps reordering simulation usable when an AI batch times out", () => {
    const metric: BrandMetric = {
      brandId: "brand:value:B",
      brandName: "B",
      skuCount: 2,
      totalStock: 5,
      salesLast7d: 10,
      salesLast30d: 30,
      salesPrev7d: 8,
      avgDailyVelocity: 1,
      wohDays: 5,
      strPercent: 200,
      trend7dPct: 25,
      gmPercent: 50,
      frozenCapital: 500,
      periodDays: 30,
    };

    const result = buildReorderingFallback(metric);

    expect(result.scenarios).toHaveLength(3);
    expect(result.scenarios.filter((scenario) => scenario.evaluation.recommended)).toHaveLength(1);
    expect(result.scenarios.map((scenario) => scenario.type)).toEqual([
      "PESSIMISTIC",
      "REALISTIC",
      "OPTIMISTIC",
    ]);
    expect(result.scenarios.map((scenario) => scenario.woh_after)).toEqual([23, 45, 68]);
  });

  it("ignores invented reordering multipliers, forecasts and recommendations", () => {
    const metric: BrandMetric = {
      brandId: "brand:value:B",
      brandName: "B",
      skuCount: 2,
      totalStock: 5,
      salesLast7d: 10,
      salesLast30d: 30,
      salesPrev7d: 8,
      avgDailyVelocity: 1,
      wohDays: 5,
      strPercent: 200,
      trend7dPct: 25,
      gmPercent: 50,
      frozenCapital: 500,
      periodDays: 30,
    };
    const ai = buildReorderingFallback(metric);
    ai.scenarios[0].qty_multiplier = 20;
    ai.scenarios[0].woh_after = 900;
    ai.scenarios.forEach((scenario) => {
      scenario.evaluation.recommended = scenario.type === "OPTIMISTIC";
      scenario.evaluation.score = scenario.type === "OPTIMISTIC" ? 10 : 2;
    });

    const result = normalizeReorderingResult(metric, ai);

    expect(result.scenarios.map((scenario) => scenario.qty_multiplier)).toEqual([0.5, 1, 1.5]);
    expect(result.scenarios.map((scenario) => scenario.woh_after)).toEqual([23, 45, 68]);
    expect(result.scenarios.find((scenario) => scenario.evaluation.recommended)?.type).toBe("REALISTIC");
  });

  it("uses the smallest reordering scenario when demand is falling", () => {
    const metric: BrandMetric = {
      brandId: "brand:value:FALLING",
      brandName: "Falling",
      skuCount: 2,
      totalStock: 10,
      salesLast7d: 2,
      salesLast30d: 30,
      salesPrev7d: 8,
      avgDailyVelocity: 1,
      wohDays: 10,
      strPercent: 75,
      trend7dPct: -75,
      gmPercent: 50,
      frozenCapital: 500,
      periodDays: 30,
    };

    const result = buildReorderingFallback(metric);

    expect(result.scenarios.find((scenario) => scenario.evaluation.recommended)?.type).toBe("PESSIMISTIC");
    expect(result.scenarios.find((scenario) => scenario.type === "PESSIMISTIC")?.evaluation.risks[0]).toContain("Попит знижується");
  });

  it("creates usable channel briefs when a commercial AI batch times out", () => {
    const result = buildCommercialFallback({
      brand_id: "brand:value:A",
      brand_name: "A",
      type: "markdown",
      action: "FLASH_SALE",
      label: "Уцінка −35%",
    }, "2026-09-01");

    expect(result.channels.smm.action_needed).toBe(true);
    expect(result.channels.email.action_needed).toBe(true);
    expect(result.channels.ads.action_needed).toBe(true);
    expect(result.brand_id).toBe("brand:value:A");
  });
});
