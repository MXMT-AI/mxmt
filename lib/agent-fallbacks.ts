import type { BrandMetric } from "@/lib/brand-metrics";

type RepricingStrategy = "AGGRESSIVE" | "BALANCED" | "CONSERVATIVE";

interface RepricingOption {
  option_id: number;
  strategy_type: RepricingStrategy;
  label: string;
  action: "FLASH_SALE" | "CLEARANCE" | "MARKDOWN" | "VISIBILITY";
  discount_percent: number;
  duration_days: number;
  forecast: {
    units_to_sell_percent: number;
    woh_after: number;
    margin_impact_percent: number;
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

export function buildRepricingFallback(metric: BrandMetric): RepricingBrandResult {
  const recommended: RepricingStrategy =
    metric.wohDays > 60 || metric.trend7dPct < -15
      ? "AGGRESSIVE"
      : metric.wohDays >= 45
        ? "BALANCED"
        : "CONSERVATIVE";

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
      discount_percent: 35,
      duration_days: 14,
      sellThrough: 40,
      score: recommended === "AGGRESSIVE" ? 8 : 5,
    },
    {
      strategy_type: "BALANCED",
      label: "Планова уцінка −20%",
      action: "MARKDOWN",
      discount_percent: 20,
      duration_days: 21,
      sellThrough: 25,
      score: recommended === "BALANCED" ? 8 : 6,
    },
    {
      strategy_type: "CONSERVATIVE",
      label: "Підсилення видимості −10%",
      action: "VISIBILITY",
      discount_percent: 10,
      duration_days: 30,
      sellThrough: 12,
      score: recommended === "CONSERVATIVE" ? 8 : 6,
    },
  ];

  return {
    brand_id: metric.brandId,
    brand_name: metric.brandName,
    current_situation:
      metric.wohDays >= 9999
        ? `Є ${metric.totalStock} од. залишку, але продажів за період немає.`
        : `Запас на ${metric.wohDays} днів, STR ${metric.strPercent}%, тренд ${metric.trend7dPct}%.`,
    options: definitions.map((definition, index) => ({
      option_id: index + 1,
      strategy_type: definition.strategy_type,
      label: definition.label,
      action: definition.action,
      discount_percent: definition.discount_percent,
      duration_days: definition.duration_days,
      forecast: {
        units_to_sell_percent: definition.sellThrough,
        woh_after:
          metric.wohDays >= 9999
            ? metric.wohDays
            : Math.max(0, Math.round(metric.wohDays * (1 - definition.sellThrough / 100))),
        margin_impact_percent: -Math.round((definition.discount_percent / Math.max(metric.gmPercent, 1)) * 100),
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
    })),
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
