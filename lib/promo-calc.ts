import { prisma } from "@/lib/prisma";

// Детермінований калькулятор акції (уцінки).
// AI обирає параметри (знижка, строк, прогноз % продажу) — вся математика тут.

const ELASTICITY = 2; // fallback: +2% попиту на кожен -1% ціни, якщо AI не дав прогноз

export interface PromoSimulationInput {
  tenantId: string;
  brandId: string; // "__unbranded__" → SKU без бренда
  discountPercent: number;
  durationDays: number;
  unitsToSellPercent?: number | null; // прогноз AI: % залишку, що продасться за акцію
  asOf?: Date;
  dateFrom?: Date;
}

export interface PromoSkuRow {
  sku: string;
  name: string;
  category: string;
  stock: number;
  priceRetail: number;
  pricePurchase: number;
  newPrice: number;
  marginBeforePct: number | null;
  marginAfterPct: number | null;
  velocityPerDay: number; // шт/день за вікно аналізу
  baselineUnits: number; // прогноз продажу без акції за строк
  promoUnits: number; // прогноз продажу з акцією
  promoRevenue: number;
  promoMarginUah: number;
  capitalReleased: number; // звільнений заморожений капітал (закупівельна вартість проданого)
  stockAfter: number;
  wohAfterDays: number | null;
}

export interface PromoSimulation {
  brandId: string;
  brandName: string;
  discountPercent: number;
  durationDays: number;
  unitsToSellPercent: number | null;
  forecastModel: "ai_percent" | "elasticity";
  periodDays: number;
  asOf: string | null;
  dateFrom: string | null;
  rows: PromoSkuRow[];
  totals: {
    skuCount: number;
    stock: number;
    frozenCapital: number;
    baselineUnits: number;
    promoUnits: number;
    promoRevenue: number;
    promoMarginUah: number;
    baselineMarginUah: number;
    capitalReleased: number;
    stockAfter: number;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function simulatePromo(input: PromoSimulationInput): Promise<PromoSimulation> {
  const { tenantId, brandId, discountPercent, durationDays } = input;
  const unitsToSellPercent = input.unitsToSellPercent ?? null;

  const now = input.asOf ?? new Date();
  const windowStart = input.dateFrom ?? new Date(now.getTime() - 30 * 86400000);
  const periodDays = Math.max(1, Math.round((now.getTime() - windowStart.getTime()) / 86400000));

  const isUnbranded = brandId === "__unbranded__";
  let brandName = "Без бренда";
  if (!isUnbranded) {
    const brand = await prisma.brand.findFirst({
      where: { id: brandId, tenantId },
      select: { name: true },
    });
    if (!brand) throw new Error("Бренд не знайдено");
    brandName = brand.name;
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
      priceRetail: true,
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

  const rows: PromoSkuRow[] = [];
  for (const s of skus) {
    const stock = s.inventorySnapshots[0]?.qtyOnHand ?? 0;
    if (stock <= 0) continue; // нема чого уцінювати

    const soldPeriod = s.salesRecords.reduce((sum, r) => sum + r.qtySold, 0);
    const velocity = soldPeriod / periodDays;
    const baselineUnits = Math.min(stock, Math.round(velocity * durationDays));

    let promoUnits: number;
    if (unitsToSellPercent != null) {
      promoUnits = Math.min(stock, Math.round((stock * unitsToSellPercent) / 100));
    } else {
      const uplift = 1 + (discountPercent / 100) * ELASTICITY;
      promoUnits = Math.min(stock, Math.round(baselineUnits * uplift));
    }

    const newPrice = r2(s.priceRetail * (1 - discountPercent / 100));
    const stockAfter = stock - promoUnits;

    rows.push({
      sku: s.sku,
      name: s.name,
      category: s.category ?? "",
      stock,
      priceRetail: s.priceRetail,
      pricePurchase: s.pricePurchase,
      newPrice,
      marginBeforePct:
        s.priceRetail > 0 ? r2(((s.priceRetail - s.pricePurchase) / s.priceRetail) * 100) : null,
      marginAfterPct: newPrice > 0 ? r2(((newPrice - s.pricePurchase) / newPrice) * 100) : null,
      velocityPerDay: r2(velocity),
      baselineUnits,
      promoUnits,
      promoRevenue: r2(promoUnits * newPrice),
      promoMarginUah: r2(promoUnits * (newPrice - s.pricePurchase)),
      capitalReleased: r2(promoUnits * s.pricePurchase),
      stockAfter,
      wohAfterDays: velocity > 0 ? Math.round(stockAfter / velocity) : stockAfter > 0 ? null : 0,
    });
  }

  // Найбільший залишок зверху — найцікавіші для уцінки позиції
  rows.sort((a, b) => b.stock - a.stock);

  const totals = rows.reduce(
    (t, r) => ({
      skuCount: t.skuCount + 1,
      stock: t.stock + r.stock,
      frozenCapital: r2(t.frozenCapital + r.stock * r.pricePurchase),
      baselineUnits: t.baselineUnits + r.baselineUnits,
      promoUnits: t.promoUnits + r.promoUnits,
      promoRevenue: r2(t.promoRevenue + r.promoRevenue),
      promoMarginUah: r2(t.promoMarginUah + r.promoMarginUah),
      baselineMarginUah: r2(t.baselineMarginUah + r.baselineUnits * (r.priceRetail - r.pricePurchase)),
      capitalReleased: r2(t.capitalReleased + r.capitalReleased),
      stockAfter: t.stockAfter + r.stockAfter,
    }),
    {
      skuCount: 0, stock: 0, frozenCapital: 0, baselineUnits: 0, promoUnits: 0,
      promoRevenue: 0, promoMarginUah: 0, baselineMarginUah: 0, capitalReleased: 0, stockAfter: 0,
    }
  );

  return {
    brandId,
    brandName,
    discountPercent,
    durationDays,
    unitsToSellPercent,
    forecastModel: unitsToSellPercent != null ? "ai_percent" : "elasticity",
    periodDays,
    asOf: input.asOf ? input.asOf.toISOString().slice(0, 10) : null,
    dateFrom: input.dateFrom ? input.dateFrom.toISOString().slice(0, 10) : null,
    rows,
    totals,
  };
}
