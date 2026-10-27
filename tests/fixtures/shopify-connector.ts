import type { ShopifyConfig } from "@/lib/connectors/shopify/config";
import type { ReadJournal } from "@/lib/connectors/shopify/journal";
export const shopifyConfig: ShopifyConfig = {
  shop: "fixture-store.myshopify.com",
  appId: "gid://shopify/App/1",
  accessToken: "synthetic-shopify-token-001",
  timezone: "Europe/Kyiv",
  mappingRevision: 1,
  evidence: {
    reference: "synthetic approved fixture; not customer acceptance",
    currency: "UAH",
    physicalStock: true,
    locationIds: ["gid://shopify/Location/1"],
    financials: true,
    history: null,
  },
};
export const id = (type: string, n = 1) => `gid://shopify/${type}/${n}`;
export const money = (amount: string) => ({
  shopMoney: { amount, currencyCode: "UAH" },
});
export const connection = (
  nodes: unknown[],
  hasNextPage = false,
  endCursor: string | null = null,
) => ({ nodes, pageInfo: { hasNextPage, endCursor } });
export const order = () => ({
  id: id("Order"),
  createdAt: "2026-09-10T08:00:00Z",
  updatedAt: "2026-10-27T08:00:00Z",
  cancelledAt: null,
  test: false,
  taxesIncluded: false,
  currencyCode: "UAH",
  displayFinancialStatus: "PARTIALLY_REFUNDED",
  totalPriceSet: money("40"),
  subtotalPriceSet: money("40"),
  transactionsCount: { count: 2, precision: "EXACT" },
  transactions: [
    {
      id: id("OrderTransaction", 1),
      kind: "SALE",
      status: "SUCCESS",
      processedAt: "2026-09-10T09:00:00Z",
      test: false,
      amountSet: money("20"),
    },
    {
      id: id("OrderTransaction", 2),
      kind: "CAPTURE",
      status: "SUCCESS",
      processedAt: "2026-09-10T10:00:00Z",
      test: false,
      amountSet: money("20"),
    },
  ],
  refunds: [{ id: id("Refund"), updatedAt: "2026-10-26T10:00:00Z" }],
});
export const line = (n = 1) => ({
  id: id("LineItem", n),
  sku: "001-A",
  quantity: 2,
  currentQuantity: 1,
  originalUnitPriceSet: money("25"),
  discountAllocations: [{ allocatedAmountSet: money("10") }],
  variant: { id: id("ProductVariant") },
});
export const refundLine = (n = 1) => ({
  id: id("RefundLineItem", n),
  quantity: 1,
  subtotalSet: money("20"),
  totalTaxSet: money("0"),
  lineItem: {
    id: id("LineItem", n),
    sku: "001-A",
    variant: { id: id("ProductVariant") },
  },
});
export const refundTransaction = () => ({
  id: id("OrderTransaction", 3),
  kind: "REFUND",
  status: "SUCCESS",
  processedAt: "2026-10-26T10:00:00Z",
  test: false,
  amountSet: money("20"),
});
export const variant = (n = 1) => ({
  id: id("ProductVariant", n),
  sku: "001-A",
  title: "Standard",
  barcode: "000000001",
  price: "25",
  compareAtPrice: "30",
  updatedAt: "2026-10-26T08:00:00Z",
  product: {
    id: id("Product"),
    title: "Watch",
    vendor: "Brand",
    productType: "Watches",
    updatedAt: "2026-10-26T08:00:00Z",
  },
  inventoryItem: { id: id("InventoryItem", n), tracked: true },
});
export const level = (n = 1) => ({
  id: id("InventoryLevel", n),
  location: { id: id("Location", n), isActive: true },
  quantities: [{ name: "on_hand", quantity: 12 }],
});
export function memoryJournal(binding = "tenant-a:source-a:1:run-a") {
  const pages = new Map<string, unknown>();
  const journal: ReadJournal = {
    binding,
    async get(k) {
      return pages.get(k) ?? null;
    },
    async put(k, v) {
      if (!pages.has(k)) pages.set(k, structuredClone(v));
    },
  };
  return { journal, pages };
}
export function shopifyFetcher(
  overrides: Partial<Record<string, (v: any) => any>> = {},
) {
  return async (_url: URL, init: RequestInit) => {
    const { query, variables: v } = JSON.parse(String(init.body)),
      name = /query (\w+)/.exec(query)![1];
    let data: any;
    if (overrides[name]) data = overrides[name](v);
    else
      switch (name) {
        case "Identity":
          data = {
            shop: {
              id: id("Shop"),
              myshopifyDomain: shopifyConfig.shop,
              ianaTimezone: shopifyConfig.timezone,
              currencyCode: "UAH",
            },
            currentAppInstallation: {
              app: { id: shopifyConfig.appId },
              accessScopes: [
                "read_orders",
                "read_products",
                "read_inventory",
                "read_locations",
              ].map((handle) => ({ handle })),
            },
          };
          break;
        case "Orders":
          data = { orders: connection(v.after ? [] : [order()]) };
          break;
        case "OrderLines":
          data = {
            order: {
              id: v.id,
              updatedAt: order().updatedAt,
              lineItems: connection([line()]),
            },
          };
          break;
        case "RefundLines":
          data = {
            refund: {
              id: v.id,
              updatedAt: order().refunds[0].updatedAt,
              refundLineItems: connection([refundLine()]),
            },
          };
          break;
        case "RefundTransactions":
          data = {
            refund: {
              id: v.id,
              updatedAt: order().refunds[0].updatedAt,
              totalRefundedSet: money("20"),
              transactions: connection([refundTransaction()]),
            },
          };
          break;
        case "OrderFence":
          data = { order: { id: v.id, updatedAt: order().updatedAt } };
          break;
        case "Variants":
          data = { productVariants: connection(v.after ? [] : [variant()]) };
          break;
        case "Levels":
          data = {
            inventoryItem: {
              id: v.id,
              tracked: true,
              inventoryLevels: connection([level()]),
            },
          };
          break;
        case "Locations":
          data = {
            locations: connection([
              { id: id("Location"), name: "Main", isActive: true },
            ]),
          };
          break;
        case "Cost":
          data = {
            inventoryItems: connection([
              {
                id: id("InventoryItem"),
                unitCost: { amount: "10", currencyCode: "UAH" },
              },
            ]),
          };
          break;
        default:
          throw new Error("unexpected query");
      }
    return Response.json(
      {
        data,
        extensions: {
          cost: {
            requestedQueryCost: 20,
            actualQueryCost: 10,
            throttleStatus: {
              maximumAvailable: 1000,
              currentlyAvailable: 990,
              restoreRate: 100,
            },
          },
        },
      },
      { headers: { "X-Shopify-API-Version": "2026-10" } },
    );
  };
}
