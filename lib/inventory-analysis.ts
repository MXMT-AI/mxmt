import type { BrandMetric } from "@/lib/brand-metrics";

export type InventoryBrandStatus = "critical" | "warning" | "balanced" | "excellent";

export interface InventoryAiResult {
  brand_id?: string;
  brand_name?: string;
  analysis?: string;
  confidence?: number;
  suggested_actions?: string[];
}

function deterministicEvaluation(metric: BrandMetric) {
  const noStock = metric.totalStock <= 0;
  const noSales = metric.avgDailyVelocity <= 0;
  const criticalExcess = metric.wohDays > 60 && (metric.strPercent < 7.5 || metric.trend7dPct < -20);
  const stockout = noStock && metric.salesLast30d > 0;
  const excellent = !noStock && !noSales && (
    (metric.wohDays < 20 && metric.trend7dPct > 20) || metric.strPercent > 22.5
  );
  const warning = metric.wohDays > 45 || metric.strPercent < 12 || metric.trend7dPct < -10;

  let status: InventoryBrandStatus = "balanced";
  let urgency = "low";
  let suggestedActions: string[] = [];
  if (stockout) {
    status = "critical";
    urgency = "immediate";
    suggestedActions = ["reordering"];
  } else if (!noStock && noSales) {
    status = "critical";
    urgency = "immediate";
    suggestedActions = ["repricing", "clearance"];
  } else if (criticalExcess) {
    status = "critical";
    urgency = "immediate";
    suggestedActions = ["repricing"];
  } else if (excellent) {
    status = "excellent";
    urgency = "low";
    suggestedActions = ["visibility"];
  } else if (warning || noStock) {
    status = "warning";
    urgency = "this_week";
    suggestedActions = noStock ? ["visibility"] : [];
  }

  return {
    status,
    urgency,
    suggestedActions,
    metricsEvaluation: {
      woh_status: stockout || criticalExcess || noSales ? "red" : metric.wohDays > 45 ? "yellow" : "green",
      str_status: metric.strPercent >= 22.5 ? "high" : metric.strPercent >= 12 ? "normal" : metric.strPercent > 0 ? "low" : "very_low",
      trend_status: metric.trend7dPct > 10 ? "rising" : metric.trend7dPct < -10 ? "falling" : "stable",
      gm_status: metric.gmPercent >= 50 ? "high" : metric.gmPercent >= 30 ? "normal" : "low",
    },
  };
}

function fallbackAnalysis(metric: BrandMetric): string {
  if (metric.totalStock <= 0 && metric.salesLast30d > 0) {
    return "Запас вичерпано, хоча у вибраному періоді були продажі. Потрібно перевірити можливість поповнення.";
  }
  if (metric.totalStock > 0 && metric.avgDailyVelocity <= 0) {
    return "Немає продажів за вибраний період, але на складі залишається товар. Потрібне рішення щодо активації або уцінки.";
  }
  return `WOH: ${metric.wohDays} дн., STR: ${metric.strPercent}%, тренд: ${metric.trend7dPct}%.`;
}

export function selectInventoryAiCandidates(metrics: BrandMetric[], limit = 20): BrandMetric[] {
  return [...metrics]
    .sort((a, b) => {
      const riskScore = (metric: BrandMetric) =>
        (metric.totalStock <= 0 && metric.salesLast30d > 0 ? 1_000_000 : 0) +
        (metric.totalStock > 0 && metric.avgDailyVelocity <= 0 ? 500_000 : 0) +
        (metric.wohDays > 60 ? 100_000 : 0) +
        Math.max(0, -metric.trend7dPct) * 1_000 +
        metric.frozenCapital;
      return riskScore(b) - riskScore(a);
    })
    .slice(0, Math.max(0, limit));
}

export function buildInventoryResults(metrics: BrandMetric[], aiResults: InventoryAiResult[]) {
  return metrics.map((metric) => {
    const ai = aiResults.find((item) =>
      item.brand_id === metric.brandId || item.brand_name === metric.brandName
    );
    const evaluation = deterministicEvaluation(metric);
    return {
      brand_id: metric.brandId,
      brand_name: metric.brandName,
      status: evaluation.status,
      analysis: ai?.analysis?.trim() || fallbackAnalysis(metric),
      confidence: typeof ai?.confidence === "number" ? ai.confidence : 1,
      metrics_evaluation: evaluation.metricsEvaluation,
      suggested_actions: evaluation.suggestedActions,
      urgency: evaluation.urgency,
      metrics: { ...metric },
    };
  });
}
