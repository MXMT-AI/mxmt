export type SkuFlag = "hit" | "stockout" | "slow" | "dead" | "ok";

export interface ClassifyThresholds {
  hitMultiplier: number;    // avg7 > avg30 * hitMultiplier → hit
  slowMultiplier: number;   // avg7 < avg30 * slowMultiplier → slow
  stockoutMultiplier: number; // days < leadTime * stockoutMultiplier → stockout
  deadDays: number;         // days > deadDays → dead
}

export interface ClassifiedSku {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string | null;
  priceRetail: number;
  pricePurchase: number;
  stock: number;
  sold7: number;
  sold30: number;
  avgDaily30: number;
  daysOfStock: number;
  leadTime: number;
  flag: SkuFlag;
}

export interface ClassifySummary {
  total: number;
  hit: number;
  stockout: number;
  slow: number;
  dead: number;
  ok: number;
}
