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

const UNKNOWN_CHANNEL = "Невідомий канал";

function channelColumnKey(columns: unknown): string | null {
  if (!Array.isArray(columns)) return null;
  const column = columns.find((value) =>
    value && typeof value === "object" && !Array.isArray(value) &&
    (value as Record<string, unknown>).label === "sajt"
  );
  const key = column && (column as Record<string, unknown>).key;
  return typeof key === "string" && key ? key : null;
}

function channelFromSourceValues(sourceValues: unknown, sourceKey: string | null): string {
  if (!sourceValues || typeof sourceValues !== "object" || Array.isArray(sourceValues)) {
    return UNKNOWN_CHANNEL;
  }

  const values = sourceValues as Record<string, unknown>;
  const rawValue = (sourceKey ? values[sourceKey] : undefined) ?? values.sajt ?? values.col_i;
  const value = typeof rawValue === "string" || typeof rawValue === "number"
    ? String(rawValue).trim()
    : "";
  return value ? `Site ${value}` : UNKNOWN_CHANNEL;
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

  const [sales, products, snapshot] = await Promise.all([
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
        sourceValues: true,
      },
    }),
    prisma.sourceProduct.findMany({
      where: { tenantId, importRunId },
      select: { stockUnits: true },
    }),
    prisma.dataSheetSnapshot.findUnique({
      where: { importRunId_sheetKey: { importRunId, sheetKey: "zavod_api" } },
      select: { columns: true },
    }),
  ]);

  const totalStock = products.reduce((sum, product) => sum + Number(product.stockUnits), 0);
  const channelSourceKey = channelColumnKey(snapshot?.columns);
  const grouped = new Map<string, {
    sold7: number;
    soldPeriod: number;
    revenuePeriod: number;
    recentProductIds: Set<string>;
  }>();

  for (const sale of sales) {
    const channel = channelFromSourceValues(sale.sourceValues, channelSourceKey);
    const aggregate = grouped.get(channel) ?? {
      sold7: 0,
      soldPeriod: 0,
      revenuePeriod: 0,
      recentProductIds: new Set<string>(),
    };
    const quantity = Number(sale.normalizedQuantity);
    aggregate.soldPeriod += quantity;
    aggregate.revenuePeriod += Number(sale.normalizedSales);
    if (sale.paymentDate && sale.paymentDate >= d7) {
      aggregate.sold7 += quantity;
      if (sale.resolvedProductId) aggregate.recentProductIds.add(sale.resolvedProductId);
    }
    grouped.set(channel, aggregate);
  }

  // `sajt` is an opaque source-system site/channel code. Keep its identity
  // without guessing business names until an explicit mapping is configured.
  const channels: ChannelMetric[] = [...grouped].map(([channel, aggregate]) => ({
    channel,
    salesLast7d: aggregate.sold7,
    salesLast30d: aggregate.soldPeriod,
    revenue30d: aggregate.revenuePeriod,
    skuCount: aggregate.recentProductIds.size,
    strPercent: totalStock > 0
      ? Math.round((aggregate.sold7 / totalStock) * 100 * 10) / 10
      : 0,
  }));

  // Sort by sales30d desc
  channels.sort((a, b) => b.salesLast30d - a.salesLast30d);

  const topChannel = channels[0]?.channel ?? "—";
  const bottomChannel = channels[channels.length - 1]?.channel ?? "—";

  return { channels, totalStock, topChannel, bottomChannel, periodDays };
}
