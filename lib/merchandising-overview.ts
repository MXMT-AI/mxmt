import "server-only";
import { Temporal } from "@js-temporal/polyfill";
import { Prisma } from "@prisma/client";
import type { SqlClient } from "./connectors/database";
import type { ScreenSnapshot } from "./merchandising-snapshot";
import type { ScreenQuery } from "./merchandising-screen-query";
import {
  screenSalesFilter,
  totalsSql,
  salesAggregateMetric,
  type AggregateRow,
} from "./merchandising-screen-sales";
import {
  screenStockFilter,
  screenStockJoin,
  stockStatsSql,
  stockGroupValues,
  type StockGroup,
} from "./merchandising-screen-stock";
import { financialDecimal as D } from "./merchandising-policy";
import {
  finalizeSalesTotals,
  type SalesTotalsInput,
  type salesPlan,
} from "./sales-metrics";

const headline = Prisma.sql`f.kind<>'PREORDER' AND f."productKind" IN ('MERCHANDISE','SERVICE')`;
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

/** One frozen financial subset supplies the O1 contributors and full-month LY outlier notes. */
async function overviewSales(
  tenantId: string,
  snapshot: ScreenSnapshot,
  q: ScreenQuery,
  tx: SqlClient,
) {
  const where = screenSalesFilter(tenantId, q);
  const brands = await tx.$queryRaw<AggregateRow[]>(Prisma.sql`
    SELECT f."brandId" id,MIN(COALESCE(f."brandName",'Unassigned brand')) name,f.currency,
    ${totalsSql(Prisma.sql`f."inCurrent"`)} "current",${totalsSql(Prisma.sql`f."inPriorYear"`)} ly
    FROM "MerchandisingScreenFact" f WHERE ${where} AND ${headline} GROUP BY f."brandId",f.currency ORDER BY f.currency NULLS LAST,f."brandId" NULLS LAST`);
  const metrics = brands.map((b) => ({
    ...salesAggregateMetric(b, snapshot),
    id: b.id,
  }));
  const period = snapshot.sales.context.period;
  const fullLyTo = Temporal.PlainDate.from(period.lyTo);
  const oneOffs =
    snapshot.sales.context.oneOffHistory && snapshot.trend
      ? await tx.$queryRaw<
          Array<{ brandId: string | null; currency: string | null }>
        >(Prisma.sql`
    WITH lines AS (SELECT f.* FROM "MerchandisingScreenFact" f WHERE ${screenSalesFilter(tenantId, q, true)} AND ${headline}
      AND f."businessDate">=${period.lyFrom.slice(0, 7) + "-01"}::date AND f."businessDate"<=${fullLyTo.with({ day: fullLyTo.daysInMonth }).toString()}::date),
    months AS (SELECT "brandId",currency,date_trunc('month',"businessDate") "month",sum(revenue) revenue,count(*) FILTER(WHERE revenue IS NULL) missing FROM lines GROUP BY 1,2,3),
    orders AS (SELECT "brandId",currency,date_trunc('month',"businessDate") "month","sourceId","orderId",sum(revenue) revenue FROM lines WHERE kind='SALE' GROUP BY 1,2,3,4,5)
    SELECT DISTINCT o."brandId",o.currency FROM orders o JOIN months m ON o."brandId" IS NOT DISTINCT FROM m."brandId" AND o.currency IS NOT DISTINCT FROM m.currency AND o."month"=m."month"
    WHERE m.missing=0 AND m.revenue>0 AND o.revenue>m.revenue*0.5`)
      : [];
  return metrics.map((b) => ({
    ...b,
    oneOffLy: oneOffs.some(
      (o) => o.brandId === b.id && o.currency === b.currency,
    ),
  }));
}

/** YTD and same-date LY bars use supporting facts, never zero-fill unproven history. */
async function overviewTrend(
  tenantId: string,
  snapshot: ScreenSnapshot,
  q: ScreenQuery,
  tx: SqlClient,
) {
  if (!snapshot.trend) return null;
  const context = snapshot.trend.context,
    period = context.period;
  const monthly = await tx.$queryRaw<
    Array<{
      month: number;
      currency: string | null;
      current: SalesTotalsInput;
      ly: SalesTotalsInput;
    }>
  >(Prisma.sql`
    SELECT EXTRACT(MONTH FROM f."businessDate")::int "month",f.currency,
    ${totalsSql(Prisma.sql`f."businessDate" BETWEEN ${period.from}::date AND ${period.to}::date`)} "current",
    ${totalsSql(Prisma.sql`f."businessDate" BETWEEN ${period.lyFrom}::date AND ${period.lyTo}::date`)} ly
    FROM "MerchandisingScreenFact" f WHERE ${screenSalesFilter(tenantId, q, true)} AND ${headline}
    AND (f."businessDate" BETWEEN ${period.from}::date AND ${period.to}::date OR f."businessDate" BETWEEN ${period.lyFrom}::date AND ${period.lyTo}::date)
    GROUP BY 1,2 ORDER BY 1,2`);
  return { period, history: context.history, monthly };
}

/** Group saved daily metrics in SQL and reuse the stock finalizer for every Overview subtotal. */
async function overviewStock(
  tenantId: string,
  snapshot: ScreenSnapshot,
  q: ScreenQuery,
  tx: SqlClient,
) {
  const where = screenStockFilter(tenantId, q, "overview"),
    stats = stockStatsSql();
  const statuses = await tx.$queryRaw<
    Array<StockGroup & { minWoh: string | null; maxWoh: string | null }>
  >(Prisma.sql`
    SELECT d.classification id,d.classification name,d.currency,${stats} stats,NULL::jsonb details,
      min((d.metrics->>'weeksOnHand')::numeric)::text "minWoh",max((d.metrics->>'weeksOnHand')::numeric)::text "maxWoh"
    FROM ${screenStockJoin} WHERE ${where} GROUP BY d.classification,d.currency ORDER BY d.classification,d.currency NULLS LAST`);
  const ownership = await tx.$queryRaw<
    Array<StockGroup & { unknownBrands: number }>
  >(Prisma.sql`
    SELECT d.metrics->>'ownership' id,d.metrics->>'ownership' name,d.currency,${stats} stats,NULL::jsonb details,
    count(DISTINCT COALESCE(d.metrics->>'brandId','__unassigned__')) FILTER(WHERE d.metrics->>'productKind'='MERCHANDISE' AND d.metrics->>'ownership'='UNKNOWN' AND d.quantity>0)::int "unknownBrands"
    FROM ${screenStockJoin} WHERE ${where} GROUP BY 1,3 ORDER BY 1,3 NULLS LAST`);
  const bottlenecks = await tx.$queryRaw<
    Array<StockGroup & { deadCost: string; receiptDate: string | null }>
  >(Prisma.sql`
    WITH brands AS (SELECT d.metrics->>'brandId' id,MIN(COALESCE(d.metrics->>'brandName','Unassigned brand')) name,d.currency,${stats} stats,NULL::jsonb details,
      COALESCE(sum((d.metrics->>'stockCostValue')::numeric) FILTER(WHERE d.classification='DEAD'),0) "deadCost",
      count(*) FILTER(WHERE d.classification='DEAD') dead,
      CASE WHEN count(*) FILTER(WHERE d.metrics->>'productKind'='MERCHANDISE' AND d.metrics->>'firstReceiptDate' IS NULL)>0 THEN NULL ELSE MIN(d.metrics->>'firstReceiptDate') END "receiptDate"
      FROM ${screenStockJoin} WHERE ${where} AND d.metrics->>'productKind'='MERCHANDISE' GROUP BY 1,3),
    ranked AS (SELECT *,row_number() OVER(PARTITION BY currency ORDER BY "deadCost" DESC,id ASC NULLS LAST) rank FROM brands WHERE dead>0 AND "deadCost">0)
    SELECT id,name,currency,stats,details,"deadCost"::text "deadCost","receiptDate" FROM ranked WHERE rank=1 ORDER BY currency NULLS LAST`);
  const norm = snapshot.sales.context.settings.turnoverMonths;
  return {
    statuses: statuses.map((r) => ({
      ...stockGroupValues(r, norm),
      status: r.id!,
      minWoh: r.minWoh,
      maxWoh: r.maxWoh,
    })),
    ownership: ownership.map((r) => ({
      ...stockGroupValues(r, norm),
      ownership: r.id ?? "UNKNOWN",
      unknownBrands: r.unknownBrands,
    })),
    bottlenecks: bottlenecks.map((r) => ({
      ...stockGroupValues(r, norm),
      brandId: r.id,
      name: r.name,
      deadStockCost: D(r.deadCost).toString(),
      firstReceiptDate: r.receiptDate,
    })),
  };
}
export interface RevenueContributor {
  id: string | null;
  name: string;
  delta: string | null;
  oneOffLy: boolean;
}
/** O1 names at most three contributors only at an absolute LY change of at least 5%. */
export function overviewContributors(
  change: string | null | undefined,
  brands: RevenueContributor[],
) {
  if (change == null || D(change).abs().lt("0.05")) return [];
  return brands
    .filter(
      (b) =>
        b.delta !== null &&
        (D(change).gt(0) ? D(b.delta).gt(0) : D(b.delta).lt(0)),
    )
    .sort(
      (a, b) =>
        D(b.delta!).abs().cmp(D(a.delta!).abs()) ||
        (a.id ?? "").localeCompare(b.id ?? ""),
    )
    .slice(0, 3)
    .map((b) => ({ ...b, delta: b.delta! }));
}
export type OverviewSalesSummary = ReturnType<typeof salesAggregateMetric> & {
  plan: ReturnType<typeof salesPlan> & { targetScope: string };
};
/** O1–O8 consume the same pinned KPI inputs; all monetary/threshold decisions stay server-side. */
export async function readOverview(
  tenantId: string,
  snapshot: ScreenSnapshot,
  q: ScreenQuery,
  summaries: OverviewSalesSummary[],
  tx: SqlClient,
) {
  const [brands, trend, stock] = await Promise.all([
    overviewSales(tenantId, snapshot, q, tx),
    overviewTrend(tenantId, snapshot, q, tx),
    overviewStock(tenantId, snapshot, q, tx),
  ]);
  const currencies = [
    ...new Set([
      ...summaries.map((s) => s.currency),
      ...stock.statuses.map((s) => s.currency),
    ]),
  ].sort((a, b) => (a ?? "").localeCompare(b ?? ""));
  return {
    supportingDataAvailable: Boolean(snapshot.trend),
    trendUnavailableReason: snapshot.trendUnavailableReason ?? null,
    history: snapshot.sales.context.history,
    settings: {
      deadDays: snapshot.sales.context.settings.deadDays,
      riskWohWeeks: snapshot.sales.context.settings.riskWohWeeks,
      turnoverMonths: snapshot.sales.context.settings.turnoverMonths,
    },
    byCurrency: currencies.map((currency) => {
      const sale = summaries.find((s) => s.currency === currency) ?? null;
      const change = sale?.revenueChangePct;
      const contributors = overviewContributors(
        change,
        brands
          .filter((b) => b.currency === currency)
          .map((b) => ({
            id: b.id,
            name: b.name,
            delta: b.revenueDelta,
            oneOffLy: b.oneOffLy,
          })),
      );
      const statuses = stock.statuses.filter((s) => s.currency === currency);
      const dead = statuses.find((s) => s.status === "DEAD");
      const completeCost = statuses.every(
        (s) =>
          !s.missingCostSkuCount &&
          !(s.status === "DATA_ERROR" && s.skuCount > s.physicalSkuCount),
      );
      const totalCost = statuses.reduce(
        (a, s) => a.add(s.coveredStockCost),
        D(0),
      );
      const bottleneck =
        (dead?.missingCostSkuCount ?? 0) === 0
          ? (stock.bottlenecks.find((s) => s.currency === currency) ?? null)
          : null;
      const score = sale?.plan.pacePct;
      return {
        currency,
        contributors,
        changeTone:
          change == null || D(change).isZero()
            ? "UNAVAILABLE"
            : D(change).gt(0)
              ? "GREEN"
              : "RED",
        planTone:
          score == null
            ? "UNAVAILABLE"
            : D(score).gte(1)
              ? "GREEN"
              : D(score).gte("0.8")
                ? "AMBER"
                : "RED",
        statuses: statuses.map((s) => ({
          ...s,
          share:
            completeCost && totalCost.gt(0) && s.stockCost !== null
              ? D(s.stockCost).div(totalCost).toString()
              : null,
        })),
        deadShare:
          completeCost && totalCost.gt(0)
            ? D(dead?.stockCost ?? 0)
                .div(totalCost)
                .toString()
            : null,
        ownership: stock.ownership.filter((s) => s.currency === currency),
        bottleneck,
        trendHistory: trend?.history ?? null,
        trend: trend
          ? Array.from(
              { length: Number(trend.period.to.slice(5, 7)) },
              (_, i) => {
                const row = trend.monthly.find(
                  (r) => r.month === i + 1 && r.currency === currency,
                );
                return {
                  month: `${trend.period.to.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`,
                  current: finalizeSalesTotals(
                    row?.current ?? zero,
                    currency,
                    trend.history.current,
                  ),
                  ly: finalizeSalesTotals(
                    row?.ly ?? zero,
                    currency,
                    trend.history.ly,
                  ),
                };
              },
            )
          : null,
      };
    }),
  };
}
export type OverviewModel = Awaited<ReturnType<typeof readOverview>>;
