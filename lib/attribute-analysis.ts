import type { AttributeMetric } from "@/lib/attribute-metrics";

interface AttributeAiCategory {
  category?: string;
  insight?: string; // accepted from older saved responses, never used for factual metrics
  recommendation?: string;
}

interface AttributeAiOutput {
  by_category?: AttributeAiCategory[];
  summary?: string;
  action?: string;
}

type CategoryMetric = Pick<
  AttributeMetric,
  "attribute" | "skuCount" | "totalStock" | "grossSalesLast7d" | "returnsLast7d" |
  "grossSalesLast30d" | "returnsLast30d" | "salesLast7d" | "salesLast30d" |
  "strPercent" | "status"
>;

function dataInsight(metric: CategoryMetric): string {
  if (metric.status === "stockout") {
    return `За вибраний період: валові продажі — ${metric.grossSalesLast30d} од., повернення — ${metric.returnsLast30d} од., чисті продажі — ${metric.salesLast30d} од.; поточний залишок — 0 од.`;
  }
  if (metric.status === "inactive") {
    return `За вибраний період: валові продажі — 0 од., повернення — ${metric.returnsLast30d} од.; поточний залишок — 0 од.`;
  }
  return `STR за 7 днів — ${metric.strPercent}%, валові продажі за вибраний період — ${metric.grossSalesLast30d} од., повернення — ${metric.returnsLast30d} од., чисті продажі — ${metric.salesLast30d} од., залишок — ${metric.totalStock} од.`;
}

function defaultRecommendation(metric: CategoryMetric): string {
  if (metric.status === "stockout") return "Перевірити поповнення товарів із підтвердженим попитом.";
  if (metric.status === "inactive") return "Виключити неактивну категорію з аналізу залишків або перевірити довідник.";
  if (metric.status === "dead") return "Запланувати уцінку або очищення залишків.";
  if (metric.status === "slow") return "Посилити промо та перевірити ціну.";
  return "Продовжити моніторинг показників.";
}

export function buildAttributeAnalysis(categories: CategoryMetric[], ai: AttributeAiOutput | null) {
  const byCategory = categories.map((metric) => {
    const aiCategory = ai?.by_category?.find((item) => item.category === metric.attribute);
    return {
      category: metric.attribute,
      status: metric.status,
      insight: dataInsight(metric),
      recommendation: aiCategory?.recommendation?.trim() || defaultRecommendation(metric),
    };
  });

  return {
    by_category: byCategory,
    bestsellers: categories.filter((item) => item.status === "bestseller").map((item) => item.attribute),
    dead_stock: categories.filter((item) => item.status === "dead").map((item) => item.attribute),
    summary: ai?.summary?.trim() || "Статуси категорій розраховано за продажами та фактичним залишком.",
    action: ai?.action?.trim() || "Спочатку опрацювати дефіцит і реальний dead stock.",
  };
}
