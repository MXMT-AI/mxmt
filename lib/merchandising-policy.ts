import { reorderQuantity } from "./reorder-quantity";
import { Prisma } from "@prisma/client";
import { financialDecimal } from "./financial-decimal.mjs";
export { financialDecimal } from "./financial-decimal.mjs";
import {
  defaultClientSettings,
  type ClientMerchandisingSettings,
  type Ownership,
} from "./merchandising-settings";
export interface PolicyInputs {
  ownershipOverride?: Ownership | null;
  commissionRateOverride?: string | null;
  brandOwnership?: Ownership | null;
  brandCommissionRate?: string | null;
  supplierId?: string | null;
  leadDays?: number | null;
  coverDays?: number | null;
  moq?: number | null;
  seasonMonths?: number[] | null;
  supplierTermsVerified?: boolean;
}
export function resolveMerchandisingPolicy(
  input: PolicyInputs,
  client: ClientMerchandisingSettings = defaultClientSettings(),
) {
  const ownership =
    input.ownershipOverride ?? input.brandOwnership ?? "UNKNOWN";
  return {
    ownership,
    commissionRate:
      ownership === "CONSIGNMENT"
        ? (input.commissionRateOverride ??
          (input.brandOwnership === "CONSIGNMENT"
            ? (input.brandCommissionRate ?? null)
            : null))
        : null,
    supplierId: input.supplierId ?? null,
    leadDays:
      input.supplierTermsVerified === false
        ? client.leadDays
        : (input.leadDays ?? client.leadDays),
    coverDays:
      input.supplierTermsVerified === false
        ? client.coverDays
        : (input.coverDays ?? client.coverDays),
    moq:
      input.supplierTermsVerified === false
        ? client.moq
        : (input.moq ?? client.moq),
    supplierTermsVerified: Boolean(input.supplierTermsVerified),
    seasonMonths: input.seasonMonths ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    supplierTermsSource:
      input.supplierTermsVerified === false ||
      input.leadDays == null ||
      input.coverDays == null ||
      input.moq == null
        ? "CLIENT_DEFAULT"
        : "SUPPLIER",
    minMarginPct: client.minMarginPct,
    turnoverMonths: client.turnoverMonths,
    deadDays: client.deadDays,
    healthyWohWeeks: client.healthyWohWeeks,
    riskWohWeeks: client.riskWohWeeks,
    newProductWeeks: client.newProductWeeks,
  };
}
export function grossProfitForPolicy(
  policy: { ownership: Ownership; commissionRate: string | null },
  revenue: string,
  cost: string | null,
): Prisma.Decimal | null {
  const amount = financialDecimal(revenue);
  if (
    policy.ownership === "OWN" &&
    cost !== null &&
    !financialDecimal(cost).isZero()
  )
    return amount.sub(cost);
  if (policy.ownership === "CONSIGNMENT" && policy.commissionRate !== null)
    return amount.mul(policy.commissionRate);
  return null;
}
export function previewMerchandisingCalculations(
  policy: ReturnType<typeof resolveMerchandisingPolicy>,
  input: {
    revenue: string;
    cost: string | null;
    weeklyVelocity: string;
    stock: string;
    inTransit: string | null;
    month: number;
  },
) {
  const revenue = financialDecimal(input.revenue);
  const profit = grossProfitForPolicy(policy, input.revenue, input.cost);
  const margin =
    profit !== null && !revenue.isZero() ? profit.div(revenue).mul(100) : null;
  const velocity = new Prisma.Decimal(input.weeklyVelocity),
    inSeason = policy.seasonMonths.includes(input.month);
  const order =
    !inSeason || velocity.isZero()
      ? financialDecimal(0)
      : reorderQuantity({
          weeklyVelocity: input.weeklyVelocity,
          leadDays: policy.leadDays,
          coverDays: policy.coverDays,
          stock: input.stock,
          inTransit: input.inTransit,
          moq: policy.moq,
        });
  return {
    grossProfit: profit?.toString() ?? null,
    marginPct: margin?.toString() ?? null,
    marginBelowTarget: margin === null ? null : margin.lt(policy.minMarginPct),
    orderQuantity: order?.toString() ?? null,
    inSeason,
    financialCoverage: profit === null ? "UNAVAILABLE" : "COVERED",
    reorderBlocked:
      input.inTransit === null
        ? "IN_TRANSIT_UNKNOWN"
        : policy.supplierId === null
          ? "SUPPLIER_UNKNOWN"
          : !policy.supplierTermsVerified
            ? "SUPPLIER_TERMS_UNVERIFIED"
            : null,
  };
}

export function evaluateMonthlyPlan(
  client: ClientMerchandisingSettings,
  month: string,
  revenue: string,
) {
  const amount = client.monthlyPlans[month] ?? null;
  return {
    month,
    amount,
    currency: client.planCurrency,
    attainmentPct:
      amount !== null && client.planCurrency && new Prisma.Decimal(amount).gt(0)
        ? new Prisma.Decimal(revenue).div(amount).mul(100).toString()
        : null,
  };
}
