import { Temporal } from "@js-temporal/polyfill";
import { Prisma, type OrderLineKind } from "@prisma/client";
import type { OrderDto } from "./contract";

export interface OrderPolicy {
  statuses?: Record<string, OrderLineKind>;
  channels?: Record<string, string>;
  dates?: { saleOrderTimeFallback?: boolean; returnDateField?: string };
  /** Enable only after customer evidence verifies API price and discount semantics. */
  amounts?: { price: "gross_unit" | "net_unit"; absoluteDiscount: "line" | "unit"; currency: string; cost?: "unit" };
}
/** Parse source-local dates with explicit precision and reject ambiguous or invalid times. */
export function sourceDate(value: string | null, timezone: string): { date: Date | null; precision: "instant" | "date" | "unknown" } {
  if (!value) return { date: null, precision: "unknown" };
  try {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const local = dateOnly ? `${value}T00:00:00` : value.replace(" ", "T");
    const instant = /(?:Z|[+-]\d{2}:\d{2})$/.test(local)
      ? Temporal.Instant.from(local)
      : Temporal.ZonedDateTime.from(`${local}[${timezone}]`, { disambiguation: "reject", overflow: "reject" }).toInstant();
    return { date: new Date(instant.epochMilliseconds), precision: dateOnly ? "date" : "instant" };
  } catch { return { date: null, precision: "unknown" }; }
}
/** Accept only decimal source values that fit Decimal(18,4) without rounding. */
export function exact(value: string | null): Prisma.Decimal | null {
  // Reject precision overflow rather than letting PostgreSQL silently round source facts.
  if (value === null || !/^-?\d{1,14}(?:\.\d{1,4})?$/.test(value)) return null;
  return new Prisma.Decimal(value);
}

/** Normalize source facts without activating reporting or inventing refund dates. */
export function normalizeOrder(order: OrderDto, timezone: string, policy: OrderPolicy = {}) {
  const issues = new Set<string>();
  const ordered = sourceDate(order.orderedAt, timezone), paid = sourceDate(order.paidAt, timezone);
  if (order.orderedAt && !ordered.date || order.paidAt && !paid.date) issues.add("INVALID_SOURCE_DATE");
  if (paid.precision === "date") issues.add("PAYMENT_DATE_PRECISION");
  const kind = policy.statuses?.[order.statusId ?? ""] ?? "UNKNOWN";
  if (kind === "UNKNOWN") issues.add("STATUS_MAPPING_UNVERIFIED");
  if (!policy.channels?.[order.channelId ?? ""]) issues.add("CHANNEL_MAPPING_UNVERIFIED");
  const returned = sourceDate(order.returnedAt ?? (policy.dates?.returnDateField && typeof order.raw?.[policy.dates.returnDateField]==='string' ? order.raw[policy.dates.returnDateField] as string : null), timezone);
  const dateInferred=kind==='SALE' && !paid.date && Boolean(policy.dates?.saleOrderTimeFallback && ordered.date);
  const effectivePaid=dateInferred?ordered:paid;
  if (dateInferred) issues.add("INFERRED_PAYMENT_DATE");
  if (kind === "RETURN" && !returned.date) issues.add("RETURN_DATE_UNAVAILABLE");
  if (kind === "SALE" && !effectivePaid.date) issues.add("PAYMENT_DATE_UNAVAILABLE");
  const ids = new Set<string>();
  let valid = true;
  const lines = order.lines.map((line, index) => {
    const externalLineId = line.externalLineId ? `native:${line.externalLineId}` : `position:${index}`;
    if (ids.has(externalLineId)) { issues.add("DUPLICATE_SOURCE_LINE_ID"); valid = false; }
    ids.add(externalLineId);
    if (!line.externalLineId) issues.add("DERIVED_LINE_IDENTITY");
    const quantity = exact(line.quantity);
    if (!quantity) { valid = false; issues.add("INVALID_QUANTITY"); }
    let netAmount: Prisma.Decimal | null = null, costAmount: Prisma.Decimal | null = null;
    const price = exact(line.unitPrice), discount = exact(line.discount), cost = exact(line.costPrice);
    if (policy.amounts && quantity && price) {
      const amountQuantity=kind==='RETURN'?quantity.abs():quantity;
      netAmount = price.mul(amountQuantity);
      if (policy.amounts.price === "gross_unit") {
        if (!discount || discount.isNegative() || line.discountUnit === "unknown" || (line.discountUnit === "percentage" && discount.gt(100))) netAmount = null;
        else netAmount = netAmount.sub(line.discountUnit === "percentage" ? netAmount.mul(discount).div(100) : discount.mul(policy.amounts.absoluteDiscount === "unit" ? amountQuantity.abs() : 1).mul(netAmount.isNegative()?-1:1));
      }
      if (policy.amounts.cost === "unit" && cost && !cost.isNegative()) costAmount = cost.mul(amountQuantity);
      if (costAmount?.isZero()) costAmount=null;
    }
    for (const amount of [netAmount, costAmount]) if (amount && amount.abs().gte("100000000000000")) { valid = false; issues.add("AMOUNT_OVERFLOW"); }
    if (netAmount === null) issues.add("REVENUE_MAPPING_UNVERIFIED");
    if (costAmount === null) issues.add("COST_UNVERIFIED");
    const correction=kind==='CORRECTION' || kind!=='RETURN' && Boolean(quantity?.isNegative() || netAmount?.isNegative());
    if (correction) issues.add("SIGNED_CORRECTION");
    const signed=(value:Prisma.Decimal|null)=>!value?null:kind==='RETURN'?value.abs().neg():value;
    const financial=kind==='RETURN'?Boolean(returned.date):['SALE','CORRECTION'].includes(kind) && Boolean(effectivePaid.date);
    return { externalLineId, identityDerived: !line.externalLineId, externalProductId: line.productId, sourceSku: line.sku,
      statusId: order.statusId && /^\d+$/.test(order.statusId) && Number(order.statusId) <= 2147483647 ? Number(order.statusId) : null,
      channelId: order.channelId, kind, orderedAt: ordered.date, paidAt: effectivePaid.date, returnedAt: returned.date, dateInferred,
      datePrecision: { orderedAt: ordered.precision, paidAt: effectivePaid.precision, returnedAt: returned.precision },
      quantity, netAmount, costAmount,
      signedQuantity:signed(quantity), signedRevenue:financial?signed(netAmount):null,signedCost:financial?signed(costAmount):null,
      normalization:{version:2,movement:correction?'CORRECTION':kind,dateInferred,dateAvailable:financial,missingCost:costAmount===null}, currency: policy.amounts?.currency ?? null,
      sourceAmounts: { unitPrice: line.unitPrice, unitCost: line.costPrice, discount: line.discount, discountUnit: line.discountUnit,
        commission: line.commission, commissionUnit: line.commissionUnit } };
  });
  return { valid, lines, issues: [...issues], updatedAt: sourceDate(order.updatedAt, timezone).date };
}
