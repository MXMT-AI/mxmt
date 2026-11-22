import type { SkuFlag } from "@/lib/analyst-types";
import { analystSkuFlagsMessages as englishCopy } from "@/messages/en.json";
import { analystSkuFlagsMessages as ukrainianCopy } from "@/messages/uk.json";

export type AnalystFilter = SkuFlag | "all";

export const SKU_FLAGS = {
  hit: { emoji: "🔥", uk: ukrainianCopy.enHit, en: englishCopy.enHit, color: "text-accent-yellow", background: "bg-accent-yellow/10" },
  stockout: { emoji: "🛑", uk: ukrainianCopy.enStockout, en: englishCopy.enStockout, color: "text-accent-negative", background: "bg-accent-negative/10" },
  slow: { emoji: "📉", uk: ukrainianCopy.enSlowMover, en: englishCopy.enSlowMover, color: "text-accent-report", background: "bg-accent-report/10" },
  dead: { emoji: "💤", uk: ukrainianCopy.enDeadStock, en: englishCopy.enDeadStock, color: "text-(--muted)", background: "bg-(--input-bg)" },
  ok: { emoji: "✅", uk: ukrainianCopy.enOK, en: englishCopy.enOK, color: "text-accent-positive", background: "bg-accent-positive/10" },
} satisfies Record<SkuFlag, { emoji: string; uk: string; en: string; color: string; background: string }>;
