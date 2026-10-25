import { financialDecimal } from "./merchandising-policy";
import { Prisma } from "@prisma/client";
import { calculateSalesArticleRows } from "./article-report";
import { calculateSalesGroupedRows } from "./grouped-reports";
import { calculateSalesChannelRows } from "./channel-metrics";
import {
  SALES_CALCULATION_VERSION,
  salesMetricRow,
  salesPlan,
  salesIssues,
  isHeadlineFact,
  isEligibleSalesFact,
  inSalesPeriod,
  aggregateSalesFacts,
  type SalesFact,
  type SalesMetricContext,
} from "./sales-metrics";
/** One frozen result supplies summary, articles, grouped tables and channel totals. */
export function calculateSalesReport(
  facts: SalesFact[],
  context: SalesMetricContext,
) {
  const eligible = facts.filter(isEligibleSalesFact),
    headline = eligible.filter(isHeadlineFact);
  const currencies = [
    ...new Set(
      facts
        .filter(
          (f) =>
            ["SALE", "RETURN", "CORRECTION", "PREORDER"].includes(f.kind) &&
            !f.excluded,
        )
        .map((f) => f.currency),
    ),
  ].sort((a, b) => (a ?? "").localeCompare(b ?? ""));
  const summary = currencies.map((currency) => {
    const row = salesMetricRow(
      "total",
      "Total",
      currency,
      headline.filter((f) => f.currency === currency),
      context,
    );
    return { ...row, plan: salesPlan(context, currency, row.current.revenue) };
  });
  const components = ["MERCHANDISE", "SERVICE", "GIFT_CARD", "UNKNOWN"].flatMap(
    (kind) =>
      currencies.map((currency) =>
        salesMetricRow(
          kind,
          kind,
          currency,
          eligible.filter(
            (f) => f.productKind === kind && f.currency === currency,
          ),
          context,
        ),
      ),
  );
  const preorders = currencies.map((currency) => {
    const totals = aggregateSalesFacts(
      facts
        .filter(
          (f) =>
            f.kind === "PREORDER" &&
            !f.excluded &&
            !f.stale &&
            !f.projectMappingUnavailable &&
            f.currency === currency &&
            inSalesPeriod(f.paidDate, context.period.from, context.period.to),
        )
        .map((f) => ({ ...f, date: f.paidDate, kind: "SALE" })),
      currency,
      context.history.current,
    );
    return {
      currency,
      paidAmount: totals.revenue,
      units: totals.units,
      orderCount: totals.orderCount,
      lineCount: totals.lineCount,
      missingAmountCount: totals.missingRevenueCount,
      recognition: "NOT_RECOGNIZED_SALE" as const,
    };
  });
  const brands = calculateSalesGroupedRows(headline, "brand", context);
  // Reference O1/S4: identify LY outliers against each brand's full calendar month.
  const monthly = new Map<
    string,
    { revenue: Prisma.Decimal; missing: boolean }
  >();
  const orders = new Map<
    string,
    {
      sourceId: string;
      orderId: string;
      brandId: string;
      currency: string | null;
      month: string;
      period: "ly";
      revenue: Prisma.Decimal;
    }
  >();
  for (const f of headline) {
    const month = f.date?.slice(0, 7);
    if (
      !month ||
      month < context.period.lyFrom.slice(0, 7) ||
      month > context.period.lyTo.slice(0, 7)
    )
      continue;
    const brandId = f.brandId ?? "unbranded",
      key = JSON.stringify([brandId, f.currency, month]);
    const aggregate = monthly.get(key) ?? {
      revenue: financialDecimal(0),
      missing: false,
    };
    if (f.revenue === null) aggregate.missing = true;
    else aggregate.revenue = aggregate.revenue.add(f.revenue);
    monthly.set(key, aggregate);
    if (f.kind !== "SALE" || f.revenue === null) continue;
    const orderKey = JSON.stringify([key, f.sourceId, f.orderId]);
    const order = orders.get(orderKey) ?? {
      sourceId: f.sourceId,
      orderId: f.orderId,
      brandId,
      currency: f.currency,
      month,
      period: "ly" as const,
      revenue: financialDecimal(0),
    };
    order.revenue = order.revenue.add(f.revenue);
    orders.set(orderKey, order);
  }
  const oneOffHistory = context.oneOffHistory ?? context.history.ly;
  const oneOffOrders = [...orders.values()]
    .flatMap((o) => {
      const denominator = monthly.get(
        JSON.stringify([o.brandId, o.currency, o.month]),
      );
      if (
        !oneOffHistory ||
        !denominator ||
        denominator.missing ||
        denominator.revenue.lte(0) ||
        o.revenue.lte(denominator.revenue.mul("0.5"))
      )
        return [];
      return [
        {
          ...o,
          revenue: o.revenue.toString(),
          brandLyMonthRevenue: denominator.revenue.toString(),
          shareOfLy: o.revenue.div(denominator.revenue).toString(),
        },
      ];
    })
    .sort((a, b) =>
      JSON.stringify([
        a.month,
        a.sourceId,
        a.orderId,
        a.brandId,
        a.currency,
      ]).localeCompare(
        JSON.stringify([b.month, b.sourceId, b.orderId, b.brandId, b.currency]),
      ),
    );
  return {
    calculationVersion: SALES_CALCULATION_VERSION,
    period: context.period,
    history: context.history,
    summary,
    articles: calculateSalesArticleRows(headline, context),
    brands,
    categories: calculateSalesGroupedRows(headline, "category", context),
    channels: calculateSalesChannelRows(headline, context),
    components,
    preorders,
    oneOffOrders,
    oneOffHistory,
    issues: salesIssues(facts),
  };
}
export type SalesReport = ReturnType<typeof calculateSalesReport>;
