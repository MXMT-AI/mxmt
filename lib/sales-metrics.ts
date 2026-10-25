import { Prisma } from "@prisma/client";
import { Temporal } from "@js-temporal/polyfill";
import { financialDecimal, grossProfitForPolicy } from "./merchandising-policy";
import type {
  Ownership,
  ClientMerchandisingSettings,
} from "./merchandising-settings";
import type { SalesPeriod } from "./sales-period";
export const SALES_CALCULATION_VERSION = 1;
export interface SalesFact {
  id: string;
  sourceId: string;
  orderId: string;
  skuId: string | null;
  sku: string | null;
  name: string | null;
  brandId: string | null;
  brand: string | null;
  categoryId: string | null;
  category: string | null;
  channelId: string | null;
  channel: string | null;
  productKind: "MERCHANDISE" | "SERVICE" | "GIFT_CARD" | "UNKNOWN";
  ownership: Ownership;
  commissionRate: string | null;
  kind: string;
  statusId: number | null;
  date: string | null;
  paidDate: string | null;
  revenue: string | null;
  cost: string | null;
  quantity: string | null;
  currency: string | null;
  excluded: boolean;
  stale: boolean;
  dateInferred: boolean;
  projectMappingUnavailable: boolean;
}
export interface SalesMetricContext {
  oneOffHistory?: boolean;
  period: SalesPeriod;
  history: { current: boolean; ly: boolean };
  settings: ClientMerchandisingSettings;
}
export interface FinancialTotals {
  currency: string | null;
  revenue: string | null;
  units: string;
  orderCount: number;
  returnOrderCount: number;
  coveredRevenue: string;
  coveredGrossProfit: string | null;
  gmPct: string | null;
  lineCount: number;
  missingRevenueCount: number;
  missingProfitCount: number;
  coverage: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
}
export interface SalesMetricRow {
  revenueDelta: string | null;
  unitsDelta: string | null;
  coveredMarginBelowTarget: boolean | null;
  marginTargetPct: string;
  id: string;
  name: string;
  currency: string | null;
  current: FinancialTotals;
  ly: FinancialTotals;
  revenueChangePct: string | null;
  comparisonReason: string | null;
}
export interface FinancialIssue {
  code: string;
  count: number;
  examples: string[];
}
const D = financialDecimal;
function profitable(f: SalesFact) {
  if (f.productKind !== "MERCHANDISE") return null;
  return f.revenue === null ? null : grossProfitForPolicy(f, f.revenue, f.cost);
}
export function salesFactDate(f: SalesFact) {
  return f.kind === "PREORDER" ? f.paidDate : f.date;
}
/** Keep unknown-type and gift-card movements visible, outside the merchandise/service headline. */
export function isHeadlineFact(f: SalesFact) {
  return f.productKind === "MERCHANDISE" || f.productKind === "SERVICE";
}
export function isEligibleSalesFact(f: SalesFact) {
  return (
    !f.excluded &&
    !f.stale &&
    !f.projectMappingUnavailable &&
    ["SALE", "RETURN", "CORRECTION"].includes(f.kind) &&
    f.date !== null
  );
}
export function inSalesPeriod(date: string | null, from: string, to: string) {
  return date !== null && date >= from && date <= to;
}
/** Decimal sums and distinct orders are calculated once per slice; covered GM uses its own denominator. */
export function aggregateSalesFacts(
  facts: SalesFact[],
  currency: string | null,
  historyCovered: boolean,
): FinancialTotals {
  let revenue = D(0),
    units = D(0),
    coveredRevenue = D(0),
    profit = D(0),
    missingRevenueCount = 0,
    missingProfitCount = 0,
    covered = 0;
  const orders = new Set<string>(),
    returns = new Set<string>();
  for (const f of facts) {
    if (f.revenue === null) missingRevenueCount++;
    else revenue = revenue.add(f.revenue);
    if (f.productKind === "MERCHANDISE" && f.quantity !== null)
      units = units.add(f.quantity);
    const key = JSON.stringify([f.sourceId, f.orderId]);
    if (f.kind === "RETURN") returns.add(key);
    else if (f.kind === "SALE") orders.add(key);
    const gp = profitable(f);
    if (gp === null) missingProfitCount++;
    else {
      profit = profit.add(gp);
      coveredRevenue = coveredRevenue.add(f.revenue!);
      covered++;
    }
  }
  const anyKnown = missingRevenueCount < facts.length || facts.length === 0;
  return {
    currency,
    revenue:
      anyKnown && (facts.length > 0 || historyCovered)
        ? revenue.toString()
        : null,
    units: units.toString(),
    orderCount: orders.size,
    returnOrderCount: returns.size,
    coveredRevenue: coveredRevenue.toString(),
    coveredGrossProfit: covered
      ? profit.toString()
      : facts.length === 0 && historyCovered
        ? "0"
        : null,
    gmPct:
      covered && !coveredRevenue.isZero()
        ? profit.div(coveredRevenue).toString()
        : null,
    lineCount: facts.length,
    missingRevenueCount,
    missingProfitCount,
    coverage:
      !historyCovered || missingRevenueCount || missingProfitCount
        ? covered || (anyKnown && facts.length)
          ? "PARTIAL"
          : "UNAVAILABLE"
        : "COMPLETE",
  };
}
export function salesMetricRow(
  id: string,
  name: string,
  currency: string | null,
  facts: SalesFact[],
  context: SalesMetricContext,
): SalesMetricRow {
  const p = context.period;
  const current = aggregateSalesFacts(
    facts.filter((f) => inSalesPeriod(f.date, p.from, p.to)),
    currency,
    context.history.current,
  );
  const ly = aggregateSalesFacts(
    facts.filter((f) => inSalesPeriod(f.date, p.lyFrom, p.lyTo)),
    currency,
    context.history.ly,
  );
  const reason =
    !context.history.current || !context.history.ly
      ? "INSUFFICIENT_HISTORY"
      : current.missingRevenueCount || ly.missingRevenueCount
        ? "MISSING_REVENUE"
        : ly.revenue === null || D(ly.revenue).lte(0)
          ? "LY_NON_POSITIVE"
          : null;
  return {
    id,
    name,
    currency,
    current,
    ly,
    revenueChangePct:
      reason === null && current.revenue !== null
        ? D(current.revenue).div(ly.revenue!).sub(1).toString()
        : null,
    revenueDelta:
      context.history.current &&
      context.history.ly &&
      !current.missingRevenueCount &&
      !ly.missingRevenueCount &&
      current.revenue !== null &&
      ly.revenue !== null
        ? D(current.revenue).sub(ly.revenue).toString()
        : null,
    unitsDelta:
      context.history.current && context.history.ly
        ? D(current.units).sub(ly.units).toString()
        : null,
    marginTargetPct: D(context.settings.minMarginPct).div(100).toString(),
    coveredMarginBelowTarget:
      current.gmPct === null
        ? null
        : D(current.gmPct).lt(D(context.settings.minMarginPct).div(100)),
    comparisonReason: reason,
  };
}
/** Client targets span whole months; pace uses the selected calendar-day fraction of each target. */
export function salesPlan(
  context: SalesMetricContext,
  currency: string | null,
  revenue: string | null,
) {
  const { settings, period } = context;
  if (currency === null || currency !== settings.planCurrency)
    return {
      target: null,
      expected: null,
      attainmentPct: null,
      pacePct: null,
      reason: "PLAN_CURRENCY_UNAVAILABLE",
    };
  let day = Temporal.PlainDate.from(period.from),
    target = D(0),
    expected = D(0);
  const end = Temporal.PlainDate.from(period.to);
  while (Temporal.PlainDate.compare(day, end) <= 0) {
    const month = day.toString().slice(0, 7),
      amount = settings.monthlyPlans[month];
    if (amount === undefined)
      return {
        target: null,
        expected: null,
        attainmentPct: null,
        pacePct: null,
        reason: "PLAN_UNSET",
      };
    const last = day.with({ day: day.daysInMonth }),
      sliceEnd = Temporal.PlainDate.compare(last, end) < 0 ? last : end,
      days = day.until(sliceEnd).days + 1;
    target = target.add(amount);
    expected = expected.add(D(amount).mul(days).div(day.daysInMonth));
    day = sliceEnd.add({ days: 1 });
  }
  return {
    target: target.toString(),
    expected: expected.toString(),
    attainmentPct:
      context.history.current && revenue !== null && target.gt(0)
        ? D(revenue).div(target).toString()
        : null,
    pacePct:
      context.history.current && revenue !== null && expected.gt(0)
        ? D(revenue).div(expected).toString()
        : null,
    reason: !context.history.current
      ? "INSUFFICIENT_HISTORY"
      : target.isZero()
        ? "PLAN_ZERO"
        : null,
  };
}
export function salesIssues(facts: SalesFact[]): FinancialIssue[] {
  const issues = new Map<string, { count: number; examples: string[] }>();
  for (const f of facts) {
    const codes: string[] = [];
    if (f.excluded) continue;
    if (f.stale) codes.push("NORMALIZATION_REPLAY_REQUIRED");
    if (f.projectMappingUnavailable) codes.push("PROJECT_MAPPING_UNVERIFIED");
    if (["SALE", "RETURN", "CORRECTION"].includes(f.kind) && f.date === null)
      codes.push(
        f.kind === "RETURN"
          ? "RETURN_DATE_UNAVAILABLE"
          : "PAYMENT_DATE_UNAVAILABLE",
      );
    if (f.kind === "PREORDER" && f.paidDate !== null && f.revenue === null)
      codes.push("PREORDER_AMOUNT_UNAVAILABLE");
    if (f.dateInferred) codes.push("INFERRED_PAYMENT_DATE");
    if (f.productKind === "UNKNOWN") codes.push("PRODUCT_KIND_UNVERIFIED");
    if (isEligibleSalesFact(f) && isHeadlineFact(f)) {
      if (f.currency === null) codes.push("CURRENCY_UNVERIFIED");
      if (f.revenue === null) codes.push("REVENUE_UNAVAILABLE");
      if (f.productKind === "SERVICE") codes.push("SERVICE_PROFIT_UNVERIFIED");
      else if (f.ownership === "UNKNOWN") codes.push("OWNERSHIP_UNVERIFIED");
      else if (f.ownership === "OWN" && (f.cost === null || D(f.cost).isZero()))
        codes.push("MISSING_COST");
      else if (f.ownership === "CONSIGNMENT" && f.commissionRate === null)
        codes.push("COMMISSION_UNVERIFIED");
    }
    for (const code of codes) {
      const issue = issues.get(code) ?? { count: 0, examples: [] };
      issue.count++;
      if (issue.examples.length < 5) issue.examples.push(f.id);
      issues.set(code, issue);
    }
  }
  return [...issues]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([code, v]) => ({ code, ...v }));
}
