import type { BrandMetric } from "@/lib/brand-metrics";

type RepricingStrategy = "AGGRESSIVE" | "BALANCED" | "CONSERVATIVE";

export interface RepricingOption {
  option_id: number;
  strategy_type: RepricingStrategy;
  label: string;
  action: "FLASH_SALE" | "CLEARANCE" | "MARKDOWN" | "VISIBILITY";
  discount_percent: number;
  duration_days: number;
  forecast: {
    units_to_sell_percent: number;
    woh_after: number | null;
    margin_impact_percent: number;
    margin_after_percent: number;
  };
  evaluation: {
    score: number;
    score_label: string;
    pros: string[];
    cons: string[];
    risks: string[];
    recommended: boolean;
    confidence: number;
  };
}

export interface RepricingBrandResult {
  brand_id: string;
  brand_name: string;
  current_situation: string;
  options: RepricingOption[];
}

const MIN_MARGIN_PERCENT = 10;
const MAX_DISCOUNT_PERCENT = 50;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const finiteNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

function recommendedRepricingStrategy(metric: BrandMetric): RepricingStrategy {
  if (metric.trend7dPct > 0) return "CONSERVATIVE";
  if (metric.wohDays > 60 || metric.trend7dPct < -15) return "AGGRESSIVE";
  if (metric.wohDays >= 45) return "BALANCED";
  return "CONSERVATIVE";
}

export function maxSafeDiscountPercent(metric: BrandMetric): number {
  if (typeof metric.safeDiscountCapPercent === "number" && Number.isFinite(metric.safeDiscountCapPercent)) {
    return clamp(Math.floor(metric.safeDiscountCapPercent), 0, MAX_DISCOUNT_PERCENT);
  }
  const currentMargin = clamp(metric.gmPercent, 0, 100) / 100;
  const costShare = 1 - currentMargin;
  const requiredPriceShare = costShare / (1 - MIN_MARGIN_PERCENT / 100);
  return clamp(Math.floor((1 - requiredPriceShare) * 100), 0, MAX_DISCOUNT_PERCENT);
}

function marginAfterDiscount(metric: BrandMetric, discountPercent: number) {
  const currentMargin = clamp(metric.gmPercent, 0, 100);
  const priceShare = 1 - discountPercent / 100;
  const costShare = 1 - currentMargin / 100;
  const marginAfter = priceShare > 0
    ? ((priceShare - costShare) / priceShare) * 100
    : -100;
  return {
    marginAfter: Math.round(marginAfter * 10) / 10,
    marginImpact: Math.round((marginAfter - currentMargin) * 10) / 10,
  };
}

function optionLabel(action: RepricingOption["action"], discountPercent: number): string {
  if (discountPercent <= 0) return "Підвищення видимості без знижки";
  if (action === "CLEARANCE") return `Розпродаж −${discountPercent}%`;
  if (action === "FLASH_SALE") return `Флеш-сейл −${discountPercent}%`;
  if (action === "VISIBILITY") return `Промопідтримка −${discountPercent}%`;
  return `Планова уцінка −${discountPercent}%`;
}

function repricingAction(value: unknown, fallback: RepricingOption["action"]): RepricingOption["action"] {
  return value === "FLASH_SALE" || value === "CLEARANCE" || value === "MARKDOWN" || value === "VISIBILITY"
    ? value
    : fallback;
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length > 0 ? strings : fallback;
}

function currentSituation(metric: BrandMetric): string {
  if (metric.wohDays >= 9999 || metric.avgDailyVelocity <= 0) {
    return `Залишок ${metric.totalStock} од., але за вибраний період немає продажів; прогноз днів запасу недоступний.`;
  }
  return `Запас на ${metric.wohDays} днів (DOH), STR ${metric.strPercent}%, тренд ${metric.trend7dPct}%.`;
}

export function buildRepricingFallback(metric: BrandMetric): RepricingBrandResult {
  const recommended = recommendedRepricingStrategy(metric);
  const maxDiscount = maxSafeDiscountPercent(metric);

  const definitions: Array<
    Pick<RepricingOption, "strategy_type" | "label" | "action" | "discount_percent" | "duration_days"> & {
      sellThrough: number;
      score: number;
    }
  > = [
    {
      strategy_type: "AGGRESSIVE",
      label: "Флеш-розпродаж −35%",
      action: "FLASH_SALE",
      discount_percent: Math.min(35, maxDiscount),
      duration_days: 14,
      sellThrough: 40,
      score: recommended === "AGGRESSIVE" ? 8 : 5,
    },
    {
      strategy_type: "BALANCED",
      label: "Планова уцінка −20%",
      action: "MARKDOWN",
      discount_percent: Math.min(20, maxDiscount),
      duration_days: 21,
      sellThrough: 25,
      score: recommended === "BALANCED" ? 8 : 6,
    },
    {
      strategy_type: "CONSERVATIVE",
      label: "Підсилення видимості −10%",
      action: "VISIBILITY",
      discount_percent: recommended === "CONSERVATIVE" && metric.trend7dPct > 0
        ? 0
        : Math.min(10, maxDiscount),
      duration_days: 30,
      sellThrough: 12,
      score: recommended === "CONSERVATIVE" ? 8 : 6,
    },
  ];

  return {
    brand_id: metric.brandId,
    brand_name: metric.brandName,
    current_situation: currentSituation(metric),
    options: definitions.map((definition, index) => {
      const margin = marginAfterDiscount(metric, definition.discount_percent);
      return {
        option_id: index + 1,
        strategy_type: definition.strategy_type,
        label: optionLabel(definition.action, definition.discount_percent),
        action: definition.action,
        discount_percent: definition.discount_percent,
        duration_days: definition.duration_days,
        forecast: {
          units_to_sell_percent: definition.sellThrough,
          woh_after:
            metric.wohDays >= 9999 || metric.avgDailyVelocity <= 0
              ? null
              : Math.max(0, Math.round(metric.wohDays * (1 - definition.sellThrough / 100))),
          margin_impact_percent: margin.marginImpact,
          margin_after_percent: margin.marginAfter,
        },
        evaluation: {
          score: definition.score,
          score_label: definition.strategy_type === recommended ? "Рекомендовано за метриками" : "Альтернативний сценарій",
          pros: ["Сценарій розраховано з поточних метрик запасу та продажів."],
          cons: ["Прогноз потребує перевірки після запуску."],
          risks: ["Фактичний попит може відрізнятися від історичного."],
          recommended: definition.strategy_type === recommended,
          confidence: 0.7,
        },
      };
    }),
  };
}

export function normalizeRepricingResult(
  metric: BrandMetric,
  aiResult?: RepricingBrandResult
): RepricingBrandResult {
  const fallback = buildRepricingFallback(metric);
  const recommended = recommendedRepricingStrategy(metric);
  const maxDiscount = maxSafeDiscountPercent(metric);
  const aiByStrategy = new Map(
    (aiResult?.options ?? [])
      .filter((option) => ["AGGRESSIVE", "BALANCED", "CONSERVATIVE"].includes(option.strategy_type))
      .map((option) => [option.strategy_type, option])
  );

  const options = fallback.options.map((base) => {
    const ai = aiByStrategy.get(base.strategy_type);
    const requestedDiscount = Math.round(finiteNumber(ai?.discount_percent, base.discount_percent));
    const discountPercent = base.strategy_type === "CONSERVATIVE" && metric.trend7dPct > 0
      ? 0
      : clamp(requestedDiscount, 0, maxDiscount);
    const durationDays = Math.round(clamp(finiteNumber(ai?.duration_days, base.duration_days), 1, 90));
    const sellThrough = clamp(
      finiteNumber(ai?.forecast?.units_to_sell_percent, base.forecast.units_to_sell_percent),
      0,
      100
    );
    const margin = marginAfterDiscount(metric, discountPercent);
    const wasDiscountLimited = requestedDiscount > discountPercent;
    const isRecommended = base.strategy_type === recommended;
    const action = repricingAction(ai?.action, base.action);
    const aiRisks = stringList(ai?.evaluation?.risks, []);

    return {
      ...base,
      label: optionLabel(action, discountPercent),
      action,
      discount_percent: discountPercent,
      duration_days: durationDays,
      forecast: {
        units_to_sell_percent: sellThrough,
        woh_after:
          metric.wohDays >= 9999 || metric.avgDailyVelocity <= 0
            ? null
            : Math.max(0, Math.round(metric.wohDays * (1 - sellThrough / 100))),
        margin_impact_percent: margin.marginImpact,
        margin_after_percent: margin.marginAfter,
      },
      evaluation: {
        score: isRecommended ? 8 : base.evaluation.score,
        score_label: isRecommended ? "Рекомендовано за метриками" : "Альтернативний сценарій",
        pros: stringList(ai?.evaluation?.pros, base.evaluation.pros),
        cons: stringList(ai?.evaluation?.cons, base.evaluation.cons),
        risks: wasDiscountLimited
          ? [`Знижку обмежено до ${discountPercent}% для збереження маржі не нижче ${MIN_MARGIN_PERCENT}%.`, ...aiRisks]
          : aiRisks.length > 0 ? aiRisks : base.evaluation.risks,
        recommended: isRecommended,
        confidence: isRecommended ? 0.8 : 0.65,
      },
    };
  });

  return {
    brand_id: metric.brandId,
    brand_name: metric.brandName,
    current_situation: currentSituation(metric),
    options,
  };
}

type ReorderingScenarioType = "PESSIMISTIC" | "REALISTIC" | "OPTIMISTIC";

export interface ReorderingBrandResult {
  brand_id: string;
  brand_name: string;
  current_situation: string;
  scenarios: Array<{
    scenario_id: number;
    type: ReorderingScenarioType;
    label: string;
    qty_multiplier: number;
    logic: string;
    woh_after: number;
    evaluation: {
      score: number;
      score_label: string;
      risk_level: "HIGH" | "MEDIUM" | "LOW";
      risks: string[];
      pros: string[];
      cons: string[];
      safety_margin: "LOW" | "GOOD" | "AGGRESSIVE";
      recommended: boolean;
      confidence: number;
    };
  }>;
}

export function buildReorderingFallback(metric: BrandMetric): ReorderingBrandResult {
  const recommended: ReorderingScenarioType = metric.trend7dPct > 25 ? "OPTIMISTIC" : "REALISTIC";
  const targetDays = Math.max(0, 45 - metric.wohDays);
  const definitions = [
    { type: "PESSIMISTIC" as const, label: "Мінімальне поповнення", multiplier: 0.5, risk: "HIGH" as const, safety: "LOW" as const },
    { type: "REALISTIC" as const, label: "Базове поповнення", multiplier: 1, risk: "LOW" as const, safety: "GOOD" as const },
    { type: "OPTIMISTIC" as const, label: "Розширене поповнення", multiplier: 1.5, risk: "MEDIUM" as const, safety: "AGGRESSIVE" as const },
  ];

  return {
    brand_id: metric.brandId,
    brand_name: metric.brandName,
    current_situation: `Запас на ${metric.wohDays} днів, темп продажів ${metric.avgDailyVelocity} од./день, тренд ${metric.trend7dPct}%.`,
    scenarios: definitions.map((definition, index) => ({
      scenario_id: index + 1,
      type: definition.type,
      label: definition.label,
      qty_multiplier: definition.multiplier,
      logic: `Покрити приблизно ${Math.round(targetDays * definition.multiplier)} днів поточного попиту.`,
      woh_after: Math.round(metric.wohDays + targetDays * definition.multiplier),
      evaluation: {
        score: definition.type === recommended ? 8 : 6,
        score_label: definition.type === recommended ? "Рекомендовано за метриками" : "Альтернативний сценарій",
        risk_level: definition.risk,
        risks: metric.trend7dPct < -10 ? ["Попит знижується — обсяг потрібно переглянути перед замовленням."] : ["Попит може змінитися до поставки."],
        pros: ["Обсяг прив'язано до поточного темпу продажів."],
        cons: ["Не враховано строк постачання та мінімальну партію постачальника."],
        safety_margin: definition.safety,
        recommended: definition.type === recommended,
        confidence: 0.7,
      },
    })),
  };
}

export interface CommercialDecision {
  brand_id: string;
  brand_name: string;
  type: "markdown" | "reorder";
  action: string;
  label: string;
}

export function buildCommercialFallback(decision: CommercialDecision, analysisDate: string) {
  const markdown = decision.type === "markdown";
  const message = markdown
    ? `${decision.label}: обмежена пропозиція для ${decision.brand_name}.`
    : `${decision.brand_name} знову в наявності.`;
  return {
    brand_id: decision.brand_id,
    brand_name: decision.brand_name,
    decision_type: decision.type,
    decision_summary: decision.label,
    urgency: markdown ? "high" : "medium",
    key_message: message,
    overall_tone: markdown ? "urgency" : "calm",
    channels: {
      smm: {
        action_needed: true,
        brief: `Підготувати Stories і допис: ${message}`,
        frequency: "2 публікації сьогодні",
        content_direction: "Stories і карусель із товарами та чітким CTA",
        start_date: analysisDate,
        priority: 1,
      },
      email: {
        action_needed: true,
        brief: `Надіслати клієнтам повідомлення: ${message}`,
        send_timing: "today",
        subject_direction: decision.label,
        cta: "Переглянути пропозицію",
        priority: 1,
      },
      ads: {
        action_needed: true,
        brief: `Запустити ретаргетинг на товари бренду ${decision.brand_name}.`,
        budget_recommendation: "Почати з тестового денного бюджету 500 грн",
        targeting: "Відвідувачі карток товарів та покупці споріднених категорій",
        priority: 2,
      },
      store: {
        action_needed: true,
        brief: `Виділити товари ${decision.brand_name} у торговій зоні.`,
        display_changes: "Додати помітний цінник і навігацію",
        staff_talking_points: message,
        priority: 3,
      },
      marketplace: {
        action_needed: true,
        brief: `Оновити картки ${decision.brand_name}, ціну й доступний залишок.`,
        priority_platform: "instagram",
        reason: "Можна швидко синхронізувати повідомлення з SMM-активацією",
        priority: 2,
      },
    },
  };
}
