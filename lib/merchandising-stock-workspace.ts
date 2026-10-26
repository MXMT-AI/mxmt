import "server-only";
import { Prisma } from "@prisma/client";
import type { SqlClient } from "./connectors/database";
import type { ScreenSnapshot } from "./merchandising-snapshot";
import type { ScreenQuery } from "./merchandising-screen-query";
import { SKU_STATUSES, type SkuStatus } from "./classify";
import { dailyBrandSignal } from "./brand-metrics";
import {
  resolveMerchandisingPolicy,
  financialDecimal as D,
} from "./merchandising-policy";
import { dataTablePagination } from "./data-table-api";
import {
  readStockStatusGroups,
  screenStockFilter,
  screenStockJoin,
  stockStatsSql,
  stockGroupValues,
  type StockGroup,
} from "./merchandising-screen-stock";
import {
  STOCK_RING_STATUSES,
  stockStructure,
} from "./merchandising-stock-structure";

type StatusCost = Parameters<typeof stockStructure>[0][number];
interface GroupRow extends StockGroup {
  statusCosts: Record<SkuStatus, Omit<StatusCost, "status">>;
  firstReceiptDate: string | null;
  allOffSeason: boolean;
  brandOwnership: "OWN" | "CONSIGNMENT" | "UNKNOWN";
  rank: number;
}
interface PageRows {
  currency: string | null;
  totalRows: number;
  rows: GroupRow[];
}
const physical = Prisma.sql`d.metrics->>'productKind'='MERCHANDISE'`;
const otherStatuses = ["NEW", "OFF_SEASON", "DATA_ERROR", "OOS"] as const;

/** Sum saved costs per status, preserving missing physical valuation and unverified products. */
function statusCostsSql() {
  const count = (where: Prisma.Sql) =>
    Prisma.sql`count(*) FILTER(WHERE ${where})::int`;
  return Prisma.sql`jsonb_build_object(${Prisma.join(
    SKU_STATUSES.map((status) => {
      const match = Prisma.sql`d.classification=${status}`,
        merchandise = Prisma.sql`${match} AND ${physical}`;
      const sum = Prisma.sql`COALESCE(sum(d."stockCostValue") FILTER(WHERE ${merchandise}),0)::text`;
      return Prisma.sql`${status}::text,jsonb_build_object('skuCount',${count(match)},'physicalSkuCount',${count(merchandise)},'missingCostSkuCount',${count(Prisma.sql`${merchandise} AND d."stockCostValue" IS NULL`)},'coveredStockCost',${sum},'stockCost',CASE WHEN ${count(Prisma.sql`${match} AND (d.metrics->>'productKind'='UNKNOWN' OR (${physical} AND d."stockCostValue" IS NULL))`)}>0 OR (${count(match)}>0 AND ${count(merchandise)}=0) THEN NULL ELSE ${sum} END)`;
    }),
  )})`;
}
/** Categorized exceptions are outside the ring but remain in physical category totals. */
function otherCostSql() {
  const bad = otherStatuses.map(
    (s) =>
      Prisma.sql`COALESCE((g."statusCosts"->${s}->>'missingCostSkuCount')::int,0)>0`,
  );
  const unknown = Prisma.sql`(g."statusCosts"->'DATA_ERROR'->>'skuCount')::int>(g."statusCosts"->'DATA_ERROR'->>'physicalSkuCount')::int`;
  return Prisma.sql`CASE WHEN ${Prisma.join([...bad, unknown], " OR ")} THEN NULL ELSE ${Prisma.join(
    otherStatuses.map(
      (s) => Prisma.sql`(g."statusCosts"->${s}->>'coveredStockCost')::numeric`,
    ),
    " + ",
  )} END`;
}
/** Aggregate all group members before selecting status matches, ranking and per-currency paging. */
async function groupPages(
  tenantId: string,
  snapshot: ScreenSnapshot,
  q: ScreenQuery,
  db: SqlClient,
  group: "category" | "brand",
) {
  const where = screenStockFilter(
    tenantId,
    { ...q, classification: undefined },
    "stock",
  );
  const key = Prisma.sql`d.metrics->>${group + "Id"}`,
    label =
      group === "brand"
        ? Prisma.sql`COALESCE(d.metrics->>'brandName','Unassigned brand')`
        : Prisma.sql`COALESCE(s.details->>'categoryName','Unassigned category')`;
  const fullCost = Prisma.sql`CASE WHEN (g.stats->>'missingCost')::int=0 AND (g.stats->>'unknownProducts')::int=0 AND (g.stats->>'merchandiseCount')::int>0 THEN (g.stats->>'stockCost')::numeric ELSE NULL END`;
  const sort =
    group === "brand"
      ? (q.classification ?? "stockCost")
      : (q.categorySort ?? q.classification ?? "stockCost");
  const order =
    sort === "name"
      ? Prisma.sql`g.name`
      : sort === "stockCost"
        ? fullCost
        : sort === "OTHER"
          ? otherCostSql()
          : Prisma.sql`(g."statusCosts"->${sort}->>'stockCost')::numeric`;
  const direction =
    group === "brand" ? "DESC" : q.categoryDirection === "asc" ? "ASC" : "DESC";
  const page = group === "brand" ? (q.brandPage ?? 1) : (q.categoryPage ?? 1),
    size = group === "brand" ? 10 : q.pageSize,
    offset = (page - 1) * size;
  return db.$queryRaw<PageRows[]>(Prisma.sql`
 WITH g AS (SELECT ${key} id,MIN(${label}) name,d.currency,${stockStatsSql()} stats,NULL::jsonb details,${statusCostsSql()} "statusCosts",
  CASE WHEN count(*) FILTER(WHERE d.metrics->>'productKind' IN ('MERCHANDISE','UNKNOWN') AND (COALESCE((d.metrics->>'receiptHistoryComplete')::boolean,false) IS FALSE OR d.metrics->>'firstReceiptDate' IS NULL))>0 THEN NULL ELSE MIN(d.metrics->>'firstReceiptDate') FILTER(WHERE ${physical}) END "firstReceiptDate",
  COALESCE(bool_and(NOT COALESCE((d.metrics->>'inSeason')::boolean,true)) FILTER(WHERE d.metrics->>'productKind' IN ('MERCHANDISE','UNKNOWN')),false) "allOffSeason",
  MIN(COALESCE(d.metrics->>'brandOwnership','UNKNOWN')) "brandOwnership"
  FROM ${screenStockJoin} WHERE ${where} AND ${group === "brand" ? Prisma.sql`d.metrics->>'productKind' IN ('MERCHANDISE','UNKNOWN')` : Prisma.sql`true`} GROUP BY 1,3),
 ranked AS (SELECT g.*,row_number() OVER(PARTITION BY g.currency ORDER BY ${order} ${Prisma.raw(direction)} NULLS LAST,g.id ASC NULLS LAST) rank FROM g WHERE ${q.classification ? Prisma.sql`COALESCE((g.stats->'statusCounts'->>${q.classification})::int,0)>0` : Prisma.sql`true`})
 SELECT currency,count(*)::int "totalRows",COALESCE(jsonb_agg(to_jsonb(ranked) ORDER BY rank) FILTER(WHERE rank>${offset} AND rank<=${offset + size}),'[]'::jsonb) rows FROM ranked GROUP BY currency ORDER BY currency NULLS LAST`);
}
/** K1–K4 read the published status version; channel filters never change physical stock. */
export async function readStockWorkspace(
  tenantId: string,
  snapshot: ScreenSnapshot,
  q: ScreenQuery,
  db: SqlClient,
) {
  const base = { ...q, classification: undefined };
  const [statuses, categories, brands] = await Promise.all([
    readStockStatusGroups(tenantId, snapshot, base, db),
    groupPages(tenantId, snapshot, q, db, "category"),
    groupPages(tenantId, snapshot, q, db, "brand"),
  ]);
  const norm = snapshot.sales.context.settings.turnoverMonths,
    policy = resolveMerchandisingPolicy({}, snapshot.sales.context.settings);
  const finalize = (row: GroupRow) => {
    const values = stockGroupValues(row, norm),
      costs = Object.entries(row.statusCosts).map(([status, value]) => ({
        status,
        ...value,
      })),
      structure = stockStructure(costs);
    const other = costs.filter((r) =>
      otherStatuses.includes(r.status as never),
    );
    const otherComplete = other.every(
      (r) =>
        !r.missingCostSkuCount &&
        !(r.status === "DATA_ERROR" && r.skuCount > r.physicalSkuCount),
    );
    return {
      ...values,
      id: row.id,
      name: row.name,
      rank: row.rank,
      stockCost: structure.stockCost,
      quantity: row.stats.unknownProducts ? null : values.quantity,
      statuses: costs.map((r) => ({
        ...r,
        share: structure.shares[r.status]?.all ?? null,
      })),
      otherCost: otherComplete
        ? other.reduce((s, r) => s.add(r.coveredStockCost), D(0)).toString()
        : null,
      firstReceiptDate: row.firstReceiptDate,
      ownership: row.brandOwnership,
      warnings: row.brandOwnership === "UNKNOWN" ? ["OWNERSHIP_UNKNOWN"] : [],
      signal:
        snapshot.stock.calculationVersion >= 2
          ? dailyBrandSignal(
              {
                brandId: row.id,
                firstReceiptDate: row.firstReceiptDate,
                asOf: snapshot.stock.asOf,
                allOffSeason: row.allOffSeason,
                dataErrorSkuCount: row.stats.statusCounts.DATA_ERROR ?? 0,
                velocityComplete:
                  !row.stats.missingQuantity &&
                  !row.stats.unknownProducts &&
                  !row.stats.unknownVelocity &&
                  row.stats.merchandiseCount > 0,
                quantity: row.stats.quantity,
                velocity: row.stats.velocity,
                weeksOnHand: values.weeksOnHand,
              },
              policy,
            )
          : "UNAVAILABLE",
    };
  };
  const currencies = [
    ...new Set([
      ...statuses.map((r) => r.currency),
      ...categories.map((r) => r.currency),
      ...brands.map((r) => r.currency),
    ]),
  ];
  return {
    classificationAvailable: snapshot.stock.calculationVersion >= 2,
    classificationVersion: snapshot.stock.calculationVersion,
    asOf: snapshot.stock.asOf,
    cutoff: snapshot.stock.cutoff,
    channelScope: "ALL_CHANNELS",
    selectedStatus: q.classification ?? null,
    categorySort: q.categorySort ?? q.classification ?? "stockCost",
    categoryDirection: q.categoryDirection ?? "desc",
    showSkus: q.groupBy === "sku",
    history: { state: "MVP_PLACEHOLDER" },
    byCurrency: currencies.map((currency) => {
      const rows = statuses.filter((r) => r.currency === currency),
        structure = stockStructure(rows),
        category = categories.find((r) => r.currency === currency),
        brand = brands.find((r) => r.currency === currency);
      return {
        currency,
        ...structure,
        quantity: rows.every(
          (r) =>
            !r.missingQuantitySkuCount &&
            !(r.status === "DATA_ERROR" && r.skuCount > r.physicalSkuCount),
        )
          ? rows
              .filter((r) => r.physicalSkuCount > 0)
              .reduce((sum, r) => sum.add(r.quantity ?? 0), D(0))
              .toString()
          : null,
        statuses: rows.map((r) => ({
          ...r,
          ringShare: structure.shares[r.status]?.ring ?? null,
          overviewShare: structure.shares[r.status]?.all ?? null,
          inRing: STOCK_RING_STATUSES.includes(r.status as never),
        })),
        categories: {
          rows: (category?.rows ?? []).map(finalize),
          pagination: dataTablePagination(
            q.categoryPage ?? 1,
            q.pageSize,
            category?.totalRows ?? 0,
          ),
        },
        brands: {
          rows: (brand?.rows ?? []).map(finalize),
          pagination: dataTablePagination(
            q.brandPage ?? 1,
            10,
            brand?.totalRows ?? 0,
          ),
        },
      };
    }),
  };
}
export type StockWorkspaceModel = Awaited<
  ReturnType<typeof readStockWorkspace>
>;
