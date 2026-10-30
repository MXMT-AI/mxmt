import { Prisma } from "@prisma/client";
import type { SqlClient } from "./connectors/database";
import type { ScreenSnapshot } from "./merchandising-snapshot";
import {
  NULL_GROUP,
  screenDrillDown,
  type ScreenName,
  type ScreenQuery,
} from "./merchandising-screen-query";
import {
  finalizeSalesTotals,
  compareSalesTotals,
  salesPlan,
  type SalesTotalsInput,
} from "./sales-metrics";
import { dataTablePagination } from "./data-table-api";
export function screenIdPredicate(
  column: Prisma.Sql,
  value: string | undefined,
) {
  return value === undefined
    ? Prisma.sql`true`
    : value === NULL_GROUP
      ? Prisma.sql`${column} IS NULL`
      : Prisma.sql`${column}=${value}`;
}
export function screenSalesFilter(
  tenantId: string,
  q: ScreenQuery,
  supporting = false,
) {
  const search = q.search ? `%${q.search.replace(/[\\%_]/g, "\\$&")}%` : null;
  return Prisma.sql`${supporting ? Prisma.sql`true` : Prisma.sql`(f."inCurrent" OR f."inPriorYear")`} AND f."tenantId"=${tenantId} AND f."snapshotId"=${q.snapshotId} AND ${screenIdPredicate(Prisma.sql`f."brandId"`, q.brandId)} AND ${screenIdPredicate(Prisma.sql`f."categoryId"`, q.categoryId)} AND ${screenIdPredicate(Prisma.sql`f."skuId"`, q.skuId)} AND ${screenIdPredicate(Prisma.sql`f."channelId"`, q.channelId)} AND ${screenIdPredicate(Prisma.sql`f.currency`, q.currency)} AND (${search}::text IS NULL OR COALESCE(f.sku,'') ILIKE ${search} OR COALESCE(f.name,'') ILIKE ${search} OR COALESCE(f."brandName",'') ILIKE ${search} OR COALESCE(f."categoryName",'') ILIKE ${search})`;
}
export function totalsSql(flag: Prisma.Sql) {
  return Prisma.sql`jsonb_build_object(
 'revenue',COALESCE(sum(f.revenue) FILTER(WHERE ${flag}),0)::text,
 'units',COALESCE(sum(f.quantity) FILTER(WHERE ${flag} AND f."productKind"='MERCHANDISE'),0)::text,
 'coveredRevenue',COALESCE(sum(f.revenue) FILTER(WHERE ${flag} AND f."grossProfit" IS NOT NULL),0)::text,
 'profit',COALESCE(sum(f."grossProfit") FILTER(WHERE ${flag}),0)::text,
 'covered',count(*) FILTER(WHERE ${flag} AND f."grossProfit" IS NOT NULL)::int,
 'lineCount',count(*) FILTER(WHERE ${flag})::int,
 'missingRevenueCount',count(*) FILTER(WHERE ${flag} AND f.revenue IS NULL)::int,
 'missingProfitCount',count(*) FILTER(WHERE ${flag} AND f."grossProfit" IS NULL)::int,
 'orderCount',count(DISTINCT (f."sourceId",f."orderId")) FILTER(WHERE ${flag} AND f.kind='SALE')::int,
 'returnOrderCount',count(DISTINCT (f."sourceId",f."orderId")) FILTER(WHERE ${flag} AND f.kind='RETURN')::int)`;
}
export interface AggregateRow {
  id: string | null;
  name: string;
  currency: string | null;
  current: SalesTotalsInput;
  ly: SalesTotalsInput;
}
const zero: SalesTotalsInput = {
  revenue: "0",
  units: "0",
  coveredRevenue: "0",
  profit: "0",
  covered: 0,
  lineCount: 0,
  missingRevenueCount: 0,
  missingProfitCount: 0,
  orderCount: 0,
  returnOrderCount: 0,
};
export function salesAggregateMetric(
  row: AggregateRow,
  snapshot: ScreenSnapshot,
) {
  const context = snapshot.sales.context;
  const current = finalizeSalesTotals(
      row.current,
      row.currency,
      context.history.current,
    ),
    ly = finalizeSalesTotals(row.ly, row.currency, context.history.ly);
  return compareSalesTotals(
    row.id ?? NULL_GROUP,
    row.name,
    row.currency,
    current,
    ly,
    context,
  );
}
const headline = Prisma.sql`f.kind<>'PREORDER' AND f."productKind" IN ('MERCHANDISE','SERVICE')`;
export async function readScreenSales(
  tenantId: string,
  snapshot: ScreenSnapshot,
  q: ScreenQuery,
  screen: ScreenName,
  db: SqlClient,
  withTable: boolean,
) {
  const where = screenSalesFilter(tenantId, q),
    current = totalsSql(Prisma.sql`f."inCurrent"`),
    ly = totalsSql(Prisma.sql`f."inPriorYear"`);
  const rawSummary = await db.$queryRaw<AggregateRow[]>(
    Prisma.sql`SELECT NULL::text id,'Total'::text name,f.currency,${current} "current",${ly} ly FROM "MerchandisingScreenFact" f WHERE ${where} AND ${headline} GROUP BY f.currency ORDER BY f.currency NULLS LAST`,
  );
  const currencies =
    q.currency !== undefined
      ? [q.currency === NULL_GROUP ? null : q.currency]
      : [
          ...new Set([
            ...snapshot.sales.currencies,
            ...rawSummary.map((r) => r.currency),
          ]),
        ];
  const summary = currencies.map((currency) => {
    const value = salesAggregateMetric(
      rawSummary.find((r) => r.currency === currency) ?? {
        id: null,
        name: "Total",
        currency,
        current: zero,
        ly: zero,
      },
      snapshot,
    );
    return {
      ...value,
      plan: {
        ...salesPlan(snapshot.sales.context, currency, value.current.revenue),
        targetScope: "CLIENT_MONTHLY_TARGET",
      },
    };
  });
  const components = await db.$queryRaw<
    Array<{
      productKind: string;
      currency: string | null;
      current: SalesTotalsInput;
      ly: SalesTotalsInput;
    }>
  >(
    Prisma.sql`SELECT f."productKind",f.currency,${current} "current",${ly} ly FROM "MerchandisingScreenFact" f WHERE ${where} AND f.kind<>'PREORDER' GROUP BY f."productKind",f.currency ORDER BY f."productKind",f.currency NULLS LAST`,
  );
  const movements = components.map((r) => ({
    productKind: r.productKind,
    currency: r.currency,
    current: finalizeSalesTotals(
      r.current,
      r.currency,
      snapshot.sales.context.history.current,
    ),
    ly: finalizeSalesTotals(
      r.ly,
      r.currency,
      snapshot.sales.context.history.ly,
    ),
  }));
  const preorder = await db.$queryRaw<
    Array<{ currency: string | null; amount: string | null; lineCount: number }>
  >(
    Prisma.sql`SELECT f.currency,sum(f.revenue)::text amount,count(*)::int "lineCount" FROM "MerchandisingScreenFact" f WHERE ${where} AND f.kind='PREORDER' AND f."inCurrent" GROUP BY f.currency ORDER BY f.currency NULLS LAST`,
  );
  if (!withTable)
    return { summary, movements, preorders: preorder, table: null };
  const key = Prisma.raw(`f."${q.groupBy}Id"`);
  const label =
    q.groupBy === "sku"
      ? Prisma.sql`COALESCE(f.name,f.sku,'Unassigned SKU')`
      : Prisma.raw(`COALESCE(f."${q.groupBy}Name",'Unassigned ${q.groupBy}')`);
  const [count] = await db.$queryRaw<Array<{ n: number }>>(
    Prisma.sql`SELECT count(DISTINCT jsonb_build_array(${key},f.currency))::int n FROM "MerchandisingScreenFact" f WHERE ${where} AND ${headline}`,
  );
  const order: Record<string, Prisma.Sql> = {
    name: Prisma.sql`g.name`,
    currency: Prisma.sql`g.currency`,
    units: Prisma.sql`(g."current"->>'units')::numeric`,
    orderCount: Prisma.sql`(g."current"->>'orderCount')::int`,
  };
  const revenueSort = (field: "current" | "ly") => {
    const f = Prisma.raw(`g."${field}"`),
      history =
        snapshot.sales.context.history[field === "current" ? "current" : "ly"];
    return Prisma.sql`CASE WHEN (${f}->>'missingRevenueCount')::int<(${f}->>'lineCount')::int OR ((${f}->>'lineCount')::int=0 AND ${history}) THEN (${f}->>'revenue')::numeric ELSE NULL END`;
  };
  order.revenue = revenueSort("current");
  order.lyRevenue = revenueSort("ly");
  order.coveredGrossProfit = Prisma.sql`CASE WHEN (g."current"->>'covered')::int>0 OR ((g."current"->>'lineCount')::int=0 AND ${snapshot.sales.context.history.current}) THEN (g."current"->>'profit')::numeric ELSE NULL END`;
  order.gmPct = Prisma.sql`CASE WHEN (g."current"->>'covered')::int>0 AND (g."current"->>'coveredRevenue')::numeric<>0 THEN (g."current"->>'profit')::numeric*1.000000000000000000000000000000000000000000000000/(g."current"->>'coveredRevenue')::numeric ELSE NULL END`;
  order.revenueDelta = Prisma.sql`CASE WHEN ${snapshot.sales.context.history.current && snapshot.sales.context.history.ly} AND (g."current"->>'missingRevenueCount')::int=0 AND (g.ly->>'missingRevenueCount')::int=0 THEN ${order.revenue}-${order.lyRevenue} ELSE NULL END`;
  const rows = await db.$queryRaw<AggregateRow[]>(
    Prisma.sql`WITH g AS (SELECT ${key} id,MIN(${label}) name,f.currency,${current} "current",${ly} ly FROM "MerchandisingScreenFact" f WHERE ${where} AND ${headline} GROUP BY ${key},f.currency) SELECT * FROM g ORDER BY ${order[q.sort]} ${Prisma.raw(q.direction === "desc" ? "DESC" : "ASC")} NULLS LAST,g.id ASC NULLS LAST,g.currency ASC NULLS LAST LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
  );
  const data = rows.map((row) => {
    const value = salesAggregateMetric(row, snapshot);
    return {
      id: row.id,
      name: row.name,
      ...value.current,
      lyRevenue: snapshot.sales.context.history.ly ? value.ly.revenue : null,
      revenueChangePct: value.revenueChangePct,
      comparisonReason: value.comparisonReason,
      revenueDelta: value.revenueDelta,
      unitsDelta: value.unitsDelta,
      lyCoveredGrossProfit: snapshot.sales.context.history.ly
        ? value.ly.coveredGrossProfit
        : null,
      lyGmPct: snapshot.sales.context.history.ly ? value.ly.gmPct : null,
      drillDown: screenDrillDown(screen, q, row.id, row.currency),
    };
  });
  return {
    summary,
    movements,
    preorders: preorder,
    table: {
      rows: data,
      pagination: dataTablePagination(q.page, q.pageSize, count.n),
    },
  };
}
