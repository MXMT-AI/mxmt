import type { KeyCrmConfig } from "@/lib/connectors/keycrm/config";
export const keyCrmConfig: KeyCrmConfig = {
  accountId: "fixture-account",
  apiKey: "synthetic-key-one",
  timezone: "Europe/Kyiv",
  mappingRevision: 1,
  statuses: { "5": "SALE" },
  channels: { "1": "Shop" },
  evidence: {
    reference: "synthetic approved fixture; not customer acceptance",
    currency: "UAH",
    netUnitPrice: true,
    purchasedPriceUnit: true,
    fullPaymentDate: true,
    physicalStock: true,
    warehouseIds: [],
    history: null,
  },
};
export function keyCrmOrder(id = 1) {
  return {
    id,
    status_id: 5,
    source_id: 1,
    created_at: "2026-09-10 08:00:00",
    updated_at: "2026-10-25 08:00:00",
    payment_status: "paid",
    grand_total: "40.2500",
    payments: [
      {
        amount: "20.0000",
        status: "paid",
        payment_date: "2026-09-10 09:00:00",
      },
      {
        amount: "20.2500",
        status: "paid",
        payment_date: "2026-09-10 10:00:00",
      },
    ],
    products: [
      {
        id: 101,
        sku: "001-A",
        offer: { id: 11, product_id: 1 },
        quantity: "2",
        price_sold: "20.1250",
        price: "21.5000",
        purchased_price: "10.0000",
        total_discount: "2.7500",
      },
    ],
  };
}
export const keyCrmProduct = {
  id: 1,
  name: "Watch",
  sku: "BASE",
  currency_code: "UAH",
  category_id: 2,
  price: "20.1250",
  updated_at: "2026-10-24 08:00:00",
};
export const keyCrmOffer = {
  id: 11,
  product_id: 1,
  sku: "001-A",
  barcode: "000000001",
  price: "20.1250",
  purchased_price: "10.0000",
};
export const keyCrmStock = {
  id: 11,
  sku: "001-A",
  quantity: "12.5000",
  reserve: "2.5000",
  warehouse: [
    { id: 1, quantity: "8.0000", reserve: "1.0000" },
    { id: 2, quantity: "4.5000", reserve: "1.5000" },
  ],
};
export function keyCrmPage(
  data: unknown[],
  page = 1,
  limit = 50,
  total = data.length,
) {
  return {
    current_page: page,
    per_page: limit,
    total,
    data,
    next_page_url:
      page * limit < total ? "https://untrusted.test/private" : null,
  };
}
