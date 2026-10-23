import type { ConnectionCheck, ConnectorCapabilities, ConnectorPage, Dictionary, MerchandisingConnector, OrderDto, PageRequest, ProductDto, ReceiptDto, StockDto } from "@/lib/connectors/contract";
import { utcWatermark } from "@/lib/connectors/requests";

/** In-memory adapter used by the same consumer contract suite as SalesDrive. */
export class MockConnector implements MerchandisingConnector {
  readonly provider = "mock" as const;
  readonly capabilities: ConnectorCapabilities = { orders: true, products: true, stock: true, receipts: true, statuses: true,
    channels: "complete", incrementalOrders: true, incrementalReceipts: true, historicalStock: false, writes: false };
  constructor(private readonly fixtures: { orders: OrderDto[]; products: ProductDto[]; stock: StockDto[]; receipts: ReceiptDto[] }) {}
  private page<T>(records: T[], request: PageRequest = {}): ConnectorPage<T> {
    if (request.updatedFrom !== undefined && !utcWatermark(request.updatedFrom)) throw new Error("INVALID_RESPONSE");
    const page = request.page ?? 1, limit = request.limit ?? 100;
    return { records: structuredClone(records.slice((page - 1) * limit, page * limit)), nextPage: page * limit < records.length ? page + 1 : null, observedAt: new Date().toISOString() };
  }
  async getOrders(request?: PageRequest) { return this.page(this.fixtures.orders, request); }
  async getProducts(request?: PageRequest) { return this.page(this.fixtures.products, request); }
  async getStock(request?: PageRequest) { return this.page(this.fixtures.stock, request); }
  async getReceipts(request?: PageRequest) { return this.page(this.fixtures.receipts, request); }
  async getStatuses(): Promise<Dictionary> { return { entries: [{ id: "5", name: "Paid" }], complete: true, reason: null }; }
  async getChannels(): Promise<Dictionary> { return { entries: [{ id: "10", name: "Shop" }], complete: true, reason: null }; }
  async checkConnection(): Promise<ConnectionCheck> {
    return { ok: true, checkedAt: new Date().toISOString(), checks: ["orders", "statuses", "receipts", "catalog"].map((resource) => ({ resource: resource as "orders" | "statuses" | "receipts" | "catalog", code: "OK" })), statuses: await this.getStatuses(), channels: await this.getChannels() };
  }
}
