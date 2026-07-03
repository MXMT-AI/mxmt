import { prisma } from "@/lib/prisma";

export interface ChannelMetric {
  channel: string;
  salesLast7d: number;
  salesLast30d: number;
  revenue30d: number;
  skuCount: number;
  strPercent: number; // sold_7d / total_stock * 100 per channel
}

export interface ChannelMetrics {
  channels: ChannelMetric[];
  totalStock: number;
  topChannel: string;
  bottomChannel: string;
  periodDays: number;
}

export async function getChannelMetrics(
  tenantId: string,
  asOf?: Date,
  from?: Date
): Promise<ChannelMetrics> {
  const now = asOf ?? new Date();
  const d30 = from ?? new Date(now.getTime() - 30 * 86400000);
  const periodDays = Math.max(1, Math.round((now.getTime() - d30.getTime()) / 86400000));
  const d7 = new Date(Math.max(now.getTime() - 7 * 86400000, d30.getTime()));

  const [sales7, sales30, snapshots] = await Promise.all([
    prisma.salesRecord.groupBy({
      by: ["channel"],
      where: { tenantId, date: asOf ? { gte: d7, lte: asOf } : { gte: d7 } },
      _sum: { qtySold: true, revenue: true },
      _count: { skuId: true },
    }),
    prisma.salesRecord.groupBy({
      by: ["channel"],
      where: { tenantId, date: asOf ? { gte: d30, lte: asOf } : { gte: d30 } },
      _sum: { qtySold: true, revenue: true },
    }),
    prisma.inventorySnapshot.findMany({
      where: { tenantId, ...(asOf ? { snapshotDate: { lte: asOf } } : {}) },
      orderBy: { snapshotDate: "desc" },
      distinct: ["skuId"],
      select: { qtyOnHand: true },
    }),
  ]);

  const totalStock = snapshots.reduce((s, i) => s + i.qtyOnHand, 0);
  const s30Map: Record<string, { qty: number; revenue: number }> = {};
  for (const s of sales30) {
    s30Map[s.channel] = {
      qty: s._sum.qtySold ?? 0,
      revenue: s._sum.revenue ?? 0,
    };
  }

  // Build from 30d data so channels with no recent 7d sales still appear
  const s7Map: Record<string, { qty: number; skuCount: number }> = {};
  for (const s of sales7) {
    s7Map[s.channel] = {
      qty: s._sum.qtySold ?? 0,
      skuCount: s._count.skuId ?? 0,
    };
  }

  const channels: ChannelMetric[] = sales30.map((s) => {
    const ch = s.channel || "unknown";
    const sold7 = s7Map[ch]?.qty ?? 0;
    const sold30 = s._sum.qtySold ?? 0;
    return {
      channel: ch,
      salesLast7d: sold7,
      salesLast30d: sold30,
      revenue30d: s._sum.revenue ?? 0,
      skuCount: s7Map[ch]?.skuCount ?? 0,
      strPercent: totalStock > 0 ? Math.round((sold7 / totalStock) * 100 * 10) / 10 : 0,
    };
  });

  // Sort by sales30d desc
  channels.sort((a, b) => b.salesLast30d - a.salesLast30d);

  const topChannel = channels[0]?.channel ?? "—";
  const bottomChannel = channels[channels.length - 1]?.channel ?? "—";

  return { channels, totalStock, topChannel, bottomChannel, periodDays };
}
