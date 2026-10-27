import type {
  MerchandisingConnector,
  ConnectorCapabilities,
  OrderDto,
  ProductDto,
  StockDto,
} from "@/lib/connectors/contract";
export const observedAt = "2026-10-27T08:00:00.000Z";
export const capabilities: ConnectorCapabilities = {
  orders: true,
  products: true,
  stock: true,
  receipts: false,
  statuses: false,
  channels: "unavailable",
  incrementalOrders: true,
  incrementalReceipts: false,
  historicalStock: false,
  writes: false,
};
/** Complete contract doubles; an unsupported resource remains explicitly unavailable. */
export function fixtureConnector(
  overrides: Partial<MerchandisingConnector> = {},
): MerchandisingConnector {
  const empty = async () => ({ records: [], nextPage: null, observedAt });
  return {
    provider: "csv",
    capabilities,
    getOrders: empty,
    getProducts: empty,
    getStock: empty,
    getReceipts: async () => {
      throw new Error("UNSUPPORTED");
    },
    getStatuses: async () => ({
      entries: [],
      complete: false,
      reason: "UNSUPPORTED",
    }),
    getChannels: async () => ({
      entries: [],
      complete: false,
      reason: "UNSUPPORTED",
    }),
    checkConnection: async () => ({
      ok: true,
      checkedAt: observedAt,
      checks: [],
      statuses: { entries: [], complete: false, reason: "UNSUPPORTED" },
      channels: { entries: [], complete: false, reason: "UNSUPPORTED" },
    }),
    ...overrides,
  };
}
export function fixtureOrder(id: string): OrderDto {
  return {
    externalId: id,
    observedAt,
    updatedAt: observedAt,
    orderedAt: "2026-09-10",
    paidAt: "2026-09-10",
    channelId: "1",
    statusId: "5",
    raw: { id },
    lines: [
      {
        externalLineId: "1",
        productId: "sku-a",
        sku: "A",
        quantity: "1",
        unitPrice: "20",
        discount: "0",
        discountUnit: "amount",
        commission: null,
        commissionUnit: "unknown",
        costPrice: "10",
      },
    ],
  };
}
export function fixtureCatalogRow(id: string): {
  product: ProductDto;
  stock: StockDto;
} {
  return {
    product: {
      externalId: id,
      sku: id,
      name: "Product " + id,
      observedAt,
      updatedAt: null,
      brand: null,
      categoryId: null,
      barcode: null,
      retailPrice: "20",
      costPrice: "10",
      currency: "UAH",
      raw: { id },
    },
    stock: {
      externalId: id,
      productId: id,
      observedAt,
      updatedAt: null,
      onHand: "2",
      inTransit: null,
    },
  };
}
