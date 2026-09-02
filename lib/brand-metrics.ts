import { prisma } from "@/lib/prisma";
import { getActiveAgentImportRunId } from "@/lib/agent-data-source";

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
  safeDiscountCapPercent?: number; // brand-wide cap that keeps stocked SKUs at >=10% margin
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

function aggregateProducts(
  products: {
    productId: string;
    costPrice: { toString(): string };
    retailPrice?: { toString(): string };
    stockUnits: { toString(): string };
  }[],
  sales: {
    resolvedProductId: string | null;
    paymentDate: Date | string | null;
    normalizedQuantity: { toString(): string } | null;
    normalizedSales: { toString(): string } | null;
    normalizedCost: { toString(): string } | null;
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
  let safeDiscountCapPercent = 50;
  let hasPricedStock = false;

  const productIds = new Set(products.map((product) => product.productId));
  for (const product of products) {
    const stock = Number(product.stockUnits);
    totalStock += stock;
    frozenCapital += stock * Number(product.costPrice);
    const retailPrice = Number(product.retailPrice);
    const costPrice = Number(product.costPrice);
    if (stock > 0 && retailPrice > 0 && Number.isFinite(costPrice)) {
      const costShare = Math.max(0, costPrice / retailPrice);
      const skuCap = Math.max(0, Math.floor((1 - costShare / 0.9) * 100));
      safeDiscountCapPercent = Math.min(safeDiscountCapPercent, skuCap);
      hasPricedStock = true;
    }
  }

  for (const sale of sales) {
    if (!sale.resolvedProductId || !productIds.has(sale.resolvedProductId) || !sale.paymentDate) continue;
    const quantity = Number(sale.normalizedQuantity);
    const saleDate = new Date(sale.paymentDate);
    salesPeriod += quantity;
    totalRevenue += Number(sale.normalizedSales);
    totalCost += Number(sale.normalizedCost);

    if (saleDate >= w.strFrom) salesLast7d += quantity;

    if (saleDate >= w.trendRecentFrom) {
      trendRecent += quantity;
    } else if (w.trendMode === "halves" || saleDate >= w.trendPrevFrom) {
      trendPrev += quantity;
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
    skuCount: products.length,
    totalStock,
    salesLast7d,
    salesLast30d: salesPeriod,
    salesPrev7d: trendPrev,
    avgDailyVelocity: Math.round(avgDailyVelocity * 10) / 10,
    wohDays,
    strPercent,
    trend7dPct,
    gmPercent,
    safeDiscountCapPercent: hasPricedStock ? safeDiscountCapPercent : undefined,
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
  const importRunId = await getActiveAgentImportRunId(tenantId);
  if (!importRunId) return [];

  const [products, sales] = await Promise.all([
    prisma.sourceProduct.findMany({
      where: { tenantId, importRunId },
      select: { productId: true, brand: true, costPrice: true, retailPrice: true, stockUnits: true },
    }),
    prisma.sourceSaleLine.findMany({
      where: {
        tenantId,
        importRunId,
        paymentDate: { gte: w.windowStart, ...(asOf ? { lte: asOf } : {}) },
        resolvedProductId: { not: null },
        normalizedQuantity: { not: null },
        normalizedSales: { not: null },
        normalizedCost: { not: null },
      },
      select: {
        resolvedProductId: true,
        paymentDate: true,
        normalizedQuantity: true,
        normalizedSales: true,
        normalizedCost: true,
      },
    }),
  ]);

  const grouped = new Map<string | null, typeof products>();
  for (const product of products) {
    const group = grouped.get(product.brand) ?? [];
    group.push(product);
    grouped.set(product.brand, group);
  }

  return [...grouped.entries()].map(([brand, brandProducts]) => ({
    brandId: brand === null ? "brand:null" : `brand:value:${brand}`,
    brandName: brand ?? "Без бренда",
    ...aggregateProducts(brandProducts, sales, w),
  }));
}
