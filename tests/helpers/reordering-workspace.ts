import type { ReorderingSku } from "@/lib/reordering-contract";
import { calculateDailySku } from "@/lib/sku-daily-metrics";
import { classifyDailySku } from "@/lib/classify";
import { resolveMerchandisingPolicy } from "@/lib/merchandising-policy";
import { skuInput, context } from "./daily-sku";
export const reorderingUiSkus: ReorderingSku[] = Array.from(
  { length: 36 },
  (_, i) => {
    const policy = resolveMerchandisingPolicy({
      brandOwnership: "OWN",
      supplierId: i % 2 ? "supplier-b" : "supplier-a",
      supplierTermsVerified: true,
      leadDays: 30,
      coverDays: 60,
      moq: i % 2 ? 6 : 1,
    });
    const daily = calculateDailySku(
      skuInput({
        skuId: `sku-${String(i).padStart(2, "0")}`,
        sku: `ITEM-${String(i).padStart(3, "0")}`,
        name:
          i === 0
            ? "Travel Chess Set"
            : i === 1
              ? "Classic Field Watch"
              : `Everyday Item ${i + 1}`,
        brandId: i % 2 ? "brand-b" : "brand-a",
        categoryId: "category",
        quantity: i === 0 ? "0" : "3",
        netUnits12Weeks: "84",
        inStockDays: 84,
        firstReceiptDate: i === 4 ? "2026-10-15" : "2025-01-01",
        lastSaleDate: "2026-10-20",
        seasonMonths: i === 3 ? [1] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        costPrice: i === 2 ? null : "12.5",
        currency: i === 5 ? "USD" : "UAH",
        productKind: i === 6 ? "SERVICE" : "MERCHANDISE",
      }),
      context,
    );
    const classified = classifyDailySku(daily, policy);
    return {
      ...daily,
      ...classified,
      barcode: `000${i}`,
      brandName: i % 2 ? "Field Works" : "Play Studio",
      categoryName: "Everyday goods",
      supplierName: i % 2 ? "Field Supply" : "Play Supply",
      unitCost: i === 2 ? null : "12.5",
      inTransitQuantity: i === 1 ? null : "0",
      policy,
    };
  },
);
