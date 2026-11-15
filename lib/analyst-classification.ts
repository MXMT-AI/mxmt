import "server-only";

import type { ClassifiedSku, ClassifySummary, SkuFlag } from "./analyst-types";
import {
  LEGACY_CLASSIFICATION_FILTER,
  canClassifyProduct,
  classify,
  getThresholds,
  snapshotStock,
} from "./classify";
import { prisma } from "./prisma";

const flagOrder: Record<SkuFlag, number> = { hit: 0, stockout: 1, slow: 2, dead: 3, ok: 4 };
const dayMs = 24 * 60 * 60 * 1000;

export async function loadAnalystClassification(
  tenantId: string,
  { brand, category }: { brand?: string | null; category?: string | null } = {},
) {
  const now = Date.now();
  const since30 = new Date(now - 30 * dayMs);
  const since7 = new Date(now - 7 * dayMs);

  const [skus, snapshots, sales30, sales7, onboarding] = await Promise.all([
    prisma.sku.findMany({
      where: {
        tenantId,
        ...LEGACY_CLASSIFICATION_FILTER,
        status: { in: ["ACTIVE", "NEW"] },
        ...(brand ? { brand: { name: { contains: brand, mode: "insensitive" } } } : {}),
        ...(category ? { category: { contains: category, mode: "insensitive" } } : {}),
      },
      include: { brand: { select: { name: true, leadTimeDays: true } } },
    }),
    prisma.inventorySnapshot.findMany({
      where: { tenantId, sourceId: null },
      orderBy: { snapshotDate: "desc" },
      distinct: ["skuId"],
      select: { skuId: true, qtyOnHand: true, quantity: true },
    }),
    prisma.salesRecord.groupBy({
      by: ["skuId"],
      where: { tenantId, date: { gte: since30 } },
      _sum: { qtySold: true },
    }),
    prisma.salesRecord.groupBy({
      by: ["skuId"],
      where: { tenantId, date: { gte: since7 } },
      _sum: { qtySold: true },
    }),
    prisma.onboardingBrief.findUnique({ where: { tenantId }, select: { businessModel: true } }),
  ]);

  const businessModel = onboarding?.businessModel ?? null;
  const thresholds = getThresholds(businessModel);
  const stockBySku = new Map(snapshots.map((snapshot) => [snapshot.skuId, snapshotStock(snapshot)]));
  const sales30BySku = new Map(sales30.map((sale) => [sale.skuId, sale._sum.qtySold]));
  const sales7BySku = new Map(sales7.map((sale) => [sale.skuId, sale._sum.qtySold]));
  const classified: ClassifiedSku[] = [];
  const summary: ClassifySummary = { total: 0, hit: 0, stockout: 0, slow: 0, dead: 0, ok: 0 };

  for (const sku of skus) {
    const stock = stockBySku.get(sku.id);
    if (stock == null || !canClassifyProduct(sku, stock)) continue;

    const sold30 = sales30BySku.get(sku.id) ?? 0;
    const sold7 = sales7BySku.get(sku.id) ?? 0;
    const leadTime = sku.brand?.leadTimeDays ?? 14;
    const avg30 = sold30 / 30;
    const daysOfStock = avg30 > 0 ? Math.round(stock / avg30) : stock > 0 ? 9999 : 0;
    const flag = classify(stock, sold7, sold30, leadTime, thresholds);

    classified.push({
      id: sku.id,
      sku: sku.sku,
      name: sku.name,
      category: sku.category,
      brand: sku.brand?.name ?? null,
      priceRetail: sku.priceRetail,
      pricePurchase: sku.pricePurchase,
      stock,
      sold7,
      sold30,
      avgDaily30: Math.round(avg30 * 10) / 10,
      daysOfStock,
      leadTime,
      flag,
    });
    summary[flag]++;
  }

  summary.total = classified.length;
  classified.sort((a, b) => flagOrder[a.flag] - flagOrder[b.flag]);

  return {
    skus: classified,
    summary,
    businessModel,
    catalogSkuCount: skus.length,
    hasOnboarding: onboarding != null,
  };
}
