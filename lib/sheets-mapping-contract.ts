export const SHEETS_PRODUCT_FIELDS = [
  "productId",
  "sku",
  "name",
  "brand",
  "category",
  "barcode",
  "retailPrice",
  "costPrice",
  "quantity",
  "inTransit",
  "observedAt",
] as const;
export const SHEETS_ORDER_FIELDS = [
  "orderId",
  "lineId",
  "productId",
  "sku",
  "statusId",
  "channelId",
  "orderedAt",
  "paidAt",
  "returnedAt",
  "updatedAt",
  "quantity",
  "salesAmount",
  "costAmount",
] as const;
export const SHEETS_EVENT_KINDS = [
  "UNKNOWN",
  "SALE",
  "RETURN",
  "CORRECTION",
  "PREORDER",
  "REFUSAL",
] as const;
export type SheetsEventKind = (typeof SHEETS_EVENT_KINDS)[number];
export type SheetsProductField = (typeof SHEETS_PRODUCT_FIELDS)[number];
export type SheetsOrderField = (typeof SHEETS_ORDER_FIELDS)[number];
export interface SheetsFieldMapping {
  version: 1;
  products: Record<SheetsProductField, string | null>;
  orders: Record<SheetsOrderField, string | null>;
  policy: {
    statuses: Record<string, SheetsEventKind>;
    channels: Record<string, string>;
    currency: string;
    salesAmount: "net_line" | "net_unit";
    costAmount: "line" | "unit" | "unavailable";
    lineIdentity: "column" | "order_product";
    stockObservation: "unverified" | "column" | "import_observation";
    stockReference: string;
    defaultProductKind: "UNKNOWN" | "MERCHANDISE";
    productKinds: Record<
      string,
      "UNKNOWN" | "MERCHANDISE" | "SERVICE" | "GIFT_CARD"
    >;
  };
}
export interface SheetsColumn {
  key: string;
  label: string;
}
export interface SheetsMappingInput {
  sourceId: string;
  fileId: string;
  timezone: string;
  importRunId: string;
  sourceChecksum: string;
  importedAt: string;
  sheets: Array<{
    id: string;
    sheetKey: string;
    sourceName: string;
    columns: SheetsColumn[];
    checksum: string | null;
    rowCount: number;
  }>;
}
export interface SheetsMappingProblem {
  code: string;
  resource: "products" | "orders";
  row: number | null;
  field?: string;
}
export interface SheetsMappingSummary {
  counts: { products: number; orders: number };
  invalidRows: { products: number; orders: number };
  unmappedStatuses: number;
  unverifiedProductKinds: number;
  duplicateProductIds: number;
  duplicateOrderLines: number;
  statusCounts: Record<string, number>;
  channelCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  problems: SheetsMappingProblem[];
  problemCount: number;
  blockingErrors: string[];
  warnings: string[];
}
export interface SheetsMappingPreview {
  configId: string;
  sourceId: string;
  revision: number;
  importRunId: string;
  previewHash: string;
  expiresAt: string;
  summary: SheetsMappingSummary;
}
export interface SheetsMappingMetadata {
  input: SheetsMappingInput;
  revision: number;
  activeRevision: number | null;
  suggestion: SheetsFieldMapping;
  observed: {
    statuses: Array<{ id: string; count: number }>;
    channels: Array<{ id: string; count: number }>;
    categories: Array<{ name: string; count: number }>;
  };
}
