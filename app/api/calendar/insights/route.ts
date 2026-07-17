import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SkuFlag } from "@/lib/analyst-types";
import { classify, getThresholds } from "@/lib/classify";
import { requireApiUser } from "@/lib/server-auth";


export interface CalendarInsight {
  type: "warn" | "agent" | "stock";
  brand: string;
  week: string;
  title: string;
  desc: string;
  impact: string;
  weekKey?: string;   // ISO week key e.g. "w18" — for placing chip in calendar grid
  rowKey?: string;    // calendar row e.g. "supply", "accent", "promo"
}

function currentISOWeek(): number {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [skus, snapshots, sales30raw, sales7raw, onboarding] = await Promise.all([
    prisma.sku.findMany({
      where: { tenantId, status: { in: ["ACTIVE", "NEW"] } },
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

  if (skus.length === 0) {
    return NextResponse.json([]);
  }

  const thresholds = getThresholds(onboarding?.businessModel ?? null);
  const stockMap = Object.fromEntries(snapshots.map((s) => [s.skuId, s.qtyOnHand]));
  const s30Map = Object.fromEntries(sales30raw.map((s) => [s.skuId, s._sum.qtySold ?? 0]));
  const s7Map = Object.fromEntries(sales7raw.map((s) => [s.skuId, s._sum.qtySold ?? 0]));

  type Row = { name: string; brand: string | null; stock: number; sold7: number; sold30: number; avgDaily30: number; daysOfStock: number; leadTime: number; flag: SkuFlag };

  const classified: Row[] = skus.map((s) => {
    const stock = stockMap[s.id] ?? 0;
    const sold30 = s30Map[s.id] ?? 0;
    const sold7 = s7Map[s.id] ?? 0;
    const leadTime = s.brand?.leadTimeDays ?? 14;
    const avg30 = sold30 / 30;
    const days = avg30 > 0 ? Math.round(stock / avg30) : stock > 0 ? 9999 : 0;
    return { name: s.name, brand: s.brand?.name ?? null, stock, sold7, sold30, avgDaily30: Math.round(avg30 * 10) / 10, daysOfStock: days, leadTime, flag: classify(stock, sold7, sold30, leadTime, thresholds) };
  });

  // Group by brand, pick worst flag per brand
  const brandMap = new Map<string, Row>();
  for (const row of classified) {
    const key = row.brand ?? row.name;
    const existing = brandMap.get(key);
    const flagPrio: Record<SkuFlag, number> = { stockout: 0, hit: 1, slow: 2, dead: 3, ok: 4 };
    if (!existing || flagPrio[row.flag] < flagPrio[existing.flag]) {
      brandMap.set(key, row);
    }
  }

  const insights: CalendarInsight[] = [];
  const baseWeek = currentISOWeek();

  // Stockouts → warnings in "supply" row
  const stockouts = [...brandMap.values()]
    .filter((r) => r.flag === "stockout")
    .sort((a, b) => a.daysOfStock - b.daysOfStock)
    .slice(0, 3);

  for (const r of stockouts) {
    const brand = r.brand ?? r.name;
    const weeksLeft = Math.ceil(r.daysOfStock / 7);
    const targetWeek = baseWeek + Math.max(0, weeksLeft - 1);
    insights.push({
      type: "warn",
      brand,
      week: weeksLeft <= 1 ? "Цей тиждень" : `~${weeksLeft} тижні`,
      title: `${brand} — лише ${r.daysOfStock} днів залишку`,
      desc: `При поточних продажах ${r.avgDaily30} шт/день товар закінчиться через ${r.daysOfStock} днів. Зупиніть рекламу або терміново замовте поповнення.`,
      impact: `Ризик: втрата продажів ~${Math.round(r.avgDaily30 * 14)} шт за 2 тижні без поповнення`,
      weekKey: `w${targetWeek}`,
      rowKey: "supply",
    });
  }

  // Hits → agent chips in "accent" row (current week)
  const hits = [...brandMap.values()]
    .filter((r) => r.flag === "hit")
    .sort((a, b) => b.sold7 - a.sold7)
    .slice(0, 3);

  for (const r of hits) {
    const brand = r.brand ?? r.name;
    const growth = r.sold30 > 0 ? Math.round(((r.sold7 / 7) / (r.sold30 / 30) - 1) * 100) : 0;
    insights.push({
      type: "agent",
      brand,
      week: "Зараз",
      title: `${brand} росте +${growth}% за тиждень — збільшуй рекламу`,
      desc: `Продажі за 7 днів: ${r.sold7} шт (середній денний +${growth}% vs місяць). Запас ${r.daysOfStock} днів — є куди рости.`,
      impact: `Рекомендація: збільш Ads бюджет на ${brand} на 50–100% поки є попит`,
      weekKey: `w${baseWeek}`,
      rowKey: "accent",
    });
  }

  // Dead stock → clearance in "promo" row (current week)
  const dead = [...brandMap.values()]
    .filter((r) => r.flag === "dead" && r.stock > 0)
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 2);

  for (const r of dead) {
    const brand = r.brand ?? r.name;
    insights.push({
      type: "stock",
      brand,
      week: "Невідкладно",
      title: `${brand} — ${r.stock} шт заморожено без продажів`,
      desc: `За останні 30 днів — 0 продажів. Потрібна кампанія знижок або вивіз з вітрини.`,
      impact: `Flash-sale -20–30% звільнить капітал та місце для нового товару`,
      weekKey: `w${baseWeek}`,
      rowKey: "promo",
    });
  }

  return NextResponse.json(insights);
}
