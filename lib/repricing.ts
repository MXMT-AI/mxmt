import "server-only";
import {
  financialDecimal as D,
  grossProfitForPolicy,
} from "./merchandising-policy";
import { calendarAge } from "./classify";
import { payloadHash } from "./connectors/order-storage";
import { isRecord } from "./api-contracts";
export * from "./repricing-contract";
import {
  REPRICING_VERSION,
  REPRICING_INPUT_LIMIT,
  type RepricingParameters,
  type RepricingFilters,
  type RepricingRequest,
  type RepricingSku,
  type RepricingInputs,
} from "./repricing-contract";
export class RepricingError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
    readonly details: string[] = [],
  ) {
    super(code);
    this.name = "RepricingError";
  }
}
/** Reject client facts, ambiguous numeric coercion, unknown keys and unbounded editing payloads. */
export function parseRepricingRequest(value: unknown): RepricingRequest {
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
  const root = record(
    value,
    [
      "inputSetId",
      "parameters",
      "filters",
      "selection",
      "manualPrices",
      "editContext",
      "page",
      "pageSize",
    ],
    "request",
  );
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
  const decimal = (
    v: unknown,
    path: string,
    places: number,
    positive = false,
  ) => {
    if (
      typeof v !== "string" ||
      !new RegExp(`^(0|[1-9]\\d{0,13})(\\.\\d{1,${places}})?$`).test(v) ||
      (positive && D(v).lte(0))
    ) {
      issues.push(
        path +
          ": expected a " +
          (positive ? "positive" : "non-negative") +
          " decimal string with at most " +
          places +
          " decimal places",
      );
      return "0";
    }
    return D(v).toFixed();
  };
  const integer = (
    v: unknown,
    fallback: number,
    min: number,
    max: number,
    path: string,
    step = 1,
  ) => {
    const n = v === undefined ? fallback : v;
    if (
      typeof n !== "number" ||
      !Number.isSafeInteger(n) ||
      n < min ||
      n > max ||
      (n - min) % step !== 0
    ) {
      issues.push(path + ": invalid integer or step");
      return fallback;
    }
    return n;
  };
  const boolean = (v: unknown, fallback: boolean, path: string) => {
    if (v === undefined) return fallback;
    if (typeof v !== "boolean") {
      issues.push(path + ": expected a boolean");
      return fallback;
    }
    return v;
  };
  const p = record(
    root.parameters,
    [
      "minDiscountPct",
      "maxDiscountPct",
      "sharePct",
      "goal",
      "durationDays",
      "costProtection",
      "liquidation",
      "liquidationReason",
    ],
    "parameters",
  );
  const parameters: RepricingParameters = {
    minDiscountPct: integer(
      p.minDiscountPct,
      15,
      5,
      35,
      "parameters.minDiscountPct",
    ),
    maxDiscountPct: integer(
      p.maxDiscountPct,
      40,
      20,
      60,
      "parameters.maxDiscountPct",
    ),
    sharePct: integer(p.sharePct, 70, 10, 100, "parameters.sharePct", 5),
    goal: (p.goal === undefined
      ? "CAPITAL"
      : p.goal) as RepricingParameters["goal"],
    durationDays: integer(p.durationDays, 10, 4, 14, "parameters.durationDays"),
    costProtection: boolean(
      p.costProtection,
      true,
      "parameters.costProtection",
    ),
    liquidation: boolean(p.liquidation, false, "parameters.liquidation"),
    liquidationReason: null,
  };
  if (!["CAPITAL", "TURNOVER", "SEASON"].includes(parameters.goal))
    issues.push("parameters.goal: unsupported goal");
  if (![4, 10, 14].includes(parameters.durationDays))
    issues.push("parameters.durationDays: expected 4, 10 or 14");
  if (parameters.minDiscountPct > parameters.maxDiscountPct)
    issues.push("parameters.minDiscountPct: cannot exceed maximum discount");
  if (p.liquidationReason !== undefined && p.liquidationReason !== null) {
    if (
      typeof p.liquidationReason !== "string" ||
      !p.liquidationReason.trim() ||
      p.liquidationReason.length > 500
    )
      issues.push("parameters.liquidationReason: invalid reason");
    else parameters.liquidationReason = p.liquidationReason.trim();
  }
  if (
    parameters.liquidation &&
    (parameters.costProtection || !parameters.liquidationReason)
  )
    issues.push(
      "parameters.liquidation: requires costProtection=false and a reason",
    );
  if (!parameters.liquidation && parameters.liquidationReason !== null)
    issues.push("parameters.liquidationReason: requires liquidation=true");
  const f = record(
    root.filters,
    [
      "status",
      "soldMonths",
      "brandId",
      "categoryId",
      "skuId",
      "currency",
      "priceMin",
      "priceMax",
      "stockMin",
      "stockMax",
      "soldMax",
    ],
    "filters",
  );
  const filters: RepricingFilters = {
    status: (f.status === undefined
      ? "DEAD"
      : f.status) as RepricingFilters["status"],
    soldMonths: (f.soldMonths === undefined ? 3 : f.soldMonths) as 1 | 3 | 7,
    currency: "UAH",
  };
  if (!["DEAD", "RISK", "DEAD_OR_RISK"].includes(filters.status))
    issues.push("filters.status: unsupported status");
  if (![1, 3, 7].includes(filters.soldMonths))
    issues.push("filters.soldMonths: expected 1, 3 or 7");
  for (const key of ["brandId", "categoryId", "skuId"] as const)
    if (f[key] !== undefined) filters[key] = id(f[key], "filters." + key);
  if (f.currency !== undefined) {
    if (
      typeof f.currency !== "string" ||
      !/^([A-Z]{3}|__unassigned__)$/.test(f.currency)
    )
      issues.push("filters.currency: invalid currency");
    else filters.currency = f.currency;
  }
  for (const key of [
    "priceMin",
    "priceMax",
    "stockMin",
    "stockMax",
    "soldMax",
  ] as const)
    if (f[key] !== undefined)
      filters[key] = decimal(
        f[key],
        "filters." + key,
        key.startsWith("price") ? 2 : 4,
      );
  for (const [min, max] of [
    ["priceMin", "priceMax"],
    ["stockMin", "stockMax"],
  ] as const)
    if (
      filters[min] !== undefined &&
      filters[max] !== undefined &&
      D(filters[min]!).gt(filters[max]!)
    )
      issues.push("filters." + min + ": cannot exceed maximum");
  const array = (v: unknown, path: string) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > REPRICING_INPUT_LIMIT) {
      issues.push(path + ": invalid or oversized list");
      return [];
    }
    return v;
  };
  const selection = array(root.selection, "selection").map((v, i) => {
    const r = record(v, ["skuId", "included"], `selection.${i}`);
    return {
      skuId: id(r.skuId, `selection.${i}.skuId`),
      included: boolean(r.included, false, `selection.${i}.included`),
    };
  });
  if (
    selection.some(
      (_, i) =>
        !isRecord((root.selection as unknown[])?.[i]) ||
        !("included" in (root.selection as Record<string, unknown>[])[i]),
    )
  )
    issues.push("selection: included is required");
  const manualPrices = array(root.manualPrices, "manualPrices").map((v, i) => {
    const r = record(v, ["skuId", "price"], `manualPrices.${i}`);
    return {
      skuId: id(r.skuId, `manualPrices.${i}.skuId`),
      price: decimal(r.price, `manualPrices.${i}.price`, 2, true),
    };
  });
  for (const [name, list] of [
    ["selection", selection],
    ["manualPrices", manualPrices],
  ] as const)
    if (new Set(list.map((r) => r.skuId)).size !== list.length)
      issues.push(name + ": duplicate SKU identifiers");
  const inputSetId = id(root.inputSetId, "inputSetId");
  let editContext: string | undefined;
  if (root.editContext !== undefined) {
    if (
      typeof root.editContext !== "string" ||
      !/^[a-f0-9]{64}$/.test(root.editContext)
    )
      issues.push("editContext: invalid context");
    else editContext = root.editContext;
  }
  const page = integer(root.page, 1, 1, 100000, "page"),
    pageSize = integer(root.pageSize, 25, 1, 200, "pageSize");
  if (issues.length)
    throw new RepricingError("INVALID_REPRICING_REQUEST", 400, issues);
  return {
    inputSetId,
    parameters,
    filters,
    selection: selection.sort((a, b) => compareId(a.skuId, b.skuId)),
    manualPrices: manualPrices.sort((a, b) => compareId(a.skuId, b.skuId)),
    ...(editContext ? { editContext } : {}),
    page,
    pageSize,
  };
}
const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const knownPositive = (value: string | null) =>
  value !== null && D(value).isFinite() && D(value).gt(0);
/** Canonical status and persisted effective ownership define eligibility, independently of checkbox input. */
export function repricingEligibility(row: RepricingSku) {
  const reasons: string[] = [];
  if (row.productKind !== "MERCHANDISE") reasons.push("NOT_MERCHANDISE");
  if (!["DEAD", "RISK"].includes(row.classification ?? ""))
    reasons.push("STATUS_INELIGIBLE");
  if (!knownPositive(row.quantity)) reasons.push("STOCK_UNAVAILABLE");
  if (row.ownership !== "OWN")
    reasons.push(
      row.ownership === "CONSIGNMENT" ? "CONSIGNMENT" : "OWNERSHIP_UNVERIFIED",
    );
  if (row.currency !== "UAH") reasons.push("CURRENCY_UNSUPPORTED");
  if (!knownPositive(row.currentPrice)) reasons.push("PRICE_UNAVAILABLE");
  if (!knownPositive(row.unitCost)) reasons.push("COST_UNVERIFIED");
  return reasons;
}
/** One reset fence binds edits to their frozen inputs and normalized filter/parameter values. */
export const repricingEditContext = (
  inputSetId: string,
  parameters: RepricingParameters,
  filters: RepricingFilters,
) =>
  payloadHash({
    kind: "REPRICING_EDITS",
    version: REPRICING_VERSION,
    inputSetId,
    parameters,
    filters,
  });
function matches(row: RepricingSku, f: RepricingFilters) {
  if (f.status !== "DEAD_OR_RISK" && row.classification !== f.status)
    return false;
  for (const key of ["brandId", "categoryId", "skuId", "currency"] as const)
    if (f[key] !== undefined && (row[key] ?? "__unassigned__") !== f[key])
      return false;
  if (
    f.priceMin !== undefined &&
    (row.currentPrice === null || D(row.currentPrice).lt(f.priceMin))
  )
    return false;
  if (
    f.priceMax !== undefined &&
    (row.currentPrice === null || D(row.currentPrice).gt(f.priceMax))
  )
    return false;
  if (
    f.stockMin !== undefined &&
    (row.quantity === null || D(row.quantity).lt(f.stockMin))
  )
    return false;
  if (
    f.stockMax !== undefined &&
    (row.quantity === null || D(row.quantity).gt(f.stockMax))
  )
    return false;
  return (
    f.soldMax === undefined ||
    (row.sold[f.soldMonths] !== null &&
      D(row.sold[f.soldMonths]!).lte(f.soldMax))
  );
}
/** R1–R4 price only the validated final selection; no forecast of units sold is invented. */
export function calculateRepricing(
  inputs: RepricingInputs,
  request: RepricingRequest,
) {
  if (
    inputs.id !== request.inputSetId ||
    inputs.rows.length > REPRICING_INPUT_LIMIT ||
    new Set(inputs.rows.map((r) => r.skuId)).size !== inputs.rows.length
  )
    throw new RepricingError("INVALID_REPRICING_INPUTS", 422);
  const { parameters: p, filters: f } = request,
    editContext = repricingEditContext(inputs.id, p, f);
  if (
    (request.selection.length || request.manualPrices.length) &&
    request.editContext !== editContext
  )
    throw new RepricingError("STALE_REPRICING_EDITS", 409, [
      "editContext: filters or parameters changed; reset edits",
    ]);
  const candidates = inputs.rows.filter(
    (r) =>
      ["DEAD", "RISK"].includes(r.classification ?? "") &&
      r.productKind === "MERCHANDISE" &&
      knownPositive(r.quantity),
  );
  const matched = candidates.filter((r) => matches(r, f));
  const choices = (
    idKey: "brandId" | "categoryId",
    nameKey: "brandName" | "categoryName",
  ) => {
    const map = new Map<string, string | null>();
    for (const row of candidates)
      map.set(row[idKey] ?? "__unassigned__", row[nameKey]);
    return [...map]
      .sort(([a], [b]) => compareId(a, b))
      .map(([id, name]) => ({ id, name }));
  };
  const filterOptions = {
    brands: choices("brandId", "brandName"),
    categories: choices("categoryId", "categoryName"),
  };
  const age = (r: RepricingSku) =>
    r.lastSaleDate
      ? calendarAge(r.lastSaleDate, inputs.asOf)
      : r.neverSold && r.firstReceiptDate
        ? calendarAge(r.firstReceiptDate, inputs.asOf)
        : null;
  const eligible = matched.filter(
    (r) =>
      !repricingEligibility(r).length &&
      (p.goal !== "TURNOVER" || age(r) !== null),
  );
  const capital = (r: RepricingSku) => D(r.quantity!).mul(r.unitCost!);
  const ranked = [...eligible].sort(
    (a, b) =>
      (p.goal === "TURNOVER"
        ? age(b)! - age(a)!
        : capital(b).cmp(capital(a))) || compareId(a.skuId, b.skuId),
  );
  const automaticCount = D(ranked.length)
      .mul(p.sharePct)
      .div(100)
      .ceil()
      .toNumber(),
    automaticIds = new Set(ranked.slice(0, automaticCount).map((r) => r.skuId)),
    selectedIds = new Set(automaticIds),
    validIds = new Set(eligible.map((r) => r.skuId));
  for (const entry of [...request.selection, ...request.manualPrices])
    if (!validIds.has(entry.skuId))
      throw new RepricingError("REPRICING_EDIT_INELIGIBLE", 422, [
        "edits: SKU is unavailable, outside the filters or ineligible",
      ]);
  for (const entry of request.selection)
    entry.included
      ? selectedIds.add(entry.skuId)
      : selectedIds.delete(entry.skuId);
  const selected = ranked.filter((r) => selectedIds.has(r.skuId)),
    ranks = new Map(selected.map((r, i) => [r.skuId, i])),
    manual = new Map(request.manualPrices.map((r) => [r.skuId, r.price]));
  const plans = matched.map((r) => {
    const reasons = repricingEligibility(r);
    if (p.goal === "TURNOVER" && age(r) === null)
      reasons.push("LAST_SALE_UNVERIFIED");
    const rank = ranks.get(r.skuId),
      selectionRequested = rank !== undefined,
      manualPrice = manual.has(r.skuId);
    const discount =
      rank === undefined
        ? D(0)
        : p.goal === "SEASON" || selected.length === 1
          ? D(p.maxDiscountPct)
          : D(p.minDiscountPct).add(
              D(p.maxDiscountPct - p.minDiscountPct)
                .mul(selected.length - 1 - rank)
                .div(selected.length - 1),
            );
    let newPrice = r.currentPrice === null ? null : D(r.currentPrice),
      floorLimited = false;
    const priceErrors: string[] = [];
    if (!reasons.length && (selectionRequested || manualPrice)) {
      const floor = D(r.unitCost!).div(10).ceil().mul(10);
      if (manualPrice) newPrice = D(manual.get(r.skuId)!);
      else {
        newPrice = D(r.currentPrice!)
          .mul(D(1).sub(discount.div(100)))
          .div(10)
          .toDecimalPlaces(0, 4)
          .mul(10);
        if (p.costProtection && newPrice.lt(floor)) {
          newPrice = floor;
          floorLimited = true;
        }
      }
      if (newPrice.lte(0)) priceErrors.push("NON_POSITIVE_PRICE");
      if (!manualPrice && newPrice.gt(r.currentPrice!))
        priceErrors.push("AUTOMATIC_PRICE_INCREASE");
      if (p.costProtection && newPrice.lt(floor))
        priceErrors.push("COST_FLOOR_VIOLATION");
      if (
        newPrice.lt(r.unitCost!) &&
        !(p.liquidation && !p.costProtection && p.liquidationReason)
      )
        priceErrors.push("LIQUIDATION_REQUIRED");
      if (manualPrice && priceErrors.length)
        throw new RepricingError(
          "INVALID_MANUAL_REPRICING_PRICE",
          422,
          priceErrors.map((code) => `manualPrices.${r.skuId}: ${code}`),
        );
    }
    const included =
      selectionRequested && !reasons.length && !priceErrors.length;
    const profit =
      newPrice !== null && knownPositive(r.unitCost) && r.ownership === "OWN"
        ? grossProfitForPolicy(
            { ownership: "OWN", commissionRate: null },
            newPrice.toFixed(),
            r.unitCost,
          )
        : null;
    const margin =
      profit !== null && newPrice?.gt(0) ? profit.div(newPrice) : null;
    return {
      ...r,
      eligible: !reasons.length,
      eligibilityReasons: reasons,
      rank: rank ?? null,
      automaticSelected: automaticIds.has(r.skuId),
      selectionRequested,
      selected: included,
      manualPrice,
      floorLimited,
      targetDiscountPct: discount.toFixed(),
      newPrice: newPrice?.toFixed() ?? null,
      effectiveDiscount:
        knownPositive(r.currentPrice) && newPrice !== null
          ? D(1).sub(newPrice.div(r.currentPrice!)).toFixed()
          : null,
      margin: margin?.toFixed() ?? null,
      marginTone: !included
        ? "GRAY"
        : margin === null
          ? "UNAVAILABLE"
          : margin.lt(0)
            ? "RED"
            : margin.lt("0.2")
              ? "AMBER"
              : "GREEN",
      daysWithoutSale: age(r),
      priceErrors,
      frozenCapital:
        knownPositive(r.unitCost) && r.quantity !== null
          ? capital(r).toFixed()
          : null,
      soldUnits: r.sold[f.soldMonths],
    };
  });
  const enabled = plans.filter((r) => r.selected);
  const sums = enabled.reduce(
    (a, r) => ({
      quantity: a.quantity.add(r.quantity!),
      cost: a.cost.add(D(r.quantity!).mul(r.unitCost!)),
      old: a.old.add(D(r.quantity!).mul(r.currentPrice!)),
      revenue: a.revenue.add(D(r.quantity!).mul(r.newPrice!)),
    }),
    { quantity: D(0), cost: D(0), old: D(0), revenue: D(0) },
  );
  const profit = enabled.length
    ? grossProfitForPolicy(
        { ownership: "OWN", commissionRate: null },
        sums.revenue.toFixed(),
        sums.cost.toFixed(),
      )!
    : D(0);
  const blocked = plans.filter(
    (r) => r.selectionRequested && !r.selected,
  ).length;
  const rows = plans.sort((a, b) => {
    if (a.frozenCapital === null || b.frozenCapital === null)
      return a.frozenCapital === b.frozenCapital
        ? compareId(a.skuId, b.skuId)
        : a.frozenCapital === null
          ? 1
          : -1;
    return (
      D(b.frozenCapital).cmp(a.frozenCapital) || compareId(a.skuId, b.skuId)
    );
  });
  const previewId = payloadHash({
    kind: "REPRICING_PREVIEW",
    version: REPRICING_VERSION,
    inputSetId: inputs.id,
    parameters: p,
    filters: f,
    selection: request.selection,
    manualPrices: request.manualPrices,
  });
  return {
    previewId,
    filterOptions,
    inputSetId: inputs.id,
    snapshotId: inputs.snapshotId,
    calculationVersion: REPRICING_VERSION,
    currency: "UAH",
    asOf: inputs.asOf,
    editContext,
    parameters: p,
    filters: f,
    selection: request.selection,
    manualPrices: request.manualPrices,
    canExport: enabled.length > 0 && !blocked,
    counts: {
      sourceSkuCount: inputs.rows.length,
      candidateSkuCount: candidates.length,
      matchedSkuCount: matched.length,
      eligibleSkuCount: eligible.length,
      automaticSelectionCount: automaticCount,
      requestedSelectionCount: selected.length,
      selectedSkuCount: enabled.length,
      blockedSelectedSkuCount: blocked,
      unknownSoldSkuCount: candidates.filter(
        (r) => r.sold[f.soldMonths] === null,
      ).length,
    },
    totals: {
      skuCount: enabled.length,
      quantity: sums.quantity.toFixed(),
      costCapital: sums.cost.toFixed(),
      oldPotentialRevenue: sums.old.toFixed(),
      potentialRevenue: sums.revenue.toFixed(),
      weightedDiscount: sums.old.gt(0)
        ? D(1).sub(sums.revenue.div(sums.old)).toFixed()
        : null,
      grossProfit: profit.toFixed(),
      grossMargin: sums.revenue.gt(0)
        ? profit.div(sums.revenue).toFixed()
        : null,
      durationDays: p.durationDays,
      basis: "ALL_SELECTED_STOCK_SOLD_NOT_A_FORECAST",
    },
    rows,
  };
}
