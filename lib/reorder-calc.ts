import { prisma } from "@/lib/prisma";

// Детермінований калькулятор дозамовлення.
// AI обирає сценарій (множник обʼєму) — вся математика тут.
// Семантика множника (з промпта Reordering-агента): 1.0 = покрити до 45 днів при поточному темпі.

export const REORDER_COVER_DAYS = 45;

export interface ReorderSimulationInput {
  tenantId: string;
  brandId: string; // "__unbranded__" → SKU без бренда
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

  const isUnbranded = brandId === "__unbranded__";
  let brandName = "Без бренда";
  let leadTimeDays: number | null = null;
  if (!isUnbranded) {
    const brand = await prisma.brand.findFirst({
      where: { id: brandId, tenantId },
      select: { name: true, leadTimeDays: true },
    });
    if (!brand) throw new Error("Бренд не знайдено");
    brandName = brand.name;
    leadTimeDays = brand.leadTimeDays ?? null;
  }

  const skus = await prisma.sku.findMany({
    where: {
      tenantId,
      status: { in: ["ACTIVE", "NEW"] },
      brandId: isUnbranded ? null : brandId,
    },
    select: {
      sku: true,
      name: true,
      category: true,
      pricePurchase: true,
      inventorySnapshots: {
        ...(input.asOf ? { where: { snapshotDate: { lte: input.asOf } } } : {}),
        orderBy: { snapshotDate: "desc" as const },
        take: 1,
        select: { qtyOnHand: true },
      },
      salesRecords: {
        where: {
          tenantId,
          date: input.asOf ? { gte: windowStart, lte: input.asOf } : { gte: windowStart },
        },
        select: { qtySold: true },
      },
    },
  });

  const rows: ReorderSkuRow[] = [];
  for (const s of skus) {
    const stock = s.inventorySnapshots[0]?.qtyOnHand ?? 0;
    const soldPeriod = s.salesRecords.reduce((sum, r) => sum + r.qtySold, 0);
    const velocity = soldPeriod / periodDays;
    if (velocity <= 0 && stock <= 0) continue; // нічого не продається і нема залишку — пропускаємо

    const targetStock = velocity * REORDER_COVER_DAYS * qtyMultiplier;
    const orderQty = Math.max(0, Math.round(targetStock - stock));
    const stockAfter = stock + orderQty;

    rows.push({
      sku: s.sku,
      name: s.name,
      category: s.category ?? "",
      stock,
      velocityPerDay: r2(velocity),
      wohNowDays: velocity > 0 ? Math.round(stock / velocity) : stock > 0 ? null : 0,
      orderQty,
      pricePurchase: s.pricePurchase,
      orderCost: r2(orderQty * s.pricePurchase),
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
