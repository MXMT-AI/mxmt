import { Prisma } from "@prisma/client";
import type { SqlClient } from "./connectors/database";
import { financialDecimal as D } from "./merchandising-policy";
import { SKU_STATUSES } from "./classify";
import { availabilityTone, finalizeStockCurrency } from "./sku-daily-metrics";
import type { ScreenSnapshot } from "./merchandising-snapshot";
import { screenIdPredicate } from "./merchandising-screen-sales";
import { dataTablePagination } from "./data-table-api";
import {
  screenDrillDown,
  type ScreenQuery,
  type ScreenName,
} from "./merchandising-screen-query";
const merchandise = Prisma.sql`d.metrics->>'productKind'='MERCHANDISE'`;
export function screenStockFilter(
  tenantId: string,
  q: ScreenQuery,
  screen: ScreenName,
) {
  const search = q.search ? `%${q.search.replace(/[\\%_]/g, "\\$&")}%` : null;
  const classification =
    q.classification ?? (screen === "repricing" ? "DEAD" : undefined);
  let candidates = Prisma.sql`true`;
  if (screen === "repricing")
    candidates = Prisma.sql`${merchandise} AND d.classification IN ('DEAD','RISK') AND d.quantity>0`;
  if (screen === "reordering")
    candidates =
      q.mode === "brand" || q.mode === "all"
        ? Prisma.sql`${merchandise} AND (d.active IS TRUE OR d.classification='OFF_SEASON')`
        : Prisma.sql`COALESCE((d.metrics->>'shortage')::boolean,false)`;
  return Prisma.sql`s."tenantId"=${tenantId} AND s."snapshotId"=${q.snapshotId} AND ${screenIdPredicate(Prisma.sql`d.metrics->>'brandId'`, q.brandId)} AND ${screenIdPredicate(Prisma.sql`d.metrics->>'categoryId'`, q.categoryId)} AND ${screenIdPredicate(Prisma.sql`s."skuId"`, q.skuId)} AND ${screenIdPredicate(Prisma.sql`d.currency`, q.currency)} AND ${screenIdPredicate(Prisma.sql`s.details->'policy'->>'supplierId'`, q.supplierId)} AND (${classification ?? null}::text IS NULL OR d.classification=${classification ?? null}) AND (${q.ownership ?? null}::text IS NULL OR d.metrics->>'ownership'=${q.ownership ?? null}) AND ${candidates} AND (${search}::text IS NULL OR d.metrics->>'sku' ILIKE ${search} OR d.metrics->>'name' ILIKE ${search} OR d.metrics->>'brandName' ILIKE ${search} OR s.details->>'categoryName' ILIKE ${search})`;
}
export const screenStockJoin = Prisma.sql`"MerchandisingScreenSku" s JOIN "SkuDaily" d ON d.id=s."dailyId" AND d."skuId"=s."skuId" AND d."tenantId"=s."tenantId"`;
export function stockStatsSql() {
  const count = (condition: Prisma.Sql) =>
    Prisma.sql`count(*) FILTER(WHERE ${condition})::int`;
  const sum = (key: string, condition = merchandise) =>
    Prisma.sql`COALESCE(sum((d.metrics->>${key})::numeric) FILTER(WHERE ${condition}),0)::text`;
  const cohort = Prisma.sql`${merchandise} AND COALESCE((d.metrics->>'cohortHistoryComplete')::boolean,false) AND (d.metrics->>'cohortSalesUnits')::numeric>=0 AND d.quantity IS NOT NULL`;
  return Prisma.sql`jsonb_build_object(
 'skuCount',count(*)::int,'merchandiseCount',${count(merchandise)},
 'quantity',${sum("quantity")},'stockCost',${sum("stockCostValue")},'stockRetail',${sum("stockRetailValue")},'cogs',${sum("cogs3Months")},
 'missingQuantity',${count(Prisma.sql`${merchandise} AND d.quantity IS NULL`)},'missingCost',${count(Prisma.sql`${merchandise} AND d."stockCostValue" IS NULL`)},'missingRetail',${count(Prisma.sql`${merchandise} AND d."stockRetailValue" IS NULL`)},'missingCogs',${count(Prisma.sql`${merchandise} AND d.metrics->>'cogs3Months' IS NULL`)},
 'active',${count(Prisma.sql`${merchandise} AND d.active IS TRUE`)},'inStock',${count(Prisma.sql`${merchandise} AND d.active IS TRUE AND d.quantity>0`)},'unknownStock',${count(Prisma.sql`${merchandise} AND d.active IS TRUE AND d.quantity IS NULL`)},
 'unknownActivity',${count(Prisma.sql`COALESCE((d.metrics->>'inSeason')::boolean,false) AND (d.metrics->>'productKind'='UNKNOWN' OR (${merchandise} AND d.active IS NULL))`)},
 'unknownProducts',${count(Prisma.sql`d.metrics->>'productKind'='UNKNOWN'`)},
 'partial',${count(Prisma.sql`d.metrics->>'productKind' IN ('MERCHANDISE','UNKNOWN') AND jsonb_array_length(d.diagnostics)>0`)},
 'velocity',${sum("velocityPerWeek")},'unknownVelocity',${count(Prisma.sql`${merchandise} AND d.metrics->>'velocityState' NOT IN ('KNOWN','ZERO')`)},
 'cohortSales',${sum("cohortSalesUnits", cohort)},'cohortStock',${sum("quantity", cohort)},'cohortCount',${count(cohort)},
 'shortage',${count(Prisma.sql`COALESCE((d.metrics->>'shortage')::boolean,false)`)},
 'statusCounts',jsonb_build_object(${Prisma.join(SKU_STATUSES.map((status) => Prisma.sql`${status}::text,${count(Prisma.sql`d.classification=${status}`)}`))}))`;
}
interface StockStats {
  skuCount: number;
  merchandiseCount: number;
  quantity: string;
  stockCost: string;
  stockRetail: string;
  cogs: string;
  missingQuantity: number;
  missingCost: number;
  missingRetail: number;
  missingCogs: number;
  active: number;
  inStock: number;
  unknownStock: number;
  unknownActivity: number;
  unknownProducts: number;
  partial: number;
  velocity: string;
  unknownVelocity: number;
  cohortSales: string;
  cohortStock: string;
  cohortCount: number;
  shortage: number;
  statusCounts: Record<string, number>;
}
export interface StockGroup {
  id: string | null;
  name: string;
  currency: string | null;
  stats: StockStats;
  details: Record<string, unknown> | null;
}
export function stockGroupValues(row: StockGroup, norm: number) {
  const a = row.stats;
  const values = finalizeStockCurrency(
    { ...a, skuCount: a.merchandiseCount, currency: row.currency },
    norm,
  );
  const velocity =
    a.merchandiseCount && !a.unknownVelocity && !a.unknownProducts
      ? D(a.velocity)
      : null;
  const woh =
    velocity?.gt(0) && !a.missingQuantity ? D(a.quantity).div(velocity) : null;
  const str = D(a.cohortSales).add(a.cohortStock).gt(0)
    ? D(a.cohortSales).div(D(a.cohortSales).add(a.cohortStock))
    : null;
  const availability =
    a.active && !a.unknownStock && !a.unknownActivity
      ? D(a.inStock).div(a.active).toString()
      : null;
  return {
    ...values,
    ...(!a.merchandiseCount
      ? { quantity: null, stockCost: null, stockRetail: null }
      : {}),
    skuCount: a.skuCount,
    physicalSkuCount: a.merchandiseCount,
    velocityPerWeek: velocity?.toString() ?? null,
    weeksOnHand: woh?.toString() ?? null,
    daysToZero: woh?.mul(7).toString() ?? null,
    sellThroughRatio: str?.toString() ?? null,
    strCoveredSkuCount: a.cohortCount,
    strComplete: a.cohortCount === a.merchandiseCount && !a.unknownProducts,
    availability: {
      ratio: availability,
      tone: availabilityTone(availability),
      activeSkuCount: a.active,
      activeInStockSkuCount: a.inStock,
      unknownActivitySkuCount: a.unknownActivity,
      unknownStockSkuCount: a.unknownStock,
    },
    partialSkuCount: a.partial,
    shortageSkuCount: a.shortage,
    statusCounts: a.statusCounts,
  };
}
export async function readStockStatusGroups(
  tenantId: string,
  snapshot: ScreenSnapshot,
  q: ScreenQuery,
  db: SqlClient,
) {
  const rows = await db.$queryRaw<
    Array<StockGroup & { minWoh: string | null; maxWoh: string | null }>
  >(Prisma.sql`
  SELECT d.classification id,d.classification name,d.currency,${stockStatsSql()} stats,NULL::jsonb details,
    min((d.metrics->>'weeksOnHand')::numeric)::text "minWoh",max((d.metrics->>'weeksOnHand')::numeric)::text "maxWoh"
  FROM ${screenStockJoin} WHERE ${screenStockFilter(tenantId, q, "stock")} GROUP BY d.classification,d.currency ORDER BY d.classification,d.currency NULLS LAST`);
  return rows.map((r) => ({
    ...stockGroupValues(r, snapshot.sales.context.settings.turnoverMonths),
    status: r.id!,
    minWoh: r.minWoh,
    maxWoh: r.maxWoh,
  }));
}
function actionEligibility(
  screen: ScreenName,
  details: Record<string, unknown> | null,
) {
  if (!details) return "GROUP_REVIEW";
  const policy = details.policy as Record<string, unknown>;
  if (screen === "repricing")
    return details.ownership !== "OWN"
      ? "OWNERSHIP_NOT_OWN"
      : !details.retailPrice || D(String(details.retailPrice)).lte(0)
        ? "PRICE_UNAVAILABLE"
        : !details.unitCost || D(String(details.unitCost)).lte(0)
          ? "COST_UNAVAILABLE"
          : "ELIGIBLE_FOR_PREVIEW";
  if (screen === "reordering")
    return ["SERVICE", "DATA_ERROR", "NEW", "OFF_SEASON"].includes(
      String(details.classification),
    )
      ? "EXCLUDED_BY_CLASSIFICATION"
      : details.active !== true
        ? "INACTIVE"
        : details.velocityState !== "KNOWN"
          ? "VELOCITY_UNAVAILABLE"
          : !policy?.supplierId
            ? "SUPPLIER_UNKNOWN"
            : !policy.supplierTermsVerified
              ? "SUPPLIER_TERMS_UNVERIFIED"
              : !details.unitCost || D(String(details.unitCost)).lte(0)
                ? "COST_UNAVAILABLE"
                : details.inTransitQuantity == null
                  ? "IN_TRANSIT_UNVERIFIED"
                  : Number(details.inTransitQuantity) < 0
                    ? "IN_TRANSIT_INVALID"
                    : "ELIGIBLE_FOR_PREVIEW";
  return "READ_ONLY";
}
export async function readScreenStock(
  tenantId: string,
  snapshot: ScreenSnapshot,
  q: ScreenQuery,
  screen: ScreenName,
  db: SqlClient,
  withTable: boolean,
) {
  const where = screenStockFilter(tenantId, q, screen),
    stats = stockStatsSql();
  const summaries = await db.$queryRaw<StockGroup[]>(
    Prisma.sql`SELECT NULL::text id,'Total'::text name,d.currency,${stats} stats FROM ${screenStockJoin} WHERE ${where} GROUP BY d.currency ORDER BY d.currency NULLS LAST`,
  );
  const byCurrency = summaries.map((r) =>
    stockGroupValues(r, snapshot.sales.context.settings.turnoverMonths),
  );
  const counts = summaries.reduce(
    (a, r) => ({
      active: a.active + r.stats.active,
      inStock: a.inStock + r.stats.inStock,
      unknownStock: a.unknownStock + r.stats.unknownStock,
      unknownActivity: a.unknownActivity + r.stats.unknownActivity,
    }),
    { active: 0, inStock: 0, unknownStock: 0, unknownActivity: 0 },
  );
  const ratio =
    counts.active && !counts.unknownStock && !counts.unknownActivity
      ? D(counts.inStock).div(counts.active).toString()
      : null;
  const summary = {
    byCurrency: byCurrency.filter((r) => r.physicalSkuCount > 0),
    skuCount: summaries.reduce((s, r) => s + r.stats.skuCount, 0),
    physicalSkuCount: summaries.reduce(
      (s, r) => s + r.stats.merchandiseCount,
      0,
    ),
    partialSkuCount: summaries.reduce((s, r) => s + r.stats.partial, 0),
    shortageSkuCount: summaries.reduce((s, r) => s + r.stats.shortage, 0),
    statusCounts: Object.fromEntries(
      SKU_STATUSES.map((status) => [
        status,
        summaries.reduce((s, r) => s + (r.stats.statusCounts[status] ?? 0), 0),
      ]),
    ),
    availability: {
      ratio,
      tone: availabilityTone(ratio),
      activeSkuCount: counts.active,
      activeInStockSkuCount: counts.inStock,
      unknownStockSkuCount: counts.unknownStock,
      unknownActivitySkuCount: counts.unknownActivity,
    },
  };
  if (!withTable) return { summary, table: null };
  const key =
    q.groupBy === "sku"
      ? Prisma.sql`s."skuId"`
      : Prisma.sql`d.metrics->>${q.groupBy + "Id"}`;
  const label =
    q.groupBy === "sku"
      ? Prisma.sql`d.metrics->>'name'`
      : q.groupBy === "brand"
        ? Prisma.sql`COALESCE(d.metrics->>'brandName','Unassigned brand')`
        : Prisma.sql`COALESCE(s.details->>'categoryName','Unassigned category')`;
  const [count] = await db.$queryRaw<Array<{ n: number }>>(
    Prisma.sql`SELECT count(DISTINCT jsonb_build_array(${key},d.currency))::int n FROM ${screenStockJoin} WHERE ${where}`,
  );
  const knownQty = Prisma.sql`(g.stats->>'missingQuantity')::int=0 AND (g.stats->>'merchandiseCount')::int>0`;
  const velocity = Prisma.sql`CASE WHEN (g.stats->>'unknownVelocity')::int=0 AND (g.stats->>'unknownProducts')::int=0 AND (g.stats->>'merchandiseCount')::int>0 THEN (g.stats->>'velocity')::numeric ELSE NULL END`;
  const woh = Prisma.sql`CASE WHEN ${knownQty} AND (${velocity})>0 THEN (g.stats->>'quantity')::numeric*1.000000000000000000000000000000000000000000000000/(${velocity}) ELSE NULL END`;
  const order: Record<string, Prisma.Sql> = {
    name: Prisma.sql`g.name`,
    currency: Prisma.sql`g.currency`,
    quantity: Prisma.sql`CASE WHEN ${knownQty} THEN (g.stats->>'quantity')::numeric ELSE NULL END`,
    stockCost: Prisma.sql`CASE WHEN (g.stats->>'missingCost')::int=0 AND (g.stats->>'merchandiseCount')::int>0 THEN (g.stats->>'stockCost')::numeric ELSE NULL END`,
    stockRetail: Prisma.sql`CASE WHEN (g.stats->>'missingRetail')::int=0 AND (g.stats->>'merchandiseCount')::int>0 THEN (g.stats->>'stockRetail')::numeric ELSE NULL END`,
    velocityPerWeek: velocity,
    weeksOnHand: woh,
    daysToZero: Prisma.sql`(${woh})*7`,
    sellThroughRatio: Prisma.sql`CASE WHEN (g.stats->>'cohortSales')::numeric+(g.stats->>'cohortStock')::numeric>0 THEN (g.stats->>'cohortSales')::numeric*1.000000000000000000000000000000000000000000000000/((g.stats->>'cohortSales')::numeric+(g.stats->>'cohortStock')::numeric) ELSE NULL END`,
    skuCount: Prisma.sql`(g.stats->>'skuCount')::int`,
  };
  const detail =
    q.groupBy === "sku"
      ? Prisma.sql`d2.metrics||s2.details`
      : Prisma.sql`NULL::jsonb`;
  const detailJoin =
    q.groupBy === "sku"
      ? Prisma.sql`LEFT JOIN "MerchandisingScreenSku" s2 ON s2."tenantId"=${tenantId} AND s2."snapshotId"=${q.snapshotId} AND s2."skuId"=g.id LEFT JOIN "SkuDaily" d2 ON d2.id=s2."dailyId" AND d2."tenantId"=s2."tenantId" AND d2."skuId"=s2."skuId"`
      : Prisma.empty;
  const rows = await db.$queryRaw<StockGroup[]>(
    Prisma.sql`WITH g AS (SELECT ${key} id,MIN(${label}) name,d.currency,${stats} stats FROM ${screenStockJoin} WHERE ${where} GROUP BY 1,3),paged AS (SELECT * FROM g ORDER BY ${order[q.sort]} ${Prisma.raw(q.direction === "desc" ? "DESC" : "ASC")} NULLS LAST,g.id ASC NULLS LAST,g.currency ASC NULLS LAST LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}) SELECT g.*,${detail} details FROM paged g ${detailJoin} ORDER BY ${order[q.sort]} ${Prisma.raw(q.direction === "desc" ? "DESC" : "ASC")} NULLS LAST,g.id ASC NULLS LAST,g.currency ASC NULLS LAST`,
  );
  return {
    summary,
    table: {
      rows: rows.map((r) => ({
        ...stockGroupValues(r, snapshot.sales.context.settings.turnoverMonths),
        id: r.id,
        name: r.name,
        sku: r.details?.sku ?? null,
        barcode: r.details?.barcode ?? null,
        ownership: r.details?.ownership ?? null,
        unitCost: r.details?.unitCost ?? null,
        retailPrice: r.details?.retailPrice ?? null,
        inTransitQuantity:
          r.details?.inTransitQuantity == null
            ? null
            : String(r.details.inTransitQuantity),
        sourceObservedAt: r.details?.sourceObservedAt ?? null,
        details: r.details,
        classification: r.details?.classification ?? null,
        eligibility: actionEligibility(screen, r.details),
        drillDown: screenDrillDown(screen, q, r.id, r.currency),
      })),
      pagination: dataTablePagination(q.page, q.pageSize, count.n),
    },
  };
}
