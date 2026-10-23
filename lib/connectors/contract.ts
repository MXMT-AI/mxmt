/** Source facts only. Business policies and financial formulas belong to consumers. */
export type ConnectorProvider = "salesdrive" | "keycrm" | "horoshop" | "shopify" | "csv" | "mock";
export type DecimalValue = string;
export interface SourceContext {
  externalId: string;
  observedAt: string;
  updatedAt: string | null;
}
export interface ProductDto extends SourceContext {
  sku: string | null;
  name: string;
  barcode: string | null;
  brand: string | null;
  categoryId: string | null;
  retailPrice: DecimalValue | null;
  costPrice: DecimalValue | null;
  currency: string | null;
}
export interface StockDto extends SourceContext {
  productId: string;
  onHand: DecimalValue | null;
  inTransit: DecimalValue | null;
}
export interface OrderDto extends SourceContext {
  statusId: string | null;
  channelId: string | null;
  // Source calendar timestamps; timezone/date policies are applied by normalization.
  orderedAt: string | null;
  paidAt: string | null;
  lines: Array<{
    externalLineId: string | null;
    productId: string | null;
    sku: string | null;
    quantity: DecimalValue | null;
    unitPrice: DecimalValue | null;
    discount: DecimalValue | null;
    discountUnit: "percentage" | "amount" | "unknown";
    commission: DecimalValue | null;
    commissionUnit: "percentage" | "amount" | "unknown";
    costPrice: DecimalValue | null;
  }>;
}
export interface ReceiptDto extends SourceContext {
  movementType: "supplier_receipt" | "transfer" | "write_off" | "inventory_adjustment" | "unknown";
  statusId: string | null;
  supplierId: string | null;
  receivedAt: string | null;
  // Posting semantics are customer evidence, not inferred from a successful HTTP call.
  postingVerified: false;
  lines: Array<{ externalLineId: string | null; productId: string | null; quantity: DecimalValue | null; unitCost: DecimalValue | null }>;
}
export interface DictionaryEntry { id: string; name: string }
export interface Dictionary {
  entries: DictionaryEntry[];
  complete: boolean;
  reason: string | null;
}
export interface ConnectorPage<T> {
  records: T[];
  nextPage: number | null;
  observedAt: string;
}
export interface PageRequest {
  page?: number;
  limit?: number;
  /** ISO UTC instant (YYYY-MM-DDTHH:mm:ss[.SSS]Z), including observedAt values. */
  updatedFrom?: string;
}
export interface ConnectorCapabilities {
  orders: boolean;
  products: boolean;
  stock: boolean;
  receipts: boolean;
  statuses: boolean;
  channels: "metadata" | "complete" | "unavailable";
  incrementalOrders: boolean;
  incrementalReceipts: boolean;
  historicalStock: false;
  writes: false;
}
export type CheckCode = "OK" | "NOT_CONFIGURED" | "AUTH_FAILED" | "RATE_LIMITED" | "TIMEOUT" | "NETWORK_ERROR" | "INVALID_RESPONSE" | "RESPONSE_TOO_LARGE";
export interface ResourceCheck { resource: "orders" | "statuses" | "receipts" | "catalog"; code: CheckCode }
export interface ConnectionCheck {
  checkedAt: string;
  ok: boolean;
  checks: ResourceCheck[];
  statuses: Dictionary;
  channels: Dictionary;
}
/** Implementations never expose credentials or write methods through this interface. */
export interface MerchandisingConnector {
  readonly provider: ConnectorProvider;
  readonly capabilities: ConnectorCapabilities;
  getOrders(request?: PageRequest): Promise<ConnectorPage<OrderDto>>;
  getProducts(request?: PageRequest): Promise<ConnectorPage<ProductDto>>;
  getStock(request?: PageRequest): Promise<ConnectorPage<StockDto>>;
  getReceipts(request?: PageRequest): Promise<ConnectorPage<ReceiptDto>>;
  getStatuses(): Promise<Dictionary>;
  getChannels(): Promise<Dictionary>;
  checkConnection(): Promise<ConnectionCheck>;
}
export interface PublicConnection {
  configured: boolean;
  accountHost: string | null;
  hasReceiptsKey: boolean;
  hasYmlUrl: boolean;
  revision: number | null;
  lastCheck: ConnectionCheck | null;
}
