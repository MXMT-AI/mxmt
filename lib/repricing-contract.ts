/** Client-safe parameters and wire types; pricing formulas remain server-only. */
export const REPRICING_VERSION = 1;
export const REPRICING_INPUT_LIMIT = 20000;
export const REPRICING_PRESETS = {
  GENTLE: { minDiscountPct: 5, maxDiscountPct: 20, sharePct: 50 },
  BALANCED: { minDiscountPct: 15, maxDiscountPct: 40, sharePct: 70 },
  AGGRESSIVE: { minDiscountPct: 30, maxDiscountPct: 50, sharePct: 100 },
} as const;
export const REPRICING_DEFAULTS = {
  ...REPRICING_PRESETS.BALANCED,
  goal: "CAPITAL" as const,
  durationDays: 10,
  costProtection: true,
  liquidation: false,
  liquidationReason: null,
};
export interface RepricingParameters {
  minDiscountPct: number;
  maxDiscountPct: number;
  sharePct: number;
  goal: "CAPITAL" | "TURNOVER" | "SEASON";
  durationDays: number;
  costProtection: boolean;
  liquidation: boolean;
  liquidationReason: string | null;
}
export interface RepricingFilters {
  status: "DEAD" | "RISK" | "DEAD_OR_RISK";
  soldMonths: 1 | 3 | 7;
  brandId?: string;
  categoryId?: string;
  skuId?: string;
  currency?: string;
  priceMin?: string;
  priceMax?: string;
  stockMin?: string;
  stockMax?: string;
  soldMax?: string;
}
export interface RepricingRequest {
  inputSetId: string;
  parameters: RepricingParameters;
  filters: RepricingFilters;
  selection: Array<{ skuId: string; included: boolean }>;
  manualPrices: Array<{ skuId: string; price: string }>;
  editContext?: string;
  page: number;
  pageSize: number;
}
export interface RepricingSku {
  skuId: string;
  sku: string;
  name: string;
  barcode: string | null;
  brandId: string | null;
  brandName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  classification: string | null;
  productKind: string;
  ownership: string;
  currency: string | null;
  quantity: string | null;
  unitCost: string | null;
  currentPrice: string | null;
  lastSaleDate: string | null;
  firstReceiptDate: string | null;
  neverSold: boolean;
  sold: Record<1 | 3 | 7, string | null>;
}
export interface RepricingInputs {
  id: string;
  snapshotId: string;
  asOf: string;
  rows: ReadonlyArray<RepricingSku>;
}
