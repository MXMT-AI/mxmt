/** Source facts only. Business policies and financial formulas belong to consumers. */
export type ConnectorProvider = "salesdrive" | "keycrm" | "horoshop" | "shopify" | "csv" | "mock";
export type DecimalValue = string;
export interface SourceContext {
  externalId: string;
  observedAt: string;
  updatedAt: string | null;
}
export interface ProductDto extends SourceContext {
  oldPrice?: DecimalValue | null;
  sourceStatus?: string | null;
  categoryName?: string | null;
  raw?: Record<string, unknown>;
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
  /** Identified source row rejected by the adapter; retain audit and skip projection atomically. */
  rejectionCode?: "ORDER_CURRENCY_MISMATCH" | "ORDER_RECORD_INVALID";
  /** Original provider record, retained server-side only. */
  raw?: Record<string, unknown>;
  sourceVersion?: number | null;
  statusId: string | null;
  channelId: string | null;
  // Source calendar timestamps; timezone/date policies are applied by normalization.
  orderedAt: string | null;
  paidAt: string | null;
  /** Optional independently verified return-event timestamp, never generic updateAt. */
  returnedAt?: string | null;
  lines: Array<{
    externalLineId: string | null;
    productId: string | null;
    sku: string | null;
    quantity: DecimalValue | null;
    /** Exact net line totals require an explicitly approved net_line policy. */
    netLineAmount?: DecimalValue | null;
    costLineAmount?: DecimalValue | null;
    unitPrice: DecimalValue | null;
    discount: DecimalValue | null;
    discountUnit: "percentage" | "amount" | "unknown";
    commission: DecimalValue | null;
    commissionUnit: "percentage" | "amount" | "unknown";
    costPrice: DecimalValue | null;
  }>;
}
export interface ReceiptDto extends SourceContext {
  supplierName?: string | null;
  raw?: Record<string, unknown>;
  movementType: "supplier_receipt" | "transfer" | "write_off" | "inventory_adjustment" | "unknown";
  statusId: string | null;
  supplierId: string | null;
  receivedAt: string | null;
  // Posting semantics are customer evidence, not inferred from a successful HTTP call.
  postingVerified: false;
  lines: Array<{ externalLineId: string | null; productId: string | null; sourceProductId?: string | null; sku?: string | null; quantity: DecimalValue | null; unitCost: DecimalValue | null }>;
}
export interface CatalogSnapshot { completePopulation?:boolean; observationId?:string; perRowObservations?:boolean; products: ProductDto[]; stock: StockDto[]; rawResponse: string; observedAt: string }
export interface DictionaryEntry { id: string; name: string }
export interface Dictionary {
  entries: DictionaryEntry[];
  complete: boolean;
  reason: string | null;
}
export type ConnectorPosition = {kind:"page";page:number} | {kind:"offset";offset:number} | {kind:"cursor";cursor:string|null};
export interface ConnectorPage<T> {
  /** Explicit continuation for v2 adapters. Undefined is the legacy numeric-page protocol. */
  next?: ConnectorPosition | null;
  /** Verified order-creation/receipt history, not merely an updated-at scan window. */
  historyCoverage?: {from:string;to:string;complete:boolean};
  /** Original response text for server-side audit; never expose to client progress. */
  rawResponse?: string;
  records: T[];
  nextPage: number | null;
  observedAt: string;
}
export interface PageRequest {
  offset?: number;
  cursor?: string | null;
  observationId?: string;
  page?: number;
  limit?: number;
  /** ISO UTC instant (YYYY-MM-DDTHH:mm:ss[.SSS]Z), including observedAt values. */
  updatedFrom?: string;
  updatedTo?: string;
  orderedFrom?: string;
  orderedTo?: string;
  orderId?: string;
}
export interface ConnectorCapabilities {
  /** Full read snapshots without provider versions use fenced observation ordering. */
  orderRevisions?: "observation";
  automaticSync?:boolean;
  pageSize?:Partial<Record<"orders"|"receipts"|"catalog",number>>;
  pagination?: Partial<Record<"orders"|"receipts"|"catalog", "page"|"offset"|"cursor">>;
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
export interface ResourceCheck { resource: "identity" | "history" | "locations" | "cost" | "orders" | "statuses" | "receipts" | "catalog" | "products" | "offers" | "stock" | "channels"; code: CheckCode }
export interface ConnectionCheck {
  /** Non-secret provider identity and actual granted scopes observed during checks. */
  metadata?: {apiVersion:string;shopId:string;appId:string;timezone:string;scopes:string[]};
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
  getCatalogSnapshot?(): Promise<CatalogSnapshot>;
  /** All pages must belong to one explicitly complete, versioned observation. */
  getCatalogPage?(request:PageRequest): Promise<ConnectorPage<{product:ProductDto;stock:StockDto}> & {observationId:string;completePopulation:boolean}>;
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
