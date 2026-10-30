import { Temporal } from "@js-temporal/polyfill";
import { Prisma, type OrderLineKind } from "@prisma/client";
import type { OrderDto } from "./contract";

export interface OrderPolicy {
  statuses?: Record<string, OrderLineKind>;
  channels?: Record<string, string>;
  settings?: {configId:string;revision:number;filterFingerprint:string;excludedChannels:string[];excludedProjects:string[];projectField:string|null};
  dates?: { saleOrderTimeFallback?: boolean; returnDateField?: string };
  amounts?: { price: "gross_unit" | "net_unit" | "net_line"; absoluteDiscount: "line" | "unit"; currency: string; cost?: "unit" | "line" };
}
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
export function exact(value: string | null): Prisma.Decimal | null {
  if (value === null || !/^-?\d{1,14}(?:\.\d{1,4})?$/.test(value)) return null;
  return new Prisma.Decimal(value);
}

export function normalizeOrder(order: OrderDto, timezone: string, policy: OrderPolicy = {}) {
  const issues = new Set<string>();
  const ordered = sourceDate(order.orderedAt, timezone), paid = sourceDate(order.paidAt, timezone);
  if (order.orderedAt && !ordered.date || order.paidAt && !paid.date) issues.add("INVALID_SOURCE_DATE");
  if (paid.precision === "date") issues.add("PAYMENT_DATE_PRECISION");
  const statusKey = order.statusId ?? "";
  const kind = policy.statuses && Object.hasOwn(policy.statuses, statusKey) ? policy.statuses[statusKey] : "UNKNOWN";
  if (kind === "UNKNOWN") issues.add("STATUS_MAPPING_UNVERIFIED");
  if (!policy.channels || !Object.hasOwn(policy.channels, order.channelId ?? "") || !policy.channels[order.channelId ?? ""]) issues.add("CHANNEL_MAPPING_UNVERIFIED");
  const returned = sourceDate(order.returnedAt ?? (policy.dates?.returnDateField && typeof order.raw?.[policy.dates.returnDateField]==='string' ? order.raw[policy.dates.returnDateField] as string : null), timezone);
  const dateInferred=kind==='SALE' && !paid.date && Boolean(policy.dates?.saleOrderTimeFallback && ordered.date);
  const effectivePaid=dateInferred?ordered:paid;
  if (dateInferred) issues.add("INFERRED_PAYMENT_DATE");
  if (kind === "RETURN" && !returned.date) issues.add("RETURN_DATE_UNAVAILABLE");
  if (kind === "SALE" && !effectivePaid.date) issues.add("PAYMENT_DATE_UNAVAILABLE");
  const settings=policy.settings;
  const projectMapped=Boolean(settings?.projectField&&order.raw&&Object.hasOwn(order.raw,settings.projectField));
  const projectValue=projectMapped?order.raw![settings!.projectField!]:null;
  const scalar=(value:unknown)=>typeof value==='string'||typeof value==='number'&&Number.isSafeInteger(value);
  const projectShapeValid=projectValue===null||scalar(projectValue)||Array.isArray(projectValue)&&projectValue.every(scalar);
  const projectMappingUnavailable=Boolean(settings?.excludedProjects.length&&(!projectMapped||!projectShapeValid));
  const projectIds=Array.isArray(projectValue)?projectValue.map(String):projectValue==null?[]:[String(projectValue)];
  const exclusionReason=settings?.excludedChannels.includes(order.channelId??'')?'EXCLUDED_CHANNEL':settings?.excludedProjects.some(id=>projectIds.includes(id))?'EXCLUDED_PROJECT':null;
  if(exclusionReason)issues.add(exclusionReason);
  if(projectMappingUnavailable)issues.add('PROJECT_MAPPING_UNVERIFIED');
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
    }
    if (policy.amounts && quantity) {
      if (policy.amounts.price === "net_line") netAmount = exact(line.netLineAmount ?? null);
      if (policy.amounts.cost === "unit" && cost && !cost.isNegative()) costAmount = cost.mul(kind === "RETURN" ? quantity.abs() : quantity);
      if (policy.amounts.cost === "line") {
        costAmount = exact(line.costLineAmount ?? null);
        if (costAmount?.isNegative() && !["RETURN", "CORRECTION"].includes(kind)) costAmount = null;
      }
      if (costAmount?.isZero()) costAmount = null;
    }
    for (const amount of [netAmount, costAmount]) if (amount && amount.abs().gte("100000000000000")) { valid = false; issues.add("AMOUNT_OVERFLOW"); }
    if (netAmount === null) issues.add("REVENUE_MAPPING_UNVERIFIED");
    if (costAmount === null) issues.add("COST_UNVERIFIED");
    const correction=kind==='CORRECTION' || kind!=='RETURN' && Boolean(quantity?.isNegative() || netAmount?.isNegative());
    if (correction) issues.add("SIGNED_CORRECTION");
    const signed=(value:Prisma.Decimal|null)=>!value?null:kind==='RETURN'?value.abs().neg():value;
    const financial=!exclusionReason&&!projectMappingUnavailable&&(kind==='RETURN'?Boolean(returned.date):['SALE','CORRECTION'].includes(kind) && Boolean(effectivePaid.date));
    return { externalLineId, identityDerived: !line.externalLineId, externalProductId: line.productId, sourceSku: line.sku,
      statusId: order.statusId && /^\d+$/.test(order.statusId) && Number(order.statusId) <= 2147483647 ? Number(order.statusId) : null,
      channelId: order.channelId, kind, orderedAt: ordered.date, paidAt: effectivePaid.date, returnedAt: returned.date, dateInferred,
      datePrecision: { orderedAt: ordered.precision, paidAt: effectivePaid.precision, returnedAt: returned.precision },
      quantity, netAmount, costAmount,
      signedQuantity:exclusionReason||projectMappingUnavailable?null:signed(quantity), signedRevenue:financial?signed(netAmount):null,signedCost:financial?signed(costAmount):null,
      normalization:{filterFingerprint:settings?.filterFingerprint??null,settingsConfigId:settings?.configId??null,settingsRevision:settings?.revision??null,excluded:Boolean(exclusionReason),exclusionReason,projectMappingUnavailable,version:2,movement:correction?'CORRECTION':kind,dateInferred,dateAvailable:financial,missingCost:costAmount===null}, currency: policy.amounts?.currency ?? null,
      sourceAmounts: { ...(line.netLineAmount !== undefined ? {netLineAmount:line.netLineAmount} : {}), ...(line.costLineAmount !== undefined ? {costLineAmount:line.costLineAmount} : {}), unitPrice: line.unitPrice, unitCost: line.costPrice, discount: line.discount, discountUnit: line.discountUnit,
        commission: line.commission, commissionUnit: line.commissionUnit } };
  });
  return { valid, lines, issues: [...issues], updatedAt: sourceDate(order.updatedAt, timezone).date };
}
