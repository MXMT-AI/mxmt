export const REORDERING_VERSION = 1;
export const REORDERING_INPUT_LIMIT = 20000;
export interface ReorderingParameters {
  leadDays?: number;
  coverDays?: number;
  moq?: number;
}
export interface ReorderingOverride extends ReorderingParameters {
  skuId: string;
  inTransitQuantity?: string;
}
export interface ReorderingRequest {
  snapshotId: string;
  mode: "shortage" | "brand" | "all";
  filters: {
    brandId?: string;
    categoryId?: string;
    supplierId?: string;
    skuId?: string;
    currency?: string;
  };
  parameters: ReorderingParameters;
  overrides: ReorderingOverride[];
  page: number;
  pageSize: number;
}
export interface ReorderingSku {
  skuId: string;
  sku: string;
  name: string;
  barcode: string | null;
  brandId: string | null;
  brandName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  supplierName: string | null;
  currency: string | null;
  classification: string | null;
  productKind: string;
  active: boolean | null;
  inSeason: boolean;
  ownership: string;
  quantity: string | null;
  unitCost: string | null;
  inTransitQuantity: string | null;
  velocityPerWeek: string | null;
  velocityState: string;
  velocityBasis: string;
  denominatorWeeks: string | null;
  daysToZero: string | null;
  policy: {
    supplierId: string | null;
    leadDays: number | null;
    coverDays: number | null;
    moq: number | null;
    supplierTermsVerified: boolean;
    supplierTermsSource: string;
  };
  diagnostics: string[];
}
export interface ReorderingInputs {
  snapshotId: string;
  asOf: string;
  rows: ReadonlyArray<ReorderingSku>;
}
