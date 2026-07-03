import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { SkuFlag, ClassifiedSku } from "@/lib/analyst-types";
import { classify, getThresholds } from "@/lib/classify";

export type { SkuFlag, ClassifiedSku };

const FLAG_ORDER: Record<SkuFlag, number> = { hit: 0, stockout: 1, slow: 2, dead: 3, ok: 4 };

export async function GET(request: NextRequest) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  const { searchParams } = new URL(request.url);
  const filterFlag = searchParams.get("flag");
  const filterBrand = searchParams.get("brand");
  const filterCategory = searchParams.get("category");

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [skus, snapshots, sales30raw, sales7raw, onboarding] = await Promise.all([
    prisma.sku.findMany({
      where: {
        tenantId,
        status: { in: ["ACTIVE", "NEW"] },
        ...(filterBrand ? { brand: { name: { contains: filterBrand, mode: "insensitive" } } } : {}),
        ...(filterCategory ? { category: { contains: filterCategory, mode: "insensitive" } } : {}),
      },
      include: { brand: { select: { name: true, leadTimeDays: true } } },
    }),
    prisma.inventorySnapshot.findMany({
      where: { tenantId },
      orderBy: { snapshotDate: "desc" },
      distinct: ["skuId"],
      select: { skuId: true, qtyOnHand: true },
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
    prisma.onboardingBrief.findUnique({ where: { tenantId } }),
  ]);

  const thresholds = getThresholds(onboarding?.businessModel ?? null);
  const stockMap = Object.fromEntries(snapshots.map((s) => [s.skuId, s.qtyOnHand]));
  const s30Map = Object.fromEntries(sales30raw.map((s) => [s.skuId, s._sum.qtySold ?? 0]));
  const s7Map = Object.fromEntries(sales7raw.map((s) => [s.skuId, s._sum.qtySold ?? 0]));

  const classified: ClassifiedSku[] = skus.map((sku) => {
    const stock = stockMap[sku.id] ?? 0;
    const sold30 = s30Map[sku.id] ?? 0;
    const sold7 = s7Map[sku.id] ?? 0;
    const leadTime = sku.brand?.leadTimeDays ?? 14;
    const avg30 = sold30 / 30;
    const days = avg30 > 0 ? Math.round(stock / avg30) : stock > 0 ? 9999 : 0;
    return {
      id: sku.id, sku: sku.sku, name: sku.name, category: sku.category,
      brand: sku.brand?.name ?? null, priceRetail: sku.priceRetail,
      pricePurchase: sku.pricePurchase, stock, sold7, sold30,
      avgDaily30: Math.round(avg30 * 10) / 10, daysOfStock: days,
      leadTime, flag: classify(stock, sold7, sold30, leadTime, thresholds),
    };
  });

  const filtered = filterFlag ? classified.filter((s) => s.flag === filterFlag) : classified;
  filtered.sort((a, b) => FLAG_ORDER[a.flag] - FLAG_ORDER[b.flag]);

  const summary = {
    total: classified.length,
    hit:      classified.filter((s) => s.flag === "hit").length,
    stockout: classified.filter((s) => s.flag === "stockout").length,
    slow:     classified.filter((s) => s.flag === "slow").length,
    dead:     classified.filter((s) => s.flag === "dead").length,
    ok:       classified.filter((s) => s.flag === "ok").length,
  };

  return NextResponse.json({ skus: filtered, summary });
}
