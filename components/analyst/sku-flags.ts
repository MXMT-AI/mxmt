import type { SkuFlag } from "@/lib/analyst-types";

export type AnalystFilter = SkuFlag | "all";

export const SKU_FLAGS = {
  hit: { emoji: "🔥", uk: "Хіт", en: "Hit", color: "text-accent-yellow", background: "bg-accent-yellow/10" },
  stockout: { emoji: "🛑", uk: "Стокаут", en: "Stockout", color: "text-accent-negative", background: "bg-accent-negative/10" },
  slow: { emoji: "📉", uk: "Слоу-мувер", en: "Slow mover", color: "text-accent-report", background: "bg-accent-report/10" },
  dead: { emoji: "💤", uk: "Зависший", en: "Dead stock", color: "text-(--muted)", background: "bg-(--input-bg)" },
  ok: { emoji: "✅", uk: "Норма", en: "OK", color: "text-accent-positive", background: "bg-accent-positive/10" },
} satisfies Record<SkuFlag, { emoji: string; uk: string; en: string; color: string; background: string }>;
