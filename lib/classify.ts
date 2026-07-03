import type { SkuFlag, ClassifyThresholds } from "./analyst-types";

// Thresholds vary by business model:
// SEASONAL  — faster churn: hit at +20%, dead at 60 days, strict stockout (2x lead time)
// CARRYOVER — slower churn: hit at +35%, dead at 120 days, normal stockout (1.5x)
// HYBRID/null — balanced defaults
export function getThresholds(businessModel: string | null): ClassifyThresholds {
  switch (businessModel) {
    case "SEASONAL":
      return { hitMultiplier: 1.2, slowMultiplier: 0.75, stockoutMultiplier: 2.0, deadDays: 60 };
    case "CARRYOVER":
      return { hitMultiplier: 1.35, slowMultiplier: 0.65, stockoutMultiplier: 1.5, deadDays: 120 };
    default:
      return { hitMultiplier: 1.3, slowMultiplier: 0.7, stockoutMultiplier: 1.5, deadDays: 90 };
  }
}

export function classify(
  stock: number,
  sold7: number,
  sold30: number,
  leadTime: number,
  t: ClassifyThresholds
): SkuFlag {
  const avg30 = sold30 / 30;
  const avg7 = sold7 / 7;
  const days = avg30 > 0 ? stock / avg30 : stock > 0 ? 9999 : 0;

  if (stock === 0) return "ok";
  if (sold30 === 0) return "dead";
  if (days < leadTime * t.stockoutMultiplier && avg7 >= avg30 * t.hitMultiplier) return "hit";
  if (days < leadTime * t.stockoutMultiplier) return "stockout";
  if (avg7 > avg30 * t.hitMultiplier) return "hit";
  if (avg7 < avg30 * t.slowMultiplier) return "slow";
  if (days > t.deadDays) return "dead";
  return "ok";
}
