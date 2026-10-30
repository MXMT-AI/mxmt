export type SkuFlag = "hit" | "stockout" | "slow" | "dead" | "ok";

export interface ClassifyThresholds {
  hitMultiplier: number;
  slowMultiplier: number;
  stockoutMultiplier: number;
  deadDays: number;
}

export interface ClassifiedSku {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string | null;
  priceRetail: number | null;
  pricePurchase: number | null;
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
