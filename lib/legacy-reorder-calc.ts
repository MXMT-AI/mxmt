import { prisma } from "@/lib/prisma";
import { brandValueFromAgentId, getActiveAgentImportRunId } from "@/lib/agent-data-source";

// Детермінований калькулятор дозамовлення.
// AI обирає сценарій (множник обʼєму) — вся математика тут.
// Семантика множника (з промпта Reordering-агента): 1.0 = покрити до 45 днів при поточному темпі.

export const REORDER_COVER_DAYS = 45;

export interface ReorderSimulationInput {
  tenantId: string;
  brandId: string; // "brand:null" → товари без бренда
  qtyMultiplier: number;
  asOf?: Date;
  dateFrom?: Date;
}

export interface ReorderSkuRow {
  sku: string;
  name: string;
  category: string;
  stock: number;
  velocityPerDay: number;
  wohNowDays: number | null;
  orderQty: number; // max(0, швидкість × 45 × множник − залишок)
  pricePurchase: number;
  orderCost: number;
  stockAfter: number;
  wohAfterDays: number | null;
}

export interface ReorderSimulation {
  brandId: string;
  brandName: string;
  qtyMultiplier: number;
  coverDays: number;
  leadTimeDays: number | null;
  periodDays: number;
  asOf: string | null;
  dateFrom: string | null;
  rows: ReorderSkuRow[];
  totals: {
    skuCount: number;
    stock: number;
    orderQty: number;
    orderCost: number;
    stockAfter: number;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function simulateReorder(input: ReorderSimulationInput): Promise<ReorderSimulation> {
  const { tenantId, brandId, qtyMultiplier } = input;

  const now = input.asOf ?? new Date();
  const windowStart = input.dateFrom ?? new Date(now.getTime() - 30 * 86400000);
  const periodDays = Math.max(1, Math.round((now.getTime() - windowStart.getTime()) / 86400000));

  const importRunId = await getActiveAgentImportRunId(tenantId);
  if (!importRunId) throw new Error("Немає активного успішного імпорту в новій базі");
  const brand = brandValueFromAgentId(brandId);
  const brandName = brand ?? "Без бренда";
  const leadTimeDays: number | null = null;

  const [products, sales] = await Promise.all([
    prisma.sourceProduct.findMany({
      where: { tenantId, importRunId, brand },
      select: {
        productId: true,
        article: true,
        vendorCode: true,
        name: true,
        category: true,
        costPrice: true,
        stockUnits: true,
      },
    }),
    prisma.sourceSaleLine.findMany({
      where: {
        tenantId,
        importRunId,
        paymentDate: { gte: windowStart, ...(input.asOf ? { lte: input.asOf } : {}) },
        resolvedProductId: { not: null },
        normalizedQuantity: { not: null },
      },
      select: { resolvedProductId: true, normalizedQuantity: true },
    }),
  ]);

  const soldByProduct = new Map<string, number>();
  for (const sale of sales) {
    if (!sale.resolvedProductId) continue;
    soldByProduct.set(
      sale.resolvedProductId,
      (soldByProduct.get(sale.resolvedProductId) ?? 0) + Number(sale.normalizedQuantity)
    );
  }

  const rows: ReorderSkuRow[] = [];
  for (const product of products) {
    const stock = Number(product.stockUnits);
    const soldPeriod = soldByProduct.get(product.productId) ?? 0;
    const velocity = soldPeriod / periodDays;
    if (velocity <= 0 && stock <= 0) continue; // нічого не продається і нема залишку — пропускаємо

    const targetStock = velocity * REORDER_COVER_DAYS * qtyMultiplier;
    const orderQty = Math.max(0, Math.round(targetStock - stock));
    const stockAfter = stock + orderQty;

    rows.push({
      sku: product.article ?? product.vendorCode ?? product.productId,
      name: product.name,
      category: product.category ?? "",
      stock,
      velocityPerDay: r2(velocity),
      wohNowDays: velocity > 0 ? Math.round(stock / velocity) : stock > 0 ? null : 0,
      orderQty,
      pricePurchase: Number(product.costPrice),
      orderCost: r2(orderQty * Number(product.costPrice)),
      stockAfter,
      wohAfterDays: velocity > 0 ? Math.round(stockAfter / velocity) : null,
    });
  }

  // Найбільше дозамовлення зверху
  rows.sort((a, b) => b.orderQty - a.orderQty);

  const totals = rows.reduce(
    (t, r) => ({
      skuCount: t.skuCount + 1,
      stock: t.stock + r.stock,
      orderQty: t.orderQty + r.orderQty,
      orderCost: r2(t.orderCost + r.orderCost),
      stockAfter: t.stockAfter + r.stockAfter,
    }),
    { skuCount: 0, stock: 0, orderQty: 0, orderCost: 0, stockAfter: 0 }
  );

  return {
    brandId,
    brandName,
    qtyMultiplier,
    coverDays: REORDER_COVER_DAYS,
    leadTimeDays,
    periodDays,
    asOf: input.asOf ? input.asOf.toISOString().slice(0, 10) : null,
    dateFrom: input.dateFrom ? input.dateFrom.toISOString().slice(0, 10) : null,
    rows,
    totals,
  };
}
