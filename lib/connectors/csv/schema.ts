export const CSV_FIELDS = {
  orders: [
    "orderId",
    "eventId",
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
    "unitPrice",
    "discount",
    "costPrice",
  ],
  products: [
    "productId",
    "sku",
    "name",
    "barcode",
    "brand",
    "categoryId",
    "categoryName",
    "retailPrice",
    "oldPrice",
    "observedAt",
    "attributes",
  ],
  stock: ["productId", "observedAt", "quantity"],
  receipts: [
    "documentId",
    "lineId",
    "productId",
    "sku",
    "supplierId",
    "statusId",
    "movementType",
    "receivedAt",
    "updatedAt",
    "quantity",
    "unitCost",
  ],
  statuses: ["id", "name"],
  channels: ["id", "name"],
} as const;
export type CsvResource = keyof typeof CSV_FIELDS;
export const CSV_REQUIRED: Record<CsvResource, readonly string[]> = {
  orders: [
    "orderId",
    "eventId",
    "lineId",
    "productId",
    "statusId",
    "orderedAt",
    "updatedAt",
    "quantity",
    "unitPrice",
  ],
  products: ["productId", "sku", "name", "observedAt"],
  stock: ["productId", "observedAt", "quantity"],
  receipts: [
    "documentId",
    "lineId",
    "productId",
    "supplierId",
    "statusId",
    "movementType",
    "receivedAt",
    "updatedAt",
    "quantity",
    "unitCost",
  ],
  statuses: ["id", "name"],
  channels: ["id", "name"],
};
export interface CsvFileInput {
  resource: CsvResource;
  bytes: string;
  delimiter: "," | ";" | "\t";
  columns: Record<string, string>;
}
export interface CsvOptions {
  schemaVersion: 1;
  mappingRevision: number;
  timezone: string;
  catalog: "complete" | "partial";
  stock: "complete" | "partial";
  history: { from: string; to: string; complete: boolean } | null;
  receiptHistory: { from: string; to: string; complete: boolean } | null;
  discountUnit: "amount" | "percentage";
  policy: {
    statuses: Record<
      string,
      "SALE" | "RETURN" | "CORRECTION" | "PREORDER" | "REFUSAL"
    >;
    channels: Record<string, string>;
    amounts: {
      price: "gross_unit" | "net_unit";
      absoluteDiscount: "line" | "unit";
      currency: string;
      cost?: "unit";
    };
    receipts?: {
      postedStatuses: string[];
      suppliers: Record<string, string>;
      productIdField: "id";
      currency: string;
      unitCostVerified: boolean;
    };
  };
  receiptBaseline?: boolean;
  approved: boolean;
}
