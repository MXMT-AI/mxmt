import type { AttributeMetric } from "@/lib/attribute-metrics";
import { formatMessage } from "@/i18n/format-message";
import { attributeAnalysisMessages as ukrainianCopy } from "@/messages/uk.json";

interface AttributeAiCategory {
  category?: string;
  insight?: string;
  recommendation?: string;
}

export function physicalAttributeRecommendation(status:"SPARSE"|"REVIEW_MAPPING"|"COVERED"){
  return status==="SPARSE"?ukrainianCopy.малаГрупаПеревіритиРепрезентативністьПеред:status==="REVIEW_MAPPING"?ukrainianCopy.перевіритиПоляДжерелаТаПогоджений:ukrainianCopy.порівнятиЗбереженіПродажіПоверненняТа;
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
    return formatMessage(ukrainianCopy.заВибранийПеріодВаловіПродажі, { grossSalesLast30d: metric.grossSalesLast30d, returnsLast30d: metric.returnsLast30d, salesLast30d: metric.salesLast30d });
  }
  if (metric.status === "inactive") {
    return formatMessage(ukrainianCopy.заВибранийПеріодВаловіПродажі2, { returnsLast30d: metric.returnsLast30d });
  }
  return formatMessage(ukrainianCopy.sTRЗа7Днів, { strPercent: metric.strPercent, grossSalesLast30d: metric.grossSalesLast30d, returnsLast30d: metric.returnsLast30d, salesLast30d: metric.salesLast30d, totalStock: metric.totalStock });
}

function defaultRecommendation(metric: CategoryMetric): string {
  if (metric.status === "stockout") return ukrainianCopy.перевіритиПоповненняТоварівІзПідтвердженим;
  if (metric.status === "inactive") return ukrainianCopy.виключитиНеактивнуКатегоріюЗАналізу;
  if (metric.status === "dead") return ukrainianCopy.заплануватиУцінкуАбоОчищенняЗалишків;
  if (metric.status === "slow") return ukrainianCopy.посилитиПромоТаПеревіритиЦіну;
  return ukrainianCopy.продовжитиМоніторингПоказників;
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
    summary: ai?.summary?.trim() || ukrainianCopy.summaryСтатусиКатегорійРозрахованоЗаПродажами,
    action: ai?.action?.trim() || ukrainianCopy.actionСпочаткуОпрацюватиДефіцитІРеальний,
  };
}
