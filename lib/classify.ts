import type { Prisma } from "@prisma/client";
import type { SkuFlag, ClassifyThresholds } from "./analyst-types";
import { Temporal } from "@js-temporal/polyfill";
import {
  financialDecimal as D,
  type resolveMerchandisingPolicy,
} from "./merchandising-policy";
import type { DailySkuMetrics } from "./sku-daily-metrics";

/** SalesDrive has a versioned daily contract; never reclassify it using Sheets sales. */
export const LEGACY_CLASSIFICATION_FILTER = {
  aliases: { none: { source: { kind: "SALESDRIVE" } } },
  productKind: { notIn: ["SERVICE", "GIFT_CARD"] },
} satisfies Prisma.SkuWhereInput;

export type MerchandisingPolicy = ReturnType<typeof resolveMerchandisingPolicy>;
export const SKU_STATUSES = [
  "SERVICE",
  "DATA_ERROR",
  "NEW",
  "OFF_SEASON",
  "OOS",
  "DEAD",
  "RISK",
  "HEALTHY",
] as const;
export type SkuStatus = (typeof SKU_STATUSES)[number];
export const calendarAge = (from: string, to: string) =>
  Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to)).days;
export const isNewReceipt = (
  first: string | null,
  asOf: string,
  weeks: number,
) =>
  first !== null &&
  calendarAge(first, asOf) >= 0 &&
  calendarAge(first, asOf) < weeks * 7;

/** Shared unrounded WOH bands for section 8 and K4. */
export function classifyWoh(woh: string | null, policy: MerchandisingPolicy) {
  return woh === null
    ? null
    : D(woh).gt(policy.riskWohWeeks)
      ? ("DEAD" as const)
      : D(woh).gt(policy.healthyWohWeeks)
        ? ("RISK" as const)
        : ("HEALTHY" as const);
}

/** Shared D14 shortage union; scenario lead changes must not duplicate eligibility rules. */
export function shortageSignals(
  row: {
    classification: string | null;
    active: boolean | null;
    quantity: string | null;
    daysToZero: string | null;
  },
  leadDays: number | null,
) {
  const shortageEligible =
    ["OOS", "DEAD", "RISK", "HEALTHY"].includes(row.classification ?? "") &&
    row.active === true;
  const shortageRisk =
    shortageEligible &&
    leadDays !== null &&
    row.daysToZero !== null &&
    D(row.daysToZero).lt(leadDays + 14);
  return {
    shortageEligible,
    shortageRisk,
    shortage:
      shortageEligible &&
      ((row.quantity !== null && D(row.quantity).isZero()) || shortageRisk),
  };
}

/** SalesDrive section 8. Legacy 7/30-day flags below retain their separate Sheets contract. */
export function classifyDailySku(
  row: DailySkuMetrics,
  policy: MerchandisingPolicy,
) {
  const errors: string[] = [];
  const receiptAge =
    row.firstReceiptDate === null
      ? null
      : calendarAge(row.firstReceiptDate, row.asOf);
  const saleAge =
    row.lastSaleDate === null ? null : calendarAge(row.lastSaleDate, row.asOf);
  const neverSold =
    row.lastSaleDate === null &&
    row.cohortHistoryComplete &&
    row.cohortSalesUnits !== null &&
    D(row.cohortSalesUnits).isZero();
  if (row.productKind === "UNKNOWN") errors.push("PRODUCT_KIND_UNVERIFIED");
  if (
    row.quantity === null ||
    !D(row.quantity).isFinite() ||
    D(row.quantity).lt(0)
  )
    errors.push("STOCK_UNAVAILABLE");
  if (!row.receiptHistoryComplete || receiptAge === null || receiptAge < 0)
    errors.push("RECEIPT_HISTORY_UNVERIFIED");
  if ((saleAge === null && !neverSold) || (saleAge !== null && saleAge < 0))
    errors.push("LAST_SALE_UNVERIFIED");
  if (
    row.velocityState === "UNKNOWN" ||
    row.velocityState === "RETURN_DOMINATED"
  )
    errors.push("VELOCITY_UNAVAILABLE");
  if (row.active === null) errors.push("ACTIVITY_UNAVAILABLE");
  const status: SkuStatus =
    row.productKind === "SERVICE" || row.productKind === "GIFT_CARD"
      ? "SERVICE"
      : errors.length
        ? "DATA_ERROR"
        : isNewReceipt(row.firstReceiptDate, row.asOf, policy.newProductWeeks)
          ? "NEW"
          : !row.inSeason
            ? "OFF_SEASON"
            : row.active === true && D(row.quantity!).isZero()
              ? "OOS"
              : (saleAge ?? receiptAge!) >= policy.deadDays ||
                  (D(row.quantity!).gt(0) && row.velocityState === "ZERO")
                ? "DEAD"
                : (classifyWoh(row.weeksOnHand, policy) ?? "HEALTHY");
  const { shortageEligible, shortageRisk, shortage } = shortageSignals(
    { ...row, classification: status },
    policy.leadDays,
  );
  return {
    classification: status,
    classificationErrors: status === "DATA_ERROR" ? errors : [],
    ownership: policy.ownership,
    leadDays: policy.leadDays,
    supplierId: policy.supplierId,
    supplierTermsVerified: policy.supplierTermsVerified,
    shortageEligible,
    shortageRisk,
    shortage,
    recommendation:
      status === "SERVICE"
        ? "NONE"
        : status === "DATA_ERROR" || policy.ownership === "UNKNOWN"
          ? "REVIEW_DATA"
          : status === "DEAD"
            ? policy.ownership === "CONSIGNMENT"
              ? "DISCUSS_SUPPLIER_RETURN"
              : "REVIEW_MARKDOWN"
            : "NONE",
    warnings:
      row.productKind === "MERCHANDISE" && policy.ownership === "UNKNOWN"
        ? ["OWNERSHIP_UNKNOWN"]
        : [],
  };
}
export type ClassifiedDailySku = DailySkuMetrics &
  ReturnType<typeof classifyDailySku> & {
    brandName: string | null;
    brandOwnership: MerchandisingPolicy["ownership"];
  };

/** Distinct IDs, including OOS with zero velocity whose days-to-zero is unavailable. */
export function summarizeSkuClassification(rows: ClassifiedDailySku[]) {
  return {
    statusCounts: Object.fromEntries(
      SKU_STATUSES.map((status) => [
        status,
        rows.filter((r) => r.classification === status).length,
      ]),
    ),
    shortageSkuCount: new Set(
      rows.filter((r) => r.shortage).map((r) => r.skuId),
    ).size,
    oosSkuCount: new Set(
      rows.filter((r) => r.classification === "OOS").map((r) => r.skuId),
    ).size,
    shortageRiskSkuCount: new Set(
      rows.filter((r) => r.shortageRisk).map((r) => r.skuId),
    ).size,
    offSeasonSkuCount: rows.filter((r) => r.classification === "OFF_SEASON")
      .length,
  };
}

// Thresholds vary by business model:
// SEASONAL  — faster churn: hit at +20%, dead at 60 days, strict stockout (2x lead time)
// CARRYOVER — slower churn: hit at +35%, dead at 120 days, normal stockout (1.5x)
// HYBRID/null — balanced defaults
export function getThresholds(businessModel: string | null): ClassifyThresholds {
  switch (businessModel) {
    case "SEASONAL":
      return { hitMultiplier: 1.2, slowMultiplier: 0.75, stockoutMultiplier: 2.0, deadDays: 60 };
    case "CARRYOVER":
      return { hitMultiplier: 1.35, slowMultiplier: 0.65, stockoutMultiplier: 1.5, deadDays: 120 };
    default:
      return { hitMultiplier: 1.3, slowMultiplier: 0.7, stockoutMultiplier: 1.5, deadDays: 90 };
  }
}

export function classify(
  stock: number,
  sold7: number,
  sold30: number,
  leadTime: number,
  t: ClassifyThresholds
): SkuFlag {
  const avg30 = sold30 / 30;
  const avg7 = sold7 / 7;
  const days = avg30 > 0 ? stock / avg30 : stock > 0 ? 9999 : 0;

  if (stock === 0) return "ok";
  if (sold30 === 0) return "dead";
  if (days < leadTime * t.stockoutMultiplier && avg7 >= avg30 * t.hitMultiplier) return "hit";
  if (days < leadTime * t.stockoutMultiplier) return "stockout";
  if (avg7 > avg30 * t.hitMultiplier) return "hit";
  if (avg7 < avg30 * t.slowMultiplier) return "slow";
  if (days > t.deadDays) return "dead";
  return "ok";
}

/** Retain exact fractional observations; unknown stock cannot become a zero-stock signal. */
export function snapshotStock(snapshot: {quantity?: unknown;qtyOnHand:number|null}): number|null {
  const value=snapshot.quantity==null?snapshot.qtyOnHand:Number(snapshot.quantity);
  return value!==null && Number.isFinite(value)?value:null;
}
/** Explicit non-merchandise and unverified imported products never enter classification. */
export function canClassifyProduct(product:{productKind?:string;catalogAttributes?:unknown},stock:number|null|undefined) {
  if(stock==null || stock<0 || !Number.isFinite(stock) || product.productKind==='SERVICE' || product.productKind==='GIFT_CARD')return false;
  const attributes=product.catalogAttributes;
  const imported=attributes && typeof attributes==='object' && 'sourceId' in attributes;
  return !imported || product.productKind==='MERCHANDISE';
}
