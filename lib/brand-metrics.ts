import { prisma } from "@/lib/prisma";

export interface BrandMetric {
  brandId: string;
  brandName: string;
  skuCount: number;
  totalStock: number;
  salesLast7d: number;
  salesLast30d: number; // sales within the analysis window (default: last 30d)
  salesPrev7d: number; // previous trend window (7-14d ago, or first half of custom range)
  avgDailyVelocity: number; // units/day over the analysis window
  wohDays: number; // weeks on hand → in days
  strPercent: number; // stock turn ratio %
  trend7dPct: number; // % change recent vs previous trend window
  gmPercent: number; // gross margin %
  frozenCapital: number; // stock * purchase price
  periodDays: number; // length of the analysis window in days
}

interface Windows {
  windowStart: Date; // start of the analysis window (dateFrom or now-30d)
  strFrom: Date; // start of the STR window (last 7d of the window)
  trendMode: "weeks" | "halves";
  trendRecentFrom: Date; // recent trend window start
  trendPrevFrom: Date; // previous trend window start
  periodDays: number;
}

function buildWindows(now: Date, from?: Date): Windows {
  const day = 86400000;
  const windowStart = from ?? new Date(now.getTime() - 30 * day);
  const periodDays = Math.max(1, Math.round((now.getTime() - windowStart.getTime()) / day));
  const strFrom = new Date(Math.max(now.getTime() - 7 * day, windowStart.getTime()));

  if (from) {
    // Custom range: trend = second half of the window vs first half
    const mid = new Date(windowStart.getTime() + (periodDays / 2) * day);
    return { windowStart, strFrom, trendMode: "halves", trendRecentFrom: mid, trendPrevFrom: windowStart, periodDays };
  }
  // Default: trend = last 7d vs 7-14d ago
  return {
    windowStart,
    strFrom,
    trendMode: "weeks",
    trendRecentFrom: new Date(now.getTime() - 7 * day),
    trendPrevFrom: new Date(now.getTime() - 14 * day),
    periodDays,
  };
}

const SKU_SELECT = (tenantId: string, windowStart: Date, asOf?: Date) => ({
  id: true as const,
  pricePurchase: true as const,
  priceRetail: true as const,
  inventorySnapshots: {
    ...(asOf ? { where: { snapshotDate: { lte: asOf } } } : {}),
    orderBy: { snapshotDate: "desc" as const },
    take: 1,
    select: { qtyOnHand: true as const },
  },
  salesRecords: {
    where: { tenantId, date: asOf ? { gte: windowStart, lte: asOf } : { gte: windowStart } },
    select: { qtySold: true as const, revenue: true as const, date: true as const },
  },
});

function aggregateSkus(
  skus: {
    id: string;
    pricePurchase: number;
    priceRetail: number;
    inventorySnapshots: { qtyOnHand: number }[];
    salesRecords: { qtySold: number; revenue: number; date: Date | string }[];
  }[],
  w: Windows
): Omit<BrandMetric, "brandId" | "brandName"> {
  let totalStock = 0;
  let salesLast7d = 0;
  let salesPeriod = 0;
  let trendRecent = 0;
  let trendPrev = 0;
  let totalRevenue = 0;
  let totalCost = 0;
  let frozenCapital = 0;

  for (const sku of skus) {
    const stock = sku.inventorySnapshots[0]?.qtyOnHand ?? 0;
    totalStock += stock;
    frozenCapital += stock * sku.pricePurchase;

    for (const sale of sku.salesRecords) {
      const saleDate = new Date(sale.date);
      salesPeriod += sale.qtySold;
      totalRevenue += sale.revenue;
      totalCost += sale.qtySold * sku.pricePurchase;

      if (saleDate >= w.strFrom) salesLast7d += sale.qtySold;

      if (saleDate >= w.trendRecentFrom) {
        trendRecent += sale.qtySold;
      } else if (w.trendMode === "halves" || saleDate >= w.trendPrevFrom) {
        trendPrev += sale.qtySold;
      }
    }
  }

  const avgDailyVelocity = salesPeriod / w.periodDays;
  const wohDays =
    avgDailyVelocity > 0 ? Math.round(totalStock / avgDailyVelocity) : totalStock > 0 ? 9999 : 0;
  const strPercent = totalStock > 0 ? Math.round((salesLast7d / totalStock) * 100 * 10) / 10 : 0;
  const trend7dPct =
    trendPrev > 0
      ? Math.round(((trendRecent - trendPrev) / trendPrev) * 100)
      : trendRecent > 0
        ? 100
        : 0;
  const gmPercent =
    totalRevenue > 0
      ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 100 * 10) / 10
      : 0;

  return {
    skuCount: skus.length,
    totalStock,
    salesLast7d,
    salesLast30d: salesPeriod,
    salesPrev7d: trendPrev,
    avgDailyVelocity: Math.round(avgDailyVelocity * 10) / 10,
    wohDays,
    strPercent,
    trend7dPct,
    gmPercent,
    frozenCapital: Math.round(frozenCapital),
    periodDays: w.periodDays,
  };
}

export async function getBrandMetrics(
  tenantId: string,
  asOf?: Date,
  from?: Date
): Promise<BrandMetric[]> {
  const now = asOf ?? new Date();
  const w = buildWindows(now, from);

  const skuSelect = SKU_SELECT(tenantId, w.windowStart, asOf);

  const [brands, unbrandedSkus] = await Promise.all([
    prisma.brand.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        skus: {
          where: { tenantId, status: { in: ["ACTIVE", "NEW"] } },
          select: skuSelect,
        },
      },
    }),
    prisma.sku.findMany({
      where: { tenantId, status: { in: ["ACTIVE", "NEW"] }, brandId: null },
      select: skuSelect,
    }),
  ]);

  const result: BrandMetric[] = brands.map((brand) => ({
    brandId: brand.id,
    brandName: brand.name,
    ...aggregateSkus(brand.skus, w),
  }));

  // Include SKUs that have no brand assigned
  if (unbrandedSkus.length > 0) {
    result.push({
      brandId: "__unbranded__",
      brandName: "Без бренда",
      ...aggregateSkus(unbrandedSkus, w),
    });
  }

  return result;
}
