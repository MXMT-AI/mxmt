import "server-only";
import { Prisma } from "@prisma/client";
import { Temporal } from "@js-temporal/polyfill";
import type { SqlClient } from "./connectors/database";
import type { ScreenSnapshot } from "./merchandising-snapshot";
import type { ScreenQuery, ScreenGroup } from "./merchandising-screen-query";
import {
  screenSalesFilter,
  totalsSql,
  type readScreenSales,
} from "./merchandising-screen-sales";
import { readSalesComparisons } from "./merchandising-overview";
import {
  finalizeSalesTotals,
  type SalesMetricRow,
  type SalesTotalsInput,
} from "./sales-metrics";
import { financialDecimal as D } from "./merchandising-policy";
import { dataTablePagination } from "./data-table-api";

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
export type SalesDisplayMetric =
  | "revenue"
  | "coveredGrossProfit"
  | "gmPct"
  | "units";
export interface SalesCell {
  value: string | null;
  partial: boolean;
  alpha: number | null;
  tone: "GREEN" | "RED" | "NEUTRAL";
}
interface RawRow {
  id: string | null;
  name: string;
  currency: string | null;
  kind: "GROUP" | "OTHERS" | "TOTAL" | "EXTRA";
  stats: SalesTotalsInput;
  rank: number;
  groupCount: number;
  month?: string;
}

/** One finalizer governs zero/unknown/covered margin for table cells and chart values. */
function cell(
  input: SalesTotalsInput,
  metric: SalesDisplayMetric,
  currency: string | null,
  history: boolean,
): SalesCell {
  const totals = finalizeSalesTotals(input, currency, history);
  const partial =
    !history ||
    (metric === "units"
      ? false
      : metric === "revenue"
        ? input.missingRevenueCount > 0
        : input.missingProfitCount > 0 || input.missingRevenueCount > 0);
  const value =
    metric === "units" && !history && !input.lineCount ? null : totals[metric];
  return {
    value,
    partial,
    alpha: null,
    tone:
      value === null
        ? "NEUTRAL"
        : metric === "gmPct"
          ? D(value).gte("0.5")
            ? "GREEN"
            : D(value).lt("0.4")
              ? "RED"
              : "NEUTRAL"
          : D(value).lt(0)
            ? "RED"
            : "NEUTRAL",
  };
}
/** Total and ranked LY rows share exact delta/null/coverage semantics. */
function comparisonValues(
  row: Pick<
    SalesMetricRow,
    "current" | "ly" | "unitsDelta" | "revenueDelta" | "revenueChangePct"
  >,
  units: boolean,
  history: { current: boolean; ly: boolean },
) {
  const delta = units ? row.unitsDelta : row.revenueDelta;
  return {
    current:
      units && !history.current && !row.current.lineCount
        ? null
        : units
          ? row.current.units
          : row.current.revenue,
    ly: !history.ly ? null : units ? row.ly.units : row.ly.revenue,
    delta,
    changePct: units
      ? delta !== null && D(row.ly.units).gt(0)
        ? D(delta).div(row.ly.units).toString()
        : null
      : row.revenueChangePct,
    currentPartial:
      !history.current || (!units && row.current.missingRevenueCount > 0),
    lyPartial: !history.ly || (!units && row.ly.missingRevenueCount > 0),
    tone:
      delta === null || D(delta).isZero()
        ? "NEUTRAL"
        : D(delta).gt(0)
          ? "GREEN"
          : "RED",
  };
}
/** SQL ranks/paginates groups before serializing monthly Top N, Others and Total buckets. */
async function pivot(
  tenantId: string,
  snapshot: ScreenSnapshot,
  q: ScreenQuery,
  db: SqlClient,
  options: {
    group: ScreenGroup;
    top: number;
    metric: SalesDisplayMetric;
    from: string;
    to: string;
    history: boolean;
    supporting: boolean;
    paged?: boolean;
    page?: number;
    monthly?: boolean;
    extras?: boolean;
  },
) {
  const { group, top, metric, from, to, history, supporting } = options;
  const key = Prisma.raw(`f."${group}Id"`),
    label =
      group === "sku"
        ? Prisma.sql`COALESCE(f.name,f.sku,'Unassigned SKU')`
        : Prisma.raw(`COALESCE(f."${group}Name",'Unassigned ${group}')`);
  const where = Prisma.sql`${screenSalesFilter(tenantId, q, supporting)} AND ${headline} AND f."businessDate" BETWEEN ${from}::date AND ${to}::date`;
  const offset = ((options.page ?? q.page) - 1) * q.pageSize;
  const ranked = Prisma.sql`ranked AS (SELECT ${key} id,MIN(${label}) name,f.currency,row_number() OVER(PARTITION BY f.currency ORDER BY sum(f.revenue) DESC NULLS LAST,${key} ASC NULLS LAST)::int rank FROM "MerchandisingScreenFact" f WHERE ${where} GROUP BY ${key},f.currency)`;
  const join = Prisma.sql`"MerchandisingScreenFact" f JOIN ranked g ON ${key} IS NOT DISTINCT FROM g.id AND f.currency IS NOT DISTINCT FROM g.currency`;
  const wanted = options.paged
    ? Prisma.sql`g.rank>${offset} AND g.rank<=${offset + q.pageSize}`
    : Prisma.sql`g.rank<=${top}`;
  const extra = options.extras
    ? Prisma.sql`g.rank>${top + offset} AND g.rank<=${top + offset + q.pageSize}`
    : Prisma.sql`false`;
  const stats = totalsSql(Prisma.sql`true`);
  const raw = await db.$queryRaw<RawRow[]>(Prisma.sql`WITH ${ranked}
    SELECT g.id,g.name,f.currency,CASE WHEN ${wanted} THEN 'GROUP' ELSE 'EXTRA' END kind,${stats} stats,g.rank,1::int "groupCount" FROM ${join} WHERE ${where} AND (${wanted} OR ${extra}) GROUP BY g.id,g.name,f.currency,g.rank
    UNION ALL SELECT NULL,'Total',f.currency,'TOTAL',${stats},0,count(DISTINCT jsonb_build_array(${key}))::int FROM "MerchandisingScreenFact" f WHERE ${where} GROUP BY f.currency
    UNION ALL SELECT NULL,'Others',f.currency,'OTHERS',${stats},0,count(DISTINCT jsonb_build_array(${key}))::int FROM ${join} WHERE ${where} AND ${!options.paged} AND g.rank>${top} GROUP BY f.currency`);
  const monthly =
    options.monthly === false
      ? []
      : await db.$queryRaw<RawRow[]>(Prisma.sql`WITH ${ranked}
    SELECT CASE WHEN ${wanted} THEN g.id ELSE NULL END id,'' name,f.currency,CASE WHEN ${wanted} THEN 'GROUP' ELSE 'OTHERS' END kind,${stats} stats,0 rank,0 "groupCount",to_char(f."businessDate",'YYYY-MM') "month" FROM ${join} WHERE ${where} AND (${options.paged ? wanted : Prisma.sql`true`}) GROUP BY 1,3,4,8
    UNION ALL SELECT NULL,'',f.currency,'TOTAL',${stats},0,0,to_char(f."businessDate",'YYYY-MM') FROM "MerchandisingScreenFact" f WHERE ${where} GROUP BY f.currency,to_char(f."businessDate",'YYYY-MM')
    UNION ALL SELECT g.id,'',f.currency,'EXTRA',${stats},0,0,to_char(f."businessDate",'YYYY-MM') FROM ${join} WHERE ${where} AND ${extra} GROUP BY g.id,f.currency,to_char(f."businessDate",'YYYY-MM')`);
  const months: string[] = [];
  for (
    let date = Temporal.PlainDate.from(from).with({ day: 1 });
    date.toString().slice(0, 7) <= to.slice(0, 7);
    date = date.add({ months: 1 })
  )
    months.push(date.toString().slice(0, 7));
  const grouped = new Map<string, RawRow[]>();
  for (const row of monthly) {
    const key = JSON.stringify([row.currency, row.kind, row.id]);
    const rows = grouped.get(key) ?? [];
    rows.push(row);
    grouped.set(key, rows);
  }
  return {
    group,
    metric,
    period: { from, to },
    months,
    rows: raw.map((r) => ({
      id: r.id,
      name: r.name,
      currency: r.currency,
      kind: r.kind,
      rank: r.rank,
      groupCount: r.groupCount,
      total: cell(r.stats, metric, r.currency, history),
      cells: months.map((month) => ({
        month,
        ...cell(
          grouped
            .get(JSON.stringify([r.currency, r.kind, r.id]))
            ?.find((m) => m.month === month)?.stats ?? zero,
          metric,
          r.currency,
          history,
        ),
      })),
    })),
  };
}

/** S1–S4 are read-only projections of the same immutable period and supporting contexts. */
export async function readSalesWorkspace(
  tenantId: string,
  snapshot: ScreenSnapshot,
  q: ScreenQuery,
  tx: SqlClient,
  summary: Awaited<ReturnType<typeof readScreenSales>>["summary"],
) {
  const group =
    snapshot.sales.context.settings.profileMode === "MONOBRAND" &&
    q.groupBy === "brand"
      ? "category"
      : q.groupBy;
  const metric: SalesDisplayMetric =
    q.measure === "units" ? "units" : (q.metric ?? "revenue");
  const context = snapshot.trend?.context ?? snapshot.sales.context,
    range = context.period;
  const dated = snapshot.modelVersion >= 2;
  const [matrix, categories, channels, comparisons] = await Promise.all([
    dated
      ? pivot(tenantId, snapshot, q, tx, {
          group,
          top: 11,
          metric,
          from: range.from,
          to: range.to,
          history: context.history.current,
          supporting: Boolean(snapshot.trend),
          paged: group === "sku",
          extras: Boolean(q.others) && group !== "sku",
        })
      : Promise.resolve(null),
    dated
      ? pivot(tenantId, snapshot, q, tx, {
          group: "category",
          top: 4,
          metric: q.measure === "units" ? "units" : "revenue",
          from: range.from,
          to: range.to,
          history: context.history.current,
          supporting: Boolean(snapshot.trend),
        })
      : Promise.resolve(null),
    dated
      ? pivot(tenantId, snapshot, q, tx, {
          group: "channel",
          top: 0,
          metric: "revenue",
          from: snapshot.sales.context.period.from,
          to: snapshot.sales.context.period.to,
          history: snapshot.sales.context.history.current,
          supporting: false,
          paged: true,
          page: q.channelPage ?? 1,
          monthly: false,
        })
      : Promise.resolve(null),
    readSalesComparisons(tenantId, snapshot, q, tx, group),
  ]);
  const currencies = [
    ...new Set([
      ...(q.currency !== undefined
        ? [q.currency === "__unassigned__" ? null : q.currency]
        : []),
      ...snapshot.sales.currencies,
      ...(matrix?.rows ?? []).map((r) => r.currency),
      ...comparisons.map((r) => r.currency),
    ]),
  ]
    .filter(
      (c) =>
        q.currency === undefined ||
        c === (q.currency === "__unassigned__" ? null : q.currency),
    )
    .sort((a, b) => (a ?? "").localeCompare(b ?? ""));
  return {
    monobrand: snapshot.sales.context.settings.profileMode === "MONOBRAND",
    groupBy: group,
    measure: q.measure ?? "money",
    metric,
    history: snapshot.sales.context.history,
    period: snapshot.sales.context.period,
    tablePeriod: { from: range.from, to: range.to },
    yearHistoryAvailable: Boolean(snapshot.trend),
    trendUnavailableReason: snapshot.trendUnavailableReason ?? null,
    monthlyAvailable: dated,
    oneOffAvailable: Boolean(
      snapshot.trend && snapshot.sales.context.oneOffHistory,
    ),
    byCurrency: currencies.map((currency) => {
      const rows = (matrix?.rows ?? [])
        .filter((r) => r.currency === currency)
        .sort((a, b) =>
          a.kind === "OTHERS" ? 1 : b.kind === "OTHERS" ? -1 : a.rank - b.rank,
        );
      const total = rows.find((r) => r.kind === "TOTAL");
      const values = rows
        .flatMap((r) => [r.total, ...r.cells])
        .filter((c) => c.value !== null);
      const max = values.reduce(
        (a, c) => (D(c.value!).abs().gt(a) ? D(c.value!).abs() : a),
        D(0),
      );
      for (const value of values)
        value.alpha =
          metric === "gmPct"
            ? value.tone === "NEUTRAL"
              ? null
              : 0.16
            : D("0.04")
                .add(max.gt(0) ? D(value.value!).abs().div(max).mul("0.34") : 0)
                .toNumber();
      const channelRows = (channels?.rows ?? []).filter(
          (r) => r.currency === currency,
        ),
        channelTotal = channelRows.find((r) => r.kind === "TOTAL");
      const selected = summary.find((s) => s.currency === currency);
      const comparisonTotal = selected
        ? comparisonValues(
            selected,
            q.measure === "units",
            snapshot.sales.context.history,
          )
        : null;
      const compare = comparisons
        .filter((r) => r.currency === currency)
        .map((r) => ({
          id: r.id,
          name: r.name,
          ...comparisonValues(
            r,
            q.measure === "units",
            snapshot.sales.context.history,
          ),
          oneOffLy: r.oneOffLy,
        }));
      const signed = (sign: number, limit: number) =>
        compare
          .filter(
            (r) =>
              r.delta !== null &&
              (sign > 0 ? D(r.delta).gt(0) : D(r.delta).lt(0)),
          )
          .sort(
            (a, b) =>
              D(b.delta!).abs().cmp(D(a.delta!).abs()) ||
              (a.id ?? "").localeCompare(b.id ?? ""),
          )
          .slice(0, limit);
      return {
        currency,
        matrix: {
          rows: rows.filter((r) => r.kind === "GROUP" || r.kind === "OTHERS"),
          total: total ?? null,
          pagination: dataTablePagination(
            q.page,
            q.pageSize,
            group === "sku"
              ? (total?.groupCount ?? 0)
              : Math.max(0, (total?.groupCount ?? 0) - 11),
          ),
          otherRows: rows.filter((r) => r.kind === "EXTRA"),
        },
        categories: (categories?.rows ?? []).filter(
          (r) => r.currency === currency,
        ),
        channels: {
          rows: channelRows
            .filter((r) => r.kind === "GROUP")
            .sort((a, b) => a.rank - b.rank)
            .map((r) => ({
              ...r,
              share:
                channelTotal?.total.value != null &&
                !channelTotal.total.partial &&
                D(channelTotal.total.value).gt(0) &&
                r.total.value !== null &&
                !r.total.partial
                  ? D(r.total.value).div(channelTotal.total.value).toString()
                  : null,
            })),
          pagination: dataTablePagination(
            q.channelPage ?? 1,
            q.pageSize,
            channelTotal?.groupCount ?? 0,
          ),
        },
        comparison: {
          total: comparisonTotal,
          rows: [...signed(-1, 6), ...signed(1, 3)],
          available:
            snapshot.sales.context.history.current &&
            snapshot.sales.context.history.ly &&
            (q.measure === "units" ||
              Boolean(
                selected &&
                  !selected.current.missingRevenueCount &&
                  !selected.ly.missingRevenueCount,
              )),
        },
      };
    }),
  };
}
export type SalesWorkspaceModel = Awaited<
  ReturnType<typeof readSalesWorkspace>
>;
