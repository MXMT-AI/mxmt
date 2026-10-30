import type { RepricingSku } from "@/lib/repricing-contract";
export const repricingUiSkus: RepricingSku[] = Array.from(
  { length: 32 },
  (_, i) => ({
    skuId: `sku-${i}`,
    sku: `WATCH-${String(i).padStart(3, "0")}`,
    name:
      i === 0
        ? "Field Watch Limited Edition"
        : i === 1
          ? "Classic Silver Automatic"
          : `Everyday Watch ${i + 1}`,
    barcode: null,
    brandId: i % 2 ? "brand-b" : "brand-a",
    brandName: i % 2 ? "Field Works" : "Time Studio",
    categoryId: "watches",
    categoryName: "Watches",
    classification: i % 4 === 0 ? "RISK" : "DEAD",
    productKind: "MERCHANDISE",
    ownership: i === 2 ? "CONSIGNMENT" : "OWN",
    currency: "UAH",
    quantity: String(40 - i),
    unitCost: "235",
    currentPrice: i === 3 ? "0" : "450",
    lastSaleDate: "2026-01-01",
    firstReceiptDate: "2025-01-01",
    neverSold: false,
    sold: { 1: "0", 3: String(i % 5), 7: String(i % 7) },
  }),
);
