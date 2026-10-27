import type { HoroshopConfig } from "@/lib/connectors/horoshop/config";
export const horoshopConfig: HoroshopConfig = {
  origin: "https://fixture-shop.example.com",
  login: "integration-user",
  password: "synthetic-password",
  timezone: "Europe/Kyiv",
  mappingRevision: 1,
  statuses: { "3": "SALE" },
  evidence: {
    reference: "synthetic fixture; not customer acceptance",
    currency: "UAH",
    requestsPerWindow: 100,
    windowSeconds: 60,
    stableOrderPagination: true,
    catalogCount: 1,
    physicalStock: true,
    warehouses: ["Main"],
    netUnitPrice: true,
  },
};
export function horoshopOrder(id = 1) {
  return {
    order_id: id,
    stat_status: 3,
    stat_created: "2020-09-10 12:00:00",
    currency: "UAH",
    payed: 1,
    discount_value: 0,
    discount_percent: 0,
    coupon_discount_value: 0,
    coupon_percent: 0,
    manager_discount: 0,
    total_sum: "40.2500",
    products: [
      {
        storage_id: 101,
        article: "001-A",
        title: "Watch",
        quantity: 2,
        price: "20.1250",
        total_price: "40.2500",
      },
    ],
  };
}
export const horoshopProduct = {
  article: "001-A",
  parent_article: "BASE",
  title: { ua: "Watch" },
  price: "20.1250",
  price_old: 0,
  brand: "Brand",
  parent: { id: 2, value: { ua: "Watches" } },
  gtin: "0000001",
  residues: [{ warehouse: "Main", quantity: "12.5000" }],
  presence: { id: 1, value: { ua: "Available" } },
};
export const envelope = (response: unknown) => ({ status: "OK", response });
export function horoshopFetcher(
  orders: unknown[] = [horoshopOrder()],
  products: unknown[] = [horoshopProduct],
) {
  return async (url: URL, init: RequestInit) => {
    const d = JSON.parse(String(init.body)),
      offset = d.offset ?? 0,
      limit = d.limit ?? 100;
    return Response.json(
      envelope(
        url.pathname === "/api/auth/"
          ? { token: "a".repeat(32) }
          : url.pathname.endsWith("get_available_statuses/")
            ? {
                statuses: {
                  "3": { id: 3, title: { ua: "Delivered" }, is_successful: 1 },
                },
              }
            : url.pathname === "/api/orders/get/"
              ? { orders: orders.slice(offset, offset + limit) }
              : { products: products.slice(offset, offset + limit) },
      ),
    );
  };
}
