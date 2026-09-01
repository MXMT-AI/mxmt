import { prisma } from "@/lib/prisma";
import { getActiveAgentImportRunId } from "@/lib/agent-data-source";

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
  const importRunId = await getActiveAgentImportRunId(tenantId);
  if (!importRunId) {
    return { channels: [], totalStock: 0, topChannel: "—", bottomChannel: "—", periodDays };
  }

  const [sales, products] = await Promise.all([
    prisma.sourceSaleLine.findMany({
      where: {
        tenantId,
        importRunId,
        paymentDate: { gte: d30, ...(asOf ? { lte: asOf } : {}) },
        resolvedProductId: { not: null },
        normalizedQuantity: { not: null },
        normalizedSales: { not: null },
      },
      select: {
        paymentDate: true,
        resolvedProductId: true,
        normalizedQuantity: true,
        normalizedSales: true,
      },
    }),
    prisma.sourceProduct.findMany({
      where: { tenantId, importRunId },
      select: { stockUnits: true },
    }),
  ]);

  const totalStock = products.reduce((sum, product) => sum + Number(product.stockUnits), 0);
  let sold7 = 0;
  let soldPeriod = 0;
  let revenuePeriod = 0;
  const recentProductIds = new Set<string>();
  for (const sale of sales) {
    const quantity = Number(sale.normalizedQuantity);
    soldPeriod += quantity;
    revenuePeriod += Number(sale.normalizedSales);
    if (sale.paymentDate && sale.paymentDate >= d7) {
      sold7 += quantity;
      if (sale.resolvedProductId) recentProductIds.add(sale.resolvedProductId);
    }
  }

  // ZAVOD_API is the online order source. The approved typed import contract
  // has no channel column, so inventing finer channel attribution here would be
  // misleading. Preserve the source's truthful granularity as one online channel.
  const channels: ChannelMetric[] = sales.length > 0 ? [{
    channel: "online",
    salesLast7d: sold7,
    salesLast30d: soldPeriod,
    revenue30d: revenuePeriod,
    skuCount: recentProductIds.size,
    strPercent: totalStock > 0 ? Math.round((sold7 / totalStock) * 100 * 10) / 10 : 0,
  }] : [];

  // Sort by sales30d desc
  channels.sort((a, b) => b.salesLast30d - a.salesLast30d);

  const topChannel = channels[0]?.channel ?? "—";
  const bottomChannel = channels[channels.length - 1]?.channel ?? "—";

  return { channels, totalStock, topChannel, bottomChannel, periodDays };
}
