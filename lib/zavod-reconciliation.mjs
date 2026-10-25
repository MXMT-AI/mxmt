import { Temporal } from "@js-temporal/polyfill";
import { createHash } from "node:crypto";
import { financialDecimal as D } from "./financial-decimal.mjs";

const statuses = [
  "SERVICE",
  "DATA_ERROR",
  "NEW",
  "OFF_SEASON",
  "OOS",
  "DEAD",
  "RISK",
  "HEALTHY",
];
const period = {
  from: "2026-09-01",
  to: "2026-09-30",
  lyFrom: "2025-09-01",
  lyTo: "2025-09-30",
};
const validDate = (v) => {
  try {
    return (
      typeof v === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      Temporal.PlainDate.from(v).toString() === v
    );
  } catch {
    return false;
  }
};
const observedDate = (v) => {
  try {
    return Temporal.Instant.from(v)
      .toZonedDateTimeISO("Europe/Kyiv")
      .toPlainDate()
      .toString();
  } catch {
    return null;
  }
};
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) => typeof v === "string" && v.trim().length > 0;
const decimal = (v) => {
  if (typeof v === "number" && Number.isSafeInteger(v)) return D(v);
  return typeof v === "string" && v.length <= 100 && /^-?\d+(\.\d+)?$/.test(v)
    ? D(v)
    : null;
};
const stable = (v) =>
  Array.isArray(v)
    ? v.map(stable)
    : object(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])]),
        )
      : v;
export const evidenceHash = (value) =>
  createHash("sha256").update(value).digest("hex");

/** Approval binds the actual artifact bytes, fixture revision and scope, not editable approval flags. */
export function reconciliationFingerprint(manifest, artifactHashes) {
  return evidenceHash(
    JSON.stringify(
      stable({
        schemaVersion: manifest.schemaVersion,
        fixtureId: manifest.fixtureId,
        revision: manifest.revision,
        origin: manifest.origin,
        scope: manifest.scope,
        discrepancyExplanation: manifest.discrepancyExplanation,
        artifactHashes,
      }),
    ),
  );
}

/** Decimal comparisons never turn missing or partial amounts into zero or a passing result. */
export function compareBenchmark(
  metric,
  expected,
  actual,
  { complete = true, exact = false, displayPercent = false } = {},
) {
  const target = decimal(expected),
    value = decimal(actual);
  if (!target || !value || !complete)
    return {
      metric,
      expected: target?.toString() ?? null,
      actual: value?.toString() ?? null,
      status: "BLOCKED",
      reason: !target
        ? "TARGET_UNCONFIRMED"
        : !complete
          ? "INCOMPLETE_COVERAGE"
          : "ACTUAL_UNAVAILABLE",
      delta: null,
      relativeDelta: null,
    };
  const shown = displayPercent ? value.mul(100).toDecimalPlaces(1) : value;
  const delta = shown.sub(target);
  const relative = target.isZero() ? null : delta.div(target.abs());
  const match =
    exact || displayPercent || target.isZero()
      ? delta.isZero()
      : delta.abs().lte(target.abs().mul("0.01"));
  return {
    metric,
    expected: target.toString(),
    actual: shown.toString(),
    status: match ? "PASS" : "FAIL",
    reason: match
      ? null
      : displayPercent
        ? "DISPLAY_MARGIN_MISMATCH"
        : "OUTSIDE_TOLERANCE",
    delta: delta.toString(),
    relativeDelta: relative?.toString() ?? null,
  };
}

function validRows(rows) {
  return (
    Array.isArray(rows) &&
    rows.length <= 20000 &&
    rows.every(
      (r) =>
        object(r) &&
        text(r.skuId) &&
        statuses.includes(r.classification) &&
        decimal(r.stockCostValue)?.gte(0),
    ) &&
    new Set(rows.map((r) => r.skuId)).size === rows.length
  );
}
/** Compare supplied historical labels; the legacy 7/30-day classifier is not Sasha's unknown rule. */
export function compareClassification(legacy, daily, alternative, currency) {
  if (!object(daily) || !Array.isArray(daily.rows)) return null;
  const current = daily.rows.filter(
    (r) =>
      object(r) && r.productKind === "MERCHANDISE" && r.currency === currency,
  );
  if (
    !legacy ||
    !text(legacy.ruleVersion) ||
    !validRows(legacy.rows) ||
    !validRows(current) ||
    current.length === 0
  )
    return null;
  const old = new Map(legacy.rows.map((r) => [r.skuId, r]));
  const now = new Map(current.map((r) => [r.skuId, r]));
  const matrix = new Map();
  for (const id of new Set([...old.keys(), ...now.keys()])) {
    const before = old.get(id),
      after = now.get(id);
    const key = `${before?.classification ?? "NOT_IN_OLD"}:${after?.classification ?? "NOT_IN_NEW"}`;
    const cell = matrix.get(key) ?? {
      oldStatus: before?.classification ?? "NOT_IN_OLD",
      newStatus: after?.classification ?? "NOT_IN_NEW",
      skuCount: 0,
      oldStockCost: D(0),
      newStockCost: D(0),
    };
    cell.skuCount++;
    cell.oldStockCost = cell.oldStockCost.add(before?.stockCostValue ?? 0);
    cell.newStockCost = cell.newStockCost.add(after?.stockCostValue ?? 0);
    matrix.set(key, cell);
  }
  const oldDead = legacy.rows.filter((r) => r.classification === "DEAD");
  const alternativeValid =
    alternative && text(alternative.ruleVersion) && validRows(alternative.rows);
  const altDead = alternativeValid
    ? alternative.rows.filter((r) => r.classification === "DEAD")
    : [];
  const altMap = new Map(altDead.map((r) => [r.skuId, r]));
  const altIds = new Set(altMap.keys()),
    oldIds = new Set(oldDead.map((r) => r.skuId));
  const total = (rows) =>
    rows.reduce((sum, r) => sum.add(r.stockCostValue), D(0));
  return {
    oldRuleVersion: legacy.ruleVersion,
    sameStockBasis:
      legacy.asOf === daily.asOf &&
      legacy.currency === currency &&
      legacy.valuation === "COST",
    oldSkuCount: old.size,
    newSkuCount: now.size,
    matrix: [...matrix.values()]
      .sort((a, b) =>
        `${a.oldStatus}:${a.newStatus}`.localeCompare(
          `${b.oldStatus}:${b.newStatus}`,
        ),
      )
      .map((c) => ({
        ...c,
        oldStockCost: c.oldStockCost.toString(),
        newStockCost: c.newStockCost.toString(),
      })),
    alternative: !alternativeValid
      ? null
      : {
          ruleVersion: alternative.ruleVersion,
          sameStockBasis:
            alternative.asOf === legacy.asOf &&
            alternative.currency === currency &&
            alternative.valuation === "COST",
          oldDeadCost: total(oldDead).toString(),
          alternativeDeadCost: total(altDead).toString(),
          costDifference: total(oldDead).sub(total(altDead)).toString(),
          oldDeadSkuCount: oldDead.length,
          alternativeDeadSkuCount: altDead.length,
          onlyOldSkuCount: oldDead.filter((r) => !altIds.has(r.skuId)).length,
          onlyAlternativeSkuCount: altDead.filter((r) => !oldIds.has(r.skuId))
            .length,
          onlyOldCost: total(
            oldDead.filter((r) => !altIds.has(r.skuId)),
          ).toString(),
          onlyAlternativeCost: total(
            altDead.filter((r) => !oldIds.has(r.skuId)),
          ).toString(),
          sharedValueDifference: oldDead
            .filter((r) => altIds.has(r.skuId))
            .reduce(
              (s, r) =>
                s.add(r.stockCostValue).sub(altMap.get(r.skuId).stockCostValue),
              D(0),
            )
            .toString(),
        },
  };
}

/** Evaluate frozen #35/#37 publications. This does not re-import source data or approve its accounting meaning.
 * @param {Record<string, any>} input Private package contents; never commit customer packages/reports.
 */
export function reconcileZavod(input) {
  const {
    reference,
    sales,
    daily,
    settings,
    legacy,
    alternative,
    manifest = {},
    artifactHashes = {},
  } = input;
  if (
    !object(reference) ||
    reference.schemaVersion !== 1 ||
    !object(reference.metrics) ||
    !object(reference.period) ||
    !Array.isArray(reference.channels)
  )
    throw new Error("INVALID_REFERENCE");
  const blockers = new Set();
  const block = (condition, code) => {
    if (!condition) blockers.add(code);
  };
  const fingerprint = reconciliationFingerprint(manifest, artifactHashes);
  block(
    manifest.schemaVersion === 1 &&
      text(manifest.fixtureId) &&
      Number.isSafeInteger(manifest.revision) &&
      manifest.revision > 0,
    "FIXTURE_VERSION_REQUIRED",
  );
  block(manifest.origin === "VERIFIED_CUSTOMER", "CUSTOMER_EVIDENCE_REQUIRED");
  block(reference.authority === "CONFIRMED", "BENCHMARKS_UNCONFIRMED");
  for (const kind of [
    "reference",
    "sales",
    "daily",
    "settings",
    "source",
    "legacy",
    "alternative",
  ]) {
    const actualHash = artifactHashes[kind],
      expectedHash = manifest.artifacts?.[kind]?.sha256;
    block(
      typeof actualHash === "string" &&
        /^[a-f0-9]{64}$/.test(actualHash) &&
        actualHash === expectedHash,
      `FROZEN_${kind.toUpperCase()}_EVIDENCE_REQUIRED`,
    );
  }
  const scope = manifest.scope ?? {};
  block(
    scope.currency === "UAH" &&
      reference.currency === "UAH" &&
      scope.timezone === "Europe/Kyiv" &&
      reference.timezone === scope.timezone,
    "CURRENCY_OR_TIMEZONE_UNCONFIRMED",
  );
  block(
    text(scope.sourceId) &&
      sales?.provenance?.sourceId === scope.sourceId &&
      daily?.provenance?.sourceId === scope.sourceId,
    "SOURCE_SCOPE_MISMATCH",
  );
  block(
    Object.entries(period).every(
      ([key, value]) =>
        reference.period[key] === value && sales?.period?.[key] === value,
    ),
    "FINANCIAL_PERIOD_MISMATCH",
  );
  block(
    validDate(reference.stockDate) &&
      reference.stockDate === scope.stockDate &&
      daily?.asOf === scope.stockDate &&
      daily?.period?.timezone === scope.timezone,
    "STOCK_OBSERVATION_DATE_UNCONFIRMED",
  );
  block(
    text(sales?.calculationRunId) &&
      sales?.calculationVersion === 1 &&
      text(daily?.calculationId) &&
      daily?.calculationVersion === 2,
    "FROZEN_CALCULATION_VERSION_REQUIRED",
  );
  block(
    text(settings?.id) &&
      settings?.id === sales?.provenance?.clientConfigId &&
      settings?.id === daily?.provenance?.clientConfigId,
    "SETTINGS_SNAPSHOT_MISMATCH",
  );
  const v = settings?.values;
  block(
    v?.schemaVersion === 1 &&
      [
        "deadDays",
        "healthyWohWeeks",
        "riskWohWeeks",
        "newProductWeeks",
        "minMarginPct",
        "turnoverMonths",
        "leadDays",
        "coverDays",
        "moq",
      ].every((k) => typeof v[k] === "number" && Number.isFinite(v[k])) &&
      [60, 90, 120].includes(v.deadDays) &&
      v.healthyWohWeeks > 0 &&
      v.riskWohWeeks > v.healthyWohWeeks &&
      Number.isInteger(v.newProductWeeks) &&
      v.newProductWeeks >= 0 &&
      v.minMarginPct >= 0 &&
      v.minMarginPct <= 100 &&
      v.turnoverMonths > 0 &&
      Number.isInteger(v.leadDays) &&
      v.leadDays >= 0 &&
      Number.isInteger(v.coverDays) &&
      v.coverDays >= 0 &&
      Number.isInteger(v.moq) &&
      v.moq >= 1,
    "SETTINGS_SNAPSHOT_REQUIRED",
  );
  const current = sales?.summary?.find(
    (r) => r.currency === reference.currency,
  )?.current;
  const ly = sales?.summary?.find((r) => r.currency === reference.currency)?.ly;
  const salesReady =
    sales?.history?.current === true &&
    sales?.provenance?.sourceBusy === false &&
    current?.missingRevenueCount === 0;
  const lyReady =
    sales?.history?.ly === true &&
    sales?.provenance?.sourceBusy === false &&
    ly?.missingRevenueCount === 0;
  const stock = daily?.summary?.byCurrency?.find(
    (r) => r.currency === reference.currency,
  );
  const rows = Array.isArray(daily?.rows) ? daily.rows : [];
  const rowSetComplete =
    Number.isSafeInteger(daily?.rowCount) &&
    rows.length === daily.rowCount &&
    new Set(rows.map((r) => r.skuId)).size === rows.length;
  block(rowSetComplete, "COMPLETE_FROZEN_SKU_ROWS_REQUIRED");
  const merchandise = rows.filter((r) => r.productKind === "MERCHANDISE");
  block(
    rows.every((r) =>
      ["MERCHANDISE", "SERVICE", "GIFT_CARD"].includes(r.productKind),
    ),
    "PRODUCT_POPULATION_UNVERIFIED",
  );
  block(
    !merchandise.some((r) => r.currency !== reference.currency),
    "MIXED_STOCK_CURRENCIES_REQUIRE_SCOPE_REVIEW",
  );
  const physical = merchandise.filter((r) => r.currency === reference.currency);
  block(
    physical.every(
      (r) =>
        r.asOf === scope.stockDate &&
        text(r.snapshotId) &&
        observedDate(r.sourceObservedAt) === scope.stockDate,
    ),
    "ACTUAL_STOCK_OBSERVATION_REQUIRED",
  );
  const quantitySum = physical.every((r) => decimal(r.quantity)?.gte(0))
    ? physical.reduce((s, r) => s.add(r.quantity), D(0))
    : null;
  const valueSum = physical.every((r) => decimal(r.stockCostValue)?.gte(0))
    ? physical.reduce((s, r) => s.add(r.stockCostValue), D(0))
    : null;
  const stockReady =
    rowSetComplete &&
    daily?.provenance?.sourceBusy === false &&
    stock?.missingCostSkuCount === 0 &&
    stock?.missingQuantitySkuCount === 0 &&
    valueSum !== null &&
    decimal(stock?.stockCost)?.eq(valueSum) === true &&
    quantitySum !== null &&
    decimal(stock?.quantity)?.eq(quantitySum) === true;
  block(stockReady, "STOCK_COVERAGE_OR_SUM_MISMATCH");
  block(salesReady && lyReady, "SALES_HISTORY_OR_REVENUE_INCOMPLETE");
  block(
    current?.coverage === "COMPLETE" &&
      ly?.coverage === "COMPLETE" &&
      current?.missingProfitCount === 0 &&
      ly?.missingProfitCount === 0,
    "PROFIT_COVERAGE_INCOMPLETE",
  );
  const target = reference.metrics;
  const checks = [
    compareBenchmark("revenue", target.revenue, current?.revenue, {
      complete: salesReady,
    }),
    compareBenchmark(
      "grossProfit",
      target.grossProfit,
      current?.coveredGrossProfit,
      {
        complete:
          salesReady &&
          current?.coverage === "COMPLETE" &&
          current?.missingProfitCount === 0,
      },
    ),
    compareBenchmark(
      "marginPercentDisplay",
      target.marginPercentDisplay,
      current?.gmPct,
      {
        complete: salesReady && current?.coverage === "COMPLETE",
        displayPercent: true,
      },
    ),
    compareBenchmark("lyRevenue", target.lyRevenue, ly?.revenue, {
      complete: lyReady,
    }),
    compareBenchmark(
      "lyGrossProfit",
      target.lyGrossProfit,
      ly?.coveredGrossProfit,
      {
        complete:
          lyReady &&
          ly?.coverage === "COMPLETE" &&
          ly?.missingProfitCount === 0,
      },
    ),
    compareBenchmark("stockCost", target.stockCost, stock?.stockCost, {
      complete: stockReady,
    }),
    compareBenchmark("stockUnits", target.stockUnits, stock?.quantity, {
      complete: stockReady,
      exact: true,
    }),
    compareBenchmark("orderCount", target.orderCount, current?.orderCount, {
      complete: salesReady,
      exact: true,
    }),
    compareBenchmark("salesUnits", target.salesUnits, current?.units, {
      complete: salesReady,
      exact: true,
    }),
  ];
  const channels = Array.isArray(sales?.channels)
    ? sales.channels.filter((r) => r.currency === reference.currency)
    : [];
  const knownChannels =
    reference.channels.every((r) => text(r.id) && decimal(r.revenue)) &&
    new Set(reference.channels.map((r) => r.id)).size ===
      reference.channels.length;
  block(knownChannels, "CHANNEL_IDENTITIES_UNCONFIRMED");
  if (knownChannels)
    for (const expected of reference.channels) {
      const actual = channels.find((r) => r.id === expected.id)?.current;
      checks.push(
        compareBenchmark(
          `channel:${expected.id}`,
          expected.revenue,
          actual?.revenue,
          { complete: salesReady && actual?.missingRevenueCount === 0 },
        ),
      );
    }
  block(
    channels.length === reference.channels.length &&
      channels.every((r) => reference.channels.some((e) => e.id === r.id)),
    "CHANNEL_POPULATION_MISMATCH",
  );
  const channelSum = channels.every((r) => decimal(r.current?.revenue))
    ? channels.reduce((s, r) => s.add(r.current.revenue), D(0))
    : null;
  block(
    channelSum !== null && decimal(current?.revenue)?.eq(channelSum) === true,
    "CHANNEL_HEADLINE_SUM_MISMATCH",
  );
  const comparison = compareClassification(
    legacy,
    daily,
    alternative,
    reference.currency,
  );
  block(
    comparison?.sameStockBasis === true,
    "OLD_CLASSIFICATION_SCOPE_UNCONFIRMED",
  );
  block(
    comparison?.alternative?.sameStockBasis === true &&
      text(manifest.discrepancyExplanation?.cause) &&
      text(manifest.discrepancyExplanation?.evidenceRef),
    "CLASSIFICATION_DISCREPANCY_UNEXPLAINED",
  );
  const approval = (kind, role) =>
    Array.isArray(manifest.approvals) &&
    manifest.approvals.some(
      (a) =>
        a.kind === kind &&
        a.role === role &&
        text(a.actor) &&
        text(a.evidenceRef) &&
        text(a.approvedAt) &&
        Number.isFinite(Date.parse(a.approvedAt)) &&
        Date.parse(a.approvedAt) <= Date.now() &&
        a.fingerprint === fingerprint,
    );
  for (const [kind, role] of [
    ["SOURCE_DATA", "OWNER"],
    ["BENCHMARKS", "OWNER"],
    ["THRESHOLDS", "SASHA"],
    ["THRESHOLDS", "OLIA"],
    ["CLASSIFICATION_REVIEW", "SASHA"],
  ])
    block(approval(kind, role), `APPROVAL_${kind}_${role}_REQUIRED`);
  const oldRef = reference.oldClassification;
  const channelReferenceSum = reference.channels.every((r) =>
    decimal(r.revenue),
  )
    ? reference.channels.reduce((s, r) => s.add(r.revenue), D(0))
    : null;
  return {
    schemaVersion: 1,
    fixtureId: manifest.fixtureId ?? null,
    fixtureRevision: manifest.revision ?? null,
    fingerprint,
    status:
      blockers.size || checks.some((c) => c.status === "BLOCKED")
        ? "BLOCKED"
        : checks.some((c) => c.status === "FAIL")
          ? "FAIL"
          : "PASS",
    numericStatus: checks.some((c) => c.status === "FAIL")
      ? "FAIL"
      : checks.some((c) => c.status === "BLOCKED")
        ? "BLOCKED"
        : "PASS",
    blockers: [...blockers].sort(),
    checks,
    classification: comparison,
    calculationIds: {
      sales: sales?.calculationRunId ?? null,
      daily: daily?.calculationId ?? null,
      settings: settings?.id ?? null,
    },
    thresholds: settings?.values
      ? Object.fromEntries(
          [
            "deadDays",
            "healthyWohWeeks",
            "riskWohWeeks",
            "newProductWeeks",
            "minMarginPct",
            "turnoverMonths",
            "leadDays",
            "coverDays",
            "moq",
          ].map((k) => [k, settings.values[k] ?? null]),
        )
      : null,
    diagnostics: Array.isArray(sales?.issues)
      ? sales.issues.map((i) => ({ code: i.code, count: i.count }))
      : [],
    referenceObservations: {
      channelSum: channelReferenceSum?.toString() ?? null,
      channelHeadlineDifference:
        channelReferenceSum && decimal(target.revenue)
          ? D(target.revenue).sub(channelReferenceSum).toString()
          : null,
      oldDeadAlternativeCostDifference:
        decimal(oldRef?.dead?.stockCost) &&
        decimal(oldRef?.alternativeDead?.stockCost)
          ? D(oldRef.dead.stockCost)
              .sub(oldRef.alternativeDead.stockCost)
              .toString()
          : null,
      oldDeadAlternativeSkuDifference:
        decimal(oldRef?.dead?.skuCount) &&
        decimal(oldRef?.alternativeDead?.skuCount)
          ? D(oldRef.dead.skuCount)
              .sub(oldRef.alternativeDead.skuCount)
              .toString()
          : null,
      note: "Reference arithmetic is an observation, not a verified accounting cause. New classification is never forced to reproduce old class totals.",
    },
    provenanceNote:
      "Compare separate immutable engine results against frozen approved source evidence. Matching numbers alone do not approve source mappings, accounting scope or thresholds.",
  };
}
