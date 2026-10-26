import "server-only";
import { financialDecimal as D } from "./financial-decimal.mjs";
import { payloadHash } from "./connectors/order-storage";
import { isRecord } from "./api-contracts";
import { shortageSignals } from "./classify";
import { reorderQuantity } from "./reorder-quantity";
import {
  REORDERING_VERSION,
  REORDERING_INPUT_LIMIT,
  type ReorderingInputs,
  type ReorderingRequest,
  type ReorderingParameters,
  type ReorderingOverride,
  type ReorderingSku,
} from "./reordering-contract";
export class ReorderingError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
    readonly details: string[] = [],
  ) {
    super(code);
    this.name = "ReorderingError";
  }
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Strict bounded scenario parsing; no client formula, velocity, cost or stock is authoritative. */
export function parseReorderingRequest(value: unknown): ReorderingRequest {
  const issues: string[] = [];
  const record = (v: unknown, keys: string[], path: string) => {
    if (v === undefined) return {};
    if (!isRecord(v)) {
      issues.push(path + ": expected an object");
      return {};
    }
    for (const key of Object.keys(v))
      if (!keys.includes(key))
        issues.push(path + "." + key + ": unsupported field");
    return v;
  };
  const id = (v: unknown, path: string) => {
    if (
      typeof v !== "string" ||
      !v.trim() ||
      v !== v.trim() ||
      v.length > 200 ||
      /[\u0000-\u001f]/.test(v)
    ) {
      issues.push(path + ": invalid identifier");
      return "";
    }
    return v;
  };
  const integer = (v: unknown, min: number, max: number, path: string) => {
    if (
      typeof v !== "number" ||
      !Number.isSafeInteger(v) ||
      v < min ||
      v > max
    ) {
      issues.push(path + ": invalid integer");
      return min;
    }
    return v;
  };
  const params = (v: Record<string, unknown>, path: string) => {
    const p: ReorderingParameters = {};
    for (const k of ["leadDays", "coverDays", "moq"] as const)
      if (v[k] !== undefined)
        p[k] = integer(
          v[k],
          k === "moq" ? 1 : 0,
          k === "moq" ? 1000000 : 3650,
          path + "." + k,
        );
    return p;
  };
  const root = record(
    value,
    [
      "snapshotId",
      "mode",
      "filters",
      "parameters",
      "overrides",
      "page",
      "pageSize",
    ],
    "request",
  );
  const snapshotId = id(root.snapshotId, "snapshotId"),
    mode = (
      root.mode === undefined ? "shortage" : root.mode
    ) as ReorderingRequest["mode"];
  if (!["shortage", "brand"].includes(mode))
    issues.push("mode: expected shortage or brand");
  const f = record(
      root.filters,
      ["brandId", "categoryId", "supplierId", "skuId", "currency"],
      "filters",
    ),
    filters: ReorderingRequest["filters"] = {};
  for (const key of [
    "brandId",
    "categoryId",
    "supplierId",
    "skuId",
    "currency",
  ] as const)
    if (f[key] !== undefined) filters[key] = id(f[key], "filters." + key);
  if (
    filters.currency !== undefined &&
    !/^([A-Z]{3}|__unassigned__)$/.test(filters.currency)
  )
    issues.push("filters.currency: invalid currency");
  if (mode === "brand" && !filters.brandId)
    issues.push("filters.brandId: required for brand mode");
  const parameters = params(
    record(root.parameters, ["leadDays", "coverDays", "moq"], "parameters"),
    "parameters",
  );
  let overrides: ReorderingOverride[] = [];
  if (root.overrides !== undefined) {
    if (
      !Array.isArray(root.overrides) ||
      root.overrides.length > REORDERING_INPUT_LIMIT
    )
      issues.push("overrides: invalid or oversized list");
    else
      overrides = root.overrides.map((entry, index) => {
        const path = `overrides.${index}`,
          v = record(
            entry,
            ["skuId", "leadDays", "coverDays", "moq", "inTransitQuantity"],
            path,
          ),
          r: ReorderingOverride = {
            skuId: id(v.skuId, path + ".skuId"),
            ...params(v, path),
          };
        if (v.inTransitQuantity !== undefined) {
          if (
            typeof v.inTransitQuantity !== "string" ||
            !/^(0|[1-9]\d{0,13})(\.\d{1,4})?$/.test(v.inTransitQuantity)
          )
            issues.push(
              path +
                ".inTransitQuantity: expected a non-negative decimal string",
            );
          else r.inTransitQuantity = D(v.inTransitQuantity).toFixed();
        }
        if (Object.keys(r).length === 1)
          issues.push(path + ": no override supplied");
        return r;
      });
  }
  if (new Set(overrides.map((r) => r.skuId)).size !== overrides.length)
    issues.push("overrides: duplicate SKU identifiers");
  const page =
      root.page === undefined ? 1 : integer(root.page, 1, 100000, "page"),
    pageSize =
      root.pageSize === undefined
        ? 25
        : integer(root.pageSize, 1, 200, "pageSize");
  if (issues.length)
    throw new ReorderingError("INVALID_REORDERING_REQUEST", 400, issues);
  return {
    snapshotId,
    mode,
    filters,
    parameters,
    overrides: overrides.sort((a, b) => compare(a.skuId, b.skuId)),
    page,
    pageSize,
  };
}
const nonNegative = (value: string | null) =>
  value !== null && D(value).isFinite() && D(value).gte(0);
const positive = (value: string | null) =>
  nonNegative(value) && D(value!).gt(0);
/** Match canonical frozen IDs, resolving supplier through policy rather than display text. */
function matches(row: ReorderingSku, filters: ReorderingRequest["filters"]) {
  for (const key of [
    "brandId",
    "categoryId",
    "skuId",
    "currency",
    "supplierId",
  ] as const) {
    const value = key === "supplierId" ? row.policy.supplierId : row[key];
    if (
      filters[key] !== undefined &&
      (value ?? "__unassigned__") !== filters[key]
    )
      return false;
  }
  return true;
}
/** Reuse persisted 12-week velocity (minimum four-week exposure), D14 eligibility and D18 MOQ math. */
export function calculateReordering(
  inputs: ReorderingInputs,
  request: ReorderingRequest,
) {
  if (
    inputs.snapshotId !== request.snapshotId ||
    inputs.rows.length > REORDERING_INPUT_LIMIT ||
    new Set(inputs.rows.map((r) => r.skuId)).size !== inputs.rows.length
  )
    throw new ReorderingError("INVALID_REORDERING_INPUTS", 422);
  const overrideMap = new Map(request.overrides.map((r) => [r.skuId, r]));
  const calculated = inputs.rows
    .filter(
      (r) => r.productKind === "MERCHANDISE" && matches(r, request.filters),
    )
    .map((row) => {
      const override = overrideMap.get(row.skuId);
      const parameter = (key: keyof ReorderingParameters) =>
        override?.[key] ?? request.parameters[key] ?? row.policy[key];
      const leadDays = parameter("leadDays"),
        coverDays = parameter("coverDays"),
        moq = parameter("moq");
      const parameterSources = Object.fromEntries(
        (["leadDays", "coverDays", "moq"] as const).map((key) => [
          key,
          override?.[key] !== undefined
            ? "SKU_SCENARIO"
            : request.parameters[key] !== undefined
              ? "SCENARIO"
              : row.policy.supplierTermsSource,
        ]),
      );
      const transit = override?.inTransitQuantity ?? row.inTransitQuantity,
        inTransitSource =
          override?.inTransitQuantity !== undefined
            ? "SCENARIO_CONFIRMATION"
            : row.inTransitQuantity !== null
              ? "VERIFIED_SNAPSHOT"
              : "UNKNOWN";
      const issues: string[] = [];
      const velocityKnown =
        ["KNOWN", "ZERO"].includes(row.velocityState) &&
        nonNegative(row.velocityPerWeek) &&
        positive(row.denominatorWeeks) &&
        D(row.denominatorWeeks!).gte(4) &&
        ["SNAPSHOT_DAYS", "RECEIPT_FALLBACK"].includes(row.velocityBasis);
      if (!velocityKnown)
        issues.push(
          row.denominatorWeeks !== null && D(row.denominatorWeeks).lt(4)
            ? "VELOCITY_DENOMINATOR_BELOW_FOUR_WEEKS"
            : "VELOCITY_UNAVAILABLE",
        );
      if (!nonNegative(row.quantity)) issues.push("STOCK_UNAVAILABLE");
      if (
        leadDays === null ||
        !Number.isInteger(leadDays) ||
        leadDays < 0 ||
        leadDays > 3650
      )
        issues.push("LEAD_TIME_UNAVAILABLE");
      if (
        coverDays === null ||
        !Number.isInteger(coverDays) ||
        coverDays < 0 ||
        coverDays > 3650
      )
        issues.push("COVERAGE_UNAVAILABLE");
      if (moq === null || !Number.isInteger(moq) || moq < 1 || moq > 1000000)
        issues.push("MOQ_UNAVAILABLE");
      if (!nonNegative(transit)) issues.push("IN_TRANSIT_UNKNOWN");
      if (!positive(row.unitCost)) issues.push("COST_UNVERIFIED");
      if (row.policy.supplierId === null) issues.push("SUPPLIER_UNKNOWN");
      if (!row.policy.supplierTermsVerified)
        issues.push("SUPPLIER_TERMS_UNVERIFIED");
      if (row.ownership !== "OWN")
        issues.push(
          row.ownership === "CONSIGNMENT"
            ? "CONSIGNMENT_PURCHASE_TERMS_UNCONFIRMED"
            : "OWNERSHIP_UNVERIFIED",
        );
      if (!row.currency || !/^[A-Z]{3}$/.test(row.currency))
        issues.push("CURRENCY_UNAVAILABLE");
      const exclusions: string[] = [];
      if (row.classification === "NEW")
        exclusions.push("NEW_PRODUCT_QUARANTINE");
      if (!row.inSeason || row.classification === "OFF_SEASON")
        exclusions.push("OFF_SEASON");
      if (row.active === false && !exclusions.includes("OFF_SEASON"))
        exclusions.push("INACTIVE");
      if (row.classification === "SERVICE") exclusions.push("NOT_MERCHANDISE");
      if (row.active === null) issues.push("ACTIVITY_UNAVAILABLE");
      if (row.classification === "DATA_ERROR" || !row.classification)
        issues.push("CLASSIFICATION_REVIEW_REQUIRED");
      const daysToZero = velocityKnown ? row.daysToZero : null;
      const signals = shortageSignals(
        { ...row, daysToZero },
        issues.includes("LEAD_TIME_UNAVAILABLE") ? null : leadDays,
      );
      const quantityIssues = [
        "VELOCITY_UNAVAILABLE",
        "VELOCITY_DENOMINATOR_BELOW_FOUR_WEEKS",
        "STOCK_UNAVAILABLE",
        "LEAD_TIME_UNAVAILABLE",
        "COVERAGE_UNAVAILABLE",
        "MOQ_UNAVAILABLE",
        "IN_TRANSIT_UNKNOWN",
        "ACTIVITY_UNAVAILABLE",
        "CLASSIFICATION_REVIEW_REQUIRED",
      ];
      const blockedQuantity = issues.some((i) => quantityIssues.includes(i));
      const quantity = exclusions.length
        ? D(0)
        : blockedQuantity
          ? null
          : reorderQuantity({
              weeklyVelocity: row.velocityPerWeek!,
              stock: row.quantity!,
              inTransit: transit,
              leadDays: leadDays!,
              coverDays: coverDays!,
              moq: moq!,
            });
      const cashKnown =
        positive(row.unitCost) &&
        row.ownership === "OWN" &&
        !issues.includes("CURRENCY_UNAVAILABLE");
      const purchaseAmount = quantity?.isZero()
        ? D(0)
        : quantity !== null && cashKnown
          ? quantity.mul(row.unitCost!)
          : null;
      const exportEligible =
        quantity !== null &&
        quantity.gt(0) &&
        !exclusions.length &&
        !issues.length;
      const review = !exclusions.length && issues.length > 0;
      return {
        ...row,
        leadDays,
        coverDays,
        moq,
        parameterSources,
        inTransitQuantity: transit,
        inTransitSource,
        daysToZero,
        ...signals,
        recommendedQuantity: quantity?.toFixed() ?? null,
        purchaseAmount: purchaseAmount?.toFixed() ?? null,
        exportEligible,
        issues: [...new Set(issues)].sort(),
        exclusionReasons: exclusions,
        state: exclusions.length
          ? "EXCLUDED"
          : review
            ? "REVIEW"
            : quantity?.isZero()
              ? "ZERO_DEMAND"
              : "READY",
        urgency:
          exclusions.length ||
          daysToZero === null ||
          issues.includes("LEAD_TIME_UNAVAILABLE")
            ? "UNAVAILABLE"
            : D(daysToZero).lt(leadDays!)
              ? "RED"
              : "NORMAL",
        warnings:
          row.velocityBasis === "RECEIPT_FALLBACK"
            ? ["RECEIPT_DATE_VELOCITY_FALLBACK"]
            : [],
      };
    });
  const allowed = new Set(
    calculated
      .filter(
        (r) =>
          !r.exclusionReasons.length &&
          ["OOS", "DEAD", "RISK", "HEALTHY"].includes(r.classification ?? ""),
      )
      .map((r) => r.skuId),
  );
  if (request.overrides.some((r) => !allowed.has(r.skuId)))
    throw new ReorderingError("REORDERING_OVERRIDE_INELIGIBLE", 422, [
      "overrides: SKU is unavailable, excluded or outside the scenario",
    ]);
  const rows = calculated.filter(
    (row) =>
      request.mode === "brand" ||
      row.shortage ||
      row.exclusionReasons.includes("OFF_SEASON") ||
      (!row.exclusionReasons.length &&
        row.state === "REVIEW" &&
        row.issues.some((issue) =>
          [
            "VELOCITY_UNAVAILABLE",
            "VELOCITY_DENOMINATOR_BELOW_FOUR_WEEKS",
            "STOCK_UNAVAILABLE",
            "LEAD_TIME_UNAVAILABLE",
            "ACTIVITY_UNAVAILABLE",
            "CLASSIFICATION_REVIEW_REQUIRED",
          ].includes(issue),
        )),
  );
  const summarize = (items: typeof rows) => {
    const quantity = items.reduce(
        (sum, r) =>
          r.recommendedQuantity === null ? sum : sum.add(r.recommendedQuantity),
        D(0),
      ),
      amount = items.reduce(
        (sum, r) =>
          r.purchaseAmount === null ? sum : sum.add(r.purchaseAmount),
        D(0),
      );
    const unknownQuantitySkuCount = items.filter(
        (r) => r.recommendedQuantity === null,
      ).length,
      unknownAmountSkuCount = items.filter(
        (r) => r.purchaseAmount === null,
      ).length;
    return {
      skuCount: items.length,
      positiveSkuCount: items.filter(
        (r) => r.recommendedQuantity !== null && D(r.recommendedQuantity).gt(0),
      ).length,
      knownQuantity: quantity.toFixed(),
      quantity: unknownQuantitySkuCount ? null : quantity.toFixed(),
      coveredPurchaseAmount: amount.toFixed(),
      purchaseAmount: unknownAmountSkuCount ? null : amount.toFixed(),
      unknownQuantitySkuCount,
      unknownAmountSkuCount,
      exportEligibleSkuCount: items.filter((r) => r.exportEligible).length,
    };
  };
  const supplierBuckets = new Map<string, typeof rows>(),
    currencyBuckets = new Map<string | null, typeof rows>();
  for (const row of rows) {
    const key = JSON.stringify([row.policy.supplierId, row.currency]);
    const group = supplierBuckets.get(key) ?? [];
    group.push(row);
    supplierBuckets.set(key, group);
    const currency = currencyBuckets.get(row.currency) ?? [];
    currency.push(row);
    currencyBuckets.set(row.currency, currency);
  }
  const suppliers = [...supplierBuckets]
    .sort(([a], [b]) => compare(a, b))
    .map(([, items]) => ({
      supplierId: items[0].policy.supplierId,
      supplierName: items[0].supplierName,
      currency: items[0].currency,
      ...summarize(items),
      skuIds: items.map((r) => r.skuId).sort(compare),
    }));
  const currencies = [...currencyBuckets]
    .sort(([a], [b]) => compare(a ?? "", b ?? ""))
    .map(([currency, items]) => ({ currency, ...summarize(items) }));
  rows.sort(
    (a, b) =>
      Number(b.urgency === "RED") - Number(a.urgency === "RED") ||
      (a.daysToZero === null || b.daysToZero === null
        ? a.daysToZero === b.daysToZero
          ? 0
          : a.daysToZero === null
            ? 1
            : -1
        : D(a.daysToZero).cmp(b.daysToZero)) ||
      compare(a.skuId, b.skuId),
  );
  const summary = summarize(rows);
  const previewId = payloadHash({
    kind: "REORDERING_PREVIEW",
    version: REORDERING_VERSION,
    snapshotId: inputs.snapshotId,
    mode: request.mode,
    filters: request.filters,
    parameters: request.parameters,
    overrides: request.overrides,
  });
  return {
    previewId,
    snapshotId: inputs.snapshotId,
    calculationVersion: REORDERING_VERSION,
    asOf: inputs.asOf,
    mode: request.mode,
    filters: request.filters,
    parameters: request.parameters,
    overrides: request.overrides,
    canExport:
      summary.exportEligibleSkuCount > 0 &&
      rows.every(
        (r) =>
          r.recommendedQuantity !== null &&
          (D(r.recommendedQuantity).isZero() || r.exportEligible),
      ),
    counts: {
      sourceSkuCount: inputs.rows.length,
      shownSkuCount: rows.length,
      shortageSkuCount: rows.filter((r) => r.shortage).length,
      offSeasonSkuCount: rows.filter((r) =>
        r.exclusionReasons.includes("OFF_SEASON"),
      ).length,
      reviewSkuCount: rows.filter((r) => r.state === "REVIEW").length,
      exportEligibleSkuCount: summary.exportEligibleSkuCount,
    },
    totals: {
      knownQuantity: summary.knownQuantity,
      quantity: summary.quantity,
      unknownQuantitySkuCount: summary.unknownQuantitySkuCount,
    },
    currencies,
    suppliers,
    rows,
  };
}
