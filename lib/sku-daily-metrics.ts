import { Temporal } from "@js-temporal/polyfill";
import { financialDecimal as D } from "./merchandising-policy";
export const SKU_DAILY_CALCULATION_VERSION = 2;
export interface DailySkuInput {
  skuId: string;
  sku: string;
  name: string;
  brandId: string | null;
  categoryId: string | null;
  productKind: "MERCHANDISE" | "SERVICE" | "GIFT_CARD" | "UNKNOWN";
  seasonMonths: number[];
  snapshotId: string | null;
  observedAt: string | null;
  quantity: string | null;
  costPrice: string | null;
  retailPrice: string | null;
  currency: string | null;
  observedDays: number;
  inStockDays: number;
  invalidSnapshotDays: number;
  firstReceiptDate: string | null;
  lastReceiptDate: string | null;
  lastSaleDate: string | null;
  netUnits12Weeks: string;
  netUnitsSinceReceipt: string;
  cogs3Months: string;
  missingCostLines: number;
  currencyMismatch: boolean;
  blockedOrderLines: number;
  velocitySalesCovered: boolean;
  cohortSalesCovered: boolean;
  activitySalesCovered: boolean;
  receiptHistoryCovered: boolean;
  cogsHistoryCovered: boolean;
  inputHash: string;
}
export interface DailySkuContext {
  asOf: string;
  windowFrom: string;
  windowTo: string;
  cogsFrom: string;
  cogsTo: string;
  sourceBusy: boolean;
  turnoverNormMonths: number;
}
const age = (from: string, to: string) =>
  Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to)).days;
/** Availability is classified before presentation rounding; no active denominator means unavailable. */
export function availabilityTone(ratio: string | null) {
  return ratio === null
    ? "UNAVAILABLE"
    : D(ratio).gte("0.85")
      ? "GREEN"
      : D(ratio).gte("0.70")
        ? "AMBER"
        : "RED";
}
/** A daily observation is evidence for its calendar date, never a fabricated end-of-day snapshot. */
export function calculateDailySku(
  input: DailySkuInput,
  context: DailySkuContext,
) {
  const diagnostics: string[] = [];
  const merchandise = input.productKind === "MERCHANDISE";
  const snapshotKnown =
    input.snapshotId !== null &&
    input.observedAt !== null &&
    input.quantity !== null &&
    D(input.quantity).gte(0);
  const quantity = snapshotKnown ? D(input.quantity!) : null;
  if (!snapshotKnown)
    diagnostics.push(
      input.quantity !== null && D(input.quantity).lt(0)
        ? "NEGATIVE_STOCK"
        : "AS_OF_SNAPSHOT_UNAVAILABLE",
    );
  if (input.productKind === "UNKNOWN")
    diagnostics.push("PRODUCT_KIND_UNVERIFIED");
  const inSeason = input.seasonMonths.includes(
    Temporal.PlainDate.from(context.asOf).month,
  );
  const salesCovered =
    input.velocitySalesCovered &&
    !input.blockedOrderLines &&
    !context.sourceBusy;
  if (!salesCovered) diagnostics.push("SALES_HISTORY_INCOMPLETE");
  if (input.blockedOrderLines) diagnostics.push("ORDER_PROJECTION_UNVERIFIED");
  const snapshotHistoryComplete =
    input.observedDays === 84 && input.invalidSnapshotDays === 0;
  if (!snapshotHistoryComplete) diagnostics.push("SNAPSHOT_HISTORY_INCOMPLETE");
  let denominator: ReturnType<typeof D> | null = null,
    velocityBasis: "SNAPSHOT_DAYS" | "RECEIPT_FALLBACK" | "UNAVAILABLE" =
      "UNAVAILABLE";
  if (snapshotHistoryComplete) {
    denominator = D(Math.max(28, input.inStockDays)).div(7);
    velocityBasis = "SNAPSHOT_DAYS";
  } else if (
    input.receiptHistoryCovered &&
    input.lastReceiptDate !== null &&
    age(input.lastReceiptDate, context.asOf) >= 0
  ) {
    denominator = D(
      Math.max(28, Math.min(84, age(input.lastReceiptDate, context.asOf))),
    ).div(7);
    velocityBasis = "RECEIPT_FALLBACK";
    diagnostics.push("RECEIPT_DATE_VELOCITY_FALLBACK");
  } else diagnostics.push("VELOCITY_EXPOSURE_UNAVAILABLE");
  const netUnits = D(input.netUnits12Weeks);
  const velocityState = !merchandise
    ? "INELIGIBLE"
    : !salesCovered || denominator === null
      ? "UNKNOWN"
      : netUnits.lt(0)
        ? "RETURN_DOMINATED"
        : netUnits.isZero()
          ? "ZERO"
          : "KNOWN";
  const velocity =
    velocityState === "KNOWN" || velocityState === "ZERO"
      ? netUnits.div(denominator!)
      : null;
  if (velocityState === "RETURN_DOMINATED")
    diagnostics.push("RETURN_DOMINATED_VELOCITY");
  const woh =
    quantity !== null && velocity !== null && velocity.gt(0)
      ? quantity.div(velocity)
      : null;
  const daysToZero = woh?.mul(7) ?? null;
  const recentSale =
    input.lastSaleDate !== null &&
    age(input.lastSaleDate, context.asOf) >= 0 &&
    age(input.lastSaleDate, context.asOf) < 90;
  const recentReceipt =
    input.lastReceiptDate !== null &&
    age(input.lastReceiptDate, context.asOf) >= 0 &&
    age(input.lastReceiptDate, context.asOf) < 60;
  const active: boolean | null =
    !merchandise || !inSeason
      ? false
      : recentSale || recentReceipt
        ? true
        : input.activitySalesCovered &&
            input.receiptHistoryCovered &&
            !input.blockedOrderLines &&
            !context.sourceBusy
          ? false
          : null;
  if (active === null) diagnostics.push("ACTIVITY_HISTORY_INCOMPLETE");
  const cohortCovered =
    input.receiptHistoryCovered &&
    input.firstReceiptDate !== null &&
    age(input.firstReceiptDate, context.asOf) >= 0 &&
    input.cohortSalesCovered &&
    !input.blockedOrderLines &&
    !context.sourceBusy;
  if (!input.receiptHistoryCovered)
    diagnostics.push("RECEIPT_HISTORY_INCOMPLETE");
  const cohortSold = cohortCovered ? D(input.netUnitsSinceReceipt) : null;
  const str =
    merchandise &&
    cohortSold !== null &&
    cohortSold.gte(0) &&
    quantity !== null &&
    cohortSold.add(quantity).gt(0)
      ? cohortSold.div(cohortSold.add(quantity))
      : null;
  if (!cohortCovered)
    diagnostics.push(
      input.firstReceiptDate === null
        ? "FIRST_VERIFIED_RECEIPT_UNAVAILABLE"
        : "COHORT_SALES_HISTORY_INCOMPLETE",
    );
  if (cohortSold?.lt(0)) diagnostics.push("RETURN_DOMINATED_COHORT");
  const value = (price: string | null) =>
    !merchandise || quantity === null
      ? null
      : quantity.isZero()
        ? D(0)
        : price !== null && D(price).gt(0)
          ? quantity.mul(price)
          : null;
  const stockCost = value(input.costPrice),
    stockRetail = value(input.retailPrice);
  if (merchandise && stockCost === null)
    diagnostics.push("STOCK_COST_UNAVAILABLE");
  if (merchandise && stockRetail === null)
    diagnostics.push("STOCK_RETAIL_VALUE_UNAVAILABLE");
  const cogsKnown =
    input.cogsHistoryCovered &&
    !input.missingCostLines &&
    !input.currencyMismatch &&
    !input.blockedOrderLines &&
    !context.sourceBusy &&
    input.currency !== null;
  if (!cogsKnown) diagnostics.push("COGS_HISTORY_INCOMPLETE");
  const cogs = cogsKnown ? D(input.cogs3Months) : null;
  const turnover =
    merchandise && stockCost !== null && cogs !== null && cogs.gt(0)
      ? stockCost.div(cogs.div(3))
      : null;
  if (cogs !== null && cogs.lte(0))
    diagnostics.push(cogs.isZero() ? "ZERO_COGS" : "RETURN_DOMINATED_COGS");
  return {
    skuId: input.skuId,
    sku: input.sku,
    name: input.name,
    brandId: input.brandId,
    categoryId: input.categoryId,
    productKind: input.productKind,
    asOf: context.asOf,
    sourceObservedAt: input.observedAt,
    snapshotId: input.snapshotId,
    currency: input.currency,
    quantity: quantity?.toString() ?? null,
    salesUnits12Weeks: salesCovered ? netUnits.toString() : null,
    velocityPerWeek: velocity?.toString() ?? null,
    velocityState,
    velocityBasis,
    denominatorWeeks: denominator?.toString() ?? null,
    windowFrom: context.windowFrom,
    windowTo: context.windowTo,
    snapshotHistory: {
      observedDays: input.observedDays,
      inStockDays: input.inStockDays,
      expectedDays: 84,
      complete: snapshotHistoryComplete,
    },
    weeksOnHand: woh?.toString() ?? null,
    daysToZero: daysToZero?.toString() ?? null,
    firstReceiptDate: input.firstReceiptDate,
    receiptHistoryComplete: input.receiptHistoryCovered,
    lastReceiptDate: input.lastReceiptDate,
    lastSaleDate: input.lastSaleDate,
    inSeason,
    active,
    sellThroughRatio: str?.toString() ?? null,
    strBasis: "SINCE_FIRST_VERIFIED_EXTERNAL_RECEIPT" as const,
    cohortSalesUnits: cohortSold?.toString() ?? null,
    cohortHistoryComplete: cohortCovered,
    cohortWindowTo: context.windowTo,
    stockCostValue: stockCost?.toString() ?? null,
    stockRetailValue: stockRetail?.toString() ?? null,
    cogs3Months: cogs?.toString() ?? null,
    cogsFrom: context.cogsFrom,
    cogsTo: context.cogsTo,
    turnoverMonths: turnover?.toString() ?? null,
    turnoverTone:
      turnover === null
        ? "UNAVAILABLE"
        : turnover.lte(context.turnoverNormMonths)
          ? "GREEN"
          : turnover.lte(D(context.turnoverNormMonths).mul("1.5"))
            ? "AMBER"
            : "RED",
    diagnostics: [...new Set(diagnostics)].sort(),
  };
}
export type DailySkuMetrics = ReturnType<typeof calculateDailySku>;
/** Aggregate the same materialized rows; unknown activity or active stock cannot inflate availability. */
export function summarizeDailySkus(
  rows: DailySkuMetrics[],
  turnoverNormMonths: number,
) {
  const merchandise = rows.filter((r) => r.productKind === "MERCHANDISE");
  const active = merchandise.filter((r) => r.active === true),
    unknownActivity = rows.filter(
      (r) =>
        r.inSeason &&
        (r.productKind === "UNKNOWN" ||
          (r.productKind === "MERCHANDISE" && r.active === null)),
    ).length;
  const unknownStock = active.filter((r) => r.quantity === null).length,
    inStock = active.filter(
      (r) => r.quantity !== null && D(r.quantity).gt(0),
    ).length;
  const ratio =
    active.length && !unknownActivity && !unknownStock
      ? D(inStock).div(active.length).toString()
      : null;
  const byCurrency = [...new Set(merchandise.map((r) => r.currency))]
    .sort((a, b) => (a ?? "").localeCompare(b ?? ""))
    .map((currency) => {
      const items = merchandise.filter((r) => r.currency === currency),
        missingCost = items.filter((r) => r.stockCostValue === null).length,
        missingRetail = items.filter((r) => r.stockRetailValue === null).length,
        missingQuantity = items.filter((r) => r.quantity === null).length;
      const sum = (
        field:
          | "stockCostValue"
          | "stockRetailValue"
          | "quantity"
          | "cogs3Months",
      ) =>
        items.reduce(
          (total, r) => (r[field] === null ? total : total.add(r[field]!)),
          D(0),
        );
      const cost = sum("stockCostValue"),
        cogs = sum("cogs3Months"),
        allCogs = items.every((r) => r.cogs3Months !== null),
        turnover =
          !missingCost && allCogs && currency !== null && cogs.gt(0)
            ? cost.div(cogs.div(3))
            : null;
      return {
        currency,
        skuCount: items.length,
        quantity: missingQuantity ? null : sum("quantity").toString(),
        coveredStockCost: cost.toString(),
        stockCost: missingCost ? null : cost.toString(),
        coveredStockRetail: sum("stockRetailValue").toString(),
        stockRetail: missingRetail ? null : sum("stockRetailValue").toString(),
        missingCostSkuCount: missingCost,
        missingRetailSkuCount: missingRetail,
        missingQuantitySkuCount: missingQuantity,
        cogs3Months: allCogs ? cogs.toString() : null,
        turnoverMonths: turnover?.toString() ?? null,
        turnoverTone:
          turnover === null
            ? "UNAVAILABLE"
            : turnover.lte(turnoverNormMonths)
              ? "GREEN"
              : turnover.lte(D(turnoverNormMonths).mul("1.5"))
                ? "AMBER"
                : "RED",
      };
    });
  return {
    availability: {
      ratio,
      tone: availabilityTone(ratio),
      activeSkuCount: active.length,
      activeInStockSkuCount: inStock,
      unknownActivitySkuCount: unknownActivity,
      unknownStockSkuCount: unknownStock,
    },
    byCurrency,
    skuCount: rows.length,
    partialSkuCount: rows.filter(
      (r) =>
        (r.productKind === "MERCHANDISE" || r.productKind === "UNKNOWN") &&
        r.diagnostics.length > 0,
    ).length,
  };
}
