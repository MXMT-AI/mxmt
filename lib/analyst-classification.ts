import "server-only";

import { Prisma } from "@prisma/client";
import type { ClassifiedSku, ClassifySummary, SkuFlag } from "./analyst-types";
import {
  LEGACY_CLASSIFICATION_FILTER,
  canClassifyProduct,
  classify,
  getThresholds,
  snapshotStock,
} from "./classify";
import { prisma } from "./prisma";
import { readReportPublication, withPublishedScenarioInputs } from "./merchandising-publication";
import { workspaceReportStorage } from "./workspace-report-storage";
import { screenStockJoin } from "./merchandising-screen-stock";

const flagOrder: Record<SkuFlag, number> = { hit: 0, stockout: 1, slow: 2, dead: 3, ok: 4 };
const dayMs = 24 * 60 * 60 * 1000;

type AnalystFilters = { brand?: string | null; category?: string | null };
type AnalystSkuInput = Omit<ClassifiedSku, "flag" | "avgDaily30" | "daysOfStock">;

function classifyRow(row: AnalystSkuInput, thresholds: ReturnType<typeof getThresholds>): ClassifiedSku {
  const { stock, sold7, sold30, leadTime } = row;
  const avg30 = sold30 / 30;
  return {
    ...row,
    avgDaily30: Math.round(avg30 * 10) / 10,
    daysOfStock: avg30 > 0 ? Math.round(stock / avg30) : stock > 0 ? 9999 : 0,
    flag: classify(stock, sold7, sold30, leadTime, thresholds),
  };
}

async function readPublishedAnalystRows(tenantId: string, { brand, category }: AnalystFilters) {
  const storage = await workspaceReportStorage(tenantId);
  const publication = storage && await readReportPublication(tenantId, storage);
  if (!storage || !publication?.agentSource) return null;
  const { snapshotId, asOf } = publication;
  const rows = await withPublishedScenarioInputs(tenantId, { snapshotId }, storage, (db) =>
    db.$queryRaw<AnalystSkuInput[]>(Prisma.sql`
      WITH movement AS (
        SELECT "skuId",
          COALESCE(sum(quantity) FILTER (WHERE "businessDate" >= ${asOf}::date - 6),0)::float8 "sold7",
          COALESCE(sum(quantity),0)::float8 "sold30"
        FROM "MerchandisingScreenFact"
        WHERE "tenantId"=${tenantId} AND "snapshotId"=${snapshotId}
          AND "businessDate" BETWEEN ${asOf}::date - 29 AND ${asOf}::date
          AND "productKind"='MERCHANDISE' AND kind IN ('SALE','RETURN')
        GROUP BY "skuId"
      )
      SELECT s."skuId" id, d.metrics->>'sku' sku, d.metrics->>'name' name,
        COALESCE(s.details->>'categoryName','') category, d.metrics->>'brandName' brand,
        (s.details->>'retailPrice')::float8 "priceRetail",
        (s.details->>'unitCost')::float8 "pricePurchase", d.quantity::float8 stock,
        COALESCE(m."sold7",0)::float8 "sold7", COALESCE(m."sold30",0)::float8 "sold30",
        COALESCE((s.details->'policy'->>'leadDays')::int,14) "leadTime"
      FROM ${screenStockJoin}
      LEFT JOIN movement m ON m."skuId"=s."skuId"
      WHERE s."tenantId"=${tenantId} AND s."snapshotId"=${snapshotId}
        AND d.metrics->>'productKind'='MERCHANDISE' AND d.quantity>=0
        ${brand ? Prisma.sql`AND strpos(lower(d.metrics->>'brandName'),lower(${brand}))>0` : Prisma.empty}
        ${category ? Prisma.sql`AND strpos(lower(s.details->>'categoryName'),lower(${category}))>0` : Prisma.empty}
      ORDER BY s."skuId"`));
  if (!rows) return null;
  const businessModel = publication.navigation.monobrand ? "monobrand" : "multibrand";
  const thresholds = getThresholds(businessModel);
  return {
    skus: rows.map((row) => classifyRow(row, thresholds)),
    businessModel,
    catalogSkuCount: rows.length,
    hasOnboarding: false,
  };
}

export async function loadAnalystClassificationRows(
  tenantId: string,
  filters: AnalystFilters = {},
) {
  const published = await readPublishedAnalystRows(tenantId, filters);
  if (published) return published;
  const { brand, category } = filters;
  const now = Date.now();
  const since30 = new Date(now - 30 * dayMs);
  const since7 = new Date(now - 7 * dayMs);

  const [skus, snapshots, sales30, sales7, onboarding] = await Promise.all([
    prisma.sku.findMany({
      where: {
        tenantId,
        ...LEGACY_CLASSIFICATION_FILTER,
        status: { in: ["ACTIVE", "NEW"] },
        ...(brand ? { brand: { name: { contains: brand, mode: "insensitive" } } } : {}),
        ...(category ? { category: { contains: category, mode: "insensitive" } } : {}),
      },
      include: { brand: { select: { name: true, leadTimeDays: true } } },
    }),
    prisma.inventorySnapshot.findMany({
      where: { tenantId, sourceId: null },
      orderBy: { snapshotDate: "desc" },
      distinct: ["skuId"],
      select: { skuId: true, qtyOnHand: true, quantity: true },
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
    prisma.onboardingBrief.findUnique({ where: { tenantId }, select: { businessModel: true } }),
  ]);

  const businessModel = onboarding?.businessModel ?? null;
  const thresholds = getThresholds(businessModel);
  const stockBySku = new Map(snapshots.map((snapshot) => [snapshot.skuId, snapshotStock(snapshot)]));
  const sales30BySku = new Map(sales30.map((sale) => [sale.skuId, sale._sum.qtySold]));
  const sales7BySku = new Map(sales7.map((sale) => [sale.skuId, sale._sum.qtySold]));
  const classified: ClassifiedSku[] = [];

  for (const sku of skus) {
    const stock = stockBySku.get(sku.id);
    if (stock == null || !canClassifyProduct(sku, stock)) continue;

    const sold30 = sales30BySku.get(sku.id) ?? 0;
    const sold7 = sales7BySku.get(sku.id) ?? 0;
    const leadTime = sku.brand?.leadTimeDays ?? 14;
    classified.push(classifyRow({
      id: sku.id,
      sku: sku.sku,
      name: sku.name,
      category: sku.category,
      brand: sku.brand?.name ?? null,
      priceRetail: sku.priceRetail,
      pricePurchase: sku.pricePurchase,
      stock,
      sold7,
      sold30,
      leadTime,
    }, thresholds));
  }

  return {
    skus: classified,
    businessModel,
    catalogSkuCount: skus.length,
    hasOnboarding: onboarding != null,
  };
}

export async function loadAnalystClassification(
  tenantId: string,
  filters: AnalystFilters = {},
) {
  const data = await loadAnalystClassificationRows(tenantId, filters);
  const summary: ClassifySummary = {
    total: data.skus.length, hit: 0, stockout: 0, slow: 0, dead: 0, ok: 0,
  };
  for (const sku of data.skus) summary[sku.flag]++;
  data.skus.sort((a, b) => flagOrder[a.flag] - flagOrder[b.flag]);
  return { ...data, summary };
}
