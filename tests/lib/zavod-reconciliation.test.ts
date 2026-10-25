import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  compareBenchmark,
  compareClassification,
  evidenceHash,
  reconciliationFingerprint,
  reconcileZavod,
} from "@/lib/zavod-reconciliation.mjs";
import { financialDecimal as D } from "@/lib/merchandising-policy";
import { defaultClientSettings } from "@/lib/merchandising-settings";
const provisional = JSON.parse(
  readFileSync(
    new URL(
      "../../prisma/verification/38-zavod-reference.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
// Contract-test aggregates and signatures only. These are NOT customer source fixtures or actual approvals.
function fixture() {
  const reference = structuredClone(provisional);
  reference.authority = "CONFIRMED";
  reference.stockDate = "2026-09-30";
  reference.channels.forEach((c: any, i: number) => {
    c.id = `channel-${i}`;
  });
  reference.channels[3].revenue = "61294"; // a private confirmed target must explain/replace the public rounded discrepancy
  const totals = (revenue: string, profit: string) => ({
    revenue,
    coveredGrossProfit: profit,
    gmPct: D(profit).div(revenue).toString(),
    missingRevenueCount: 0,
    missingProfitCount: 0,
    coverage: "COMPLETE",
    units: "312",
    orderCount: 309,
  });
  const sales = {
    calculationRunId: "CONTRACT-TEST-sales",
    calculationVersion: 1,
    period: reference.period,
    provenance: {
      sourceId: "test-source",
      clientConfigId: "test-settings",
      sourceBusy: false,
    },
    history: { current: true, ly: true },
    summary: [
      {
        currency: "UAH",
        current: totals("1156812", "525595"),
        ly: totals("1583791", "726565"),
      },
    ],
    channels: reference.channels.map((c: any) => ({
      id: c.id,
      currency: "UAH",
      current: { revenue: c.revenue, missingRevenueCount: 0 },
    })),
    issues: [],
  };
  const row = {
    skuId: "CONTRACT-TEST-SKU",
    productKind: "MERCHANDISE",
    currency: "UAH",
    asOf: "2026-09-30",
    snapshotId: "test-snapshot",
    sourceObservedAt: "2026-09-30T03:00:00+03:00",
    classification: "HEALTHY",
    stockCostValue: "11250000",
    quantity: "4871",
  };
  const daily = {
    calculationId: "CONTRACT-TEST-daily",
    calculationVersion: 2,
    asOf: "2026-09-30",
    rowCount: 1,
    period: { timezone: "Europe/Kyiv" },
    provenance: {
      sourceId: "test-source",
      clientConfigId: "test-settings",
      sourceBusy: false,
    },
    summary: {
      byCurrency: [
        {
          currency: "UAH",
          stockCost: "11250000",
          quantity: "4871",
          missingCostSkuCount: 0,
          missingQuantitySkuCount: 0,
        },
      ],
    },
    rows: [row],
  };
  const settings = { id: "test-settings", values: defaultClientSettings() };
  const legacy = {
    ruleVersion: "TEST-old",
    asOf: "2026-09-30",
    currency: "UAH",
    valuation: "COST",
    rows: [
      { skuId: row.skuId, classification: "DEAD", stockCostValue: "11250000" },
    ],
  };
  const alternative = {
    ...legacy,
    ruleVersion: "TEST-alternative",
    rows: [] as typeof legacy.rows,
  };
  const artifactHashes = Object.fromEntries(
    [
      "reference",
      "sales",
      "daily",
      "settings",
      "source",
      "legacy",
      "alternative",
    ].map((kind) => [kind, evidenceHash(`CONTRACT-TEST:${kind}`)]),
  );
  const manifest: any = {
    schemaVersion: 1,
    fixtureId: "CONTRACT-TEST-NOT-CUSTOMER-DATA",
    revision: 1,
    origin: "VERIFIED_CUSTOMER",
    scope: {
      sourceId: "test-source",
      stockDate: "2026-09-30",
      currency: "UAH",
      timezone: "Europe/Kyiv",
    },
    artifacts: Object.fromEntries(
      Object.entries(artifactHashes).map(([kind, sha256]) => [
        kind,
        { sha256 },
      ]),
    ),
    discrepancyExplanation: {
      cause: "Test old population excludes different rows",
      evidenceRef: "test:classification-review",
    },
    approvals: [],
  };
  const fingerprint = reconciliationFingerprint(manifest, artifactHashes);
  manifest.approvals = [
    ["SOURCE_DATA", "OWNER"],
    ["BENCHMARKS", "OWNER"],
    ["THRESHOLDS", "SASHA"],
    ["THRESHOLDS", "OLIA"],
    ["CLASSIFICATION_REVIEW", "SASHA"],
  ].map(([kind, role]) => ({
    kind,
    role,
    actor: `TEST-${role}`,
    evidenceRef: "test:approval",
    approvedAt: "2026-10-01T12:00:00Z",
    fingerprint,
  }));
  return {
    reference,
    sales,
    daily,
    settings,
    legacy,
    alternative,
    manifest,
    artifactHashes,
  };
}
describe("benchmark numeric comparisons", () => {
  it.each([
    ["990", "PASS"],
    ["1010", "PASS"],
    ["989.999999999999999999", "FAIL"],
    ["1010.000000000000000001", "FAIL"],
  ])("uses inclusive unrounded 1%% boundaries for %s", (actual, status) => {
    expect(compareBenchmark("revenue", "1000", actual).status).toBe(status);
  });
  it("keeps missing/partial amounts blocked and handles zero without division", () => {
    expect(compareBenchmark("profit", "100", null).status).toBe("BLOCKED");
    expect(
      compareBenchmark("profit", "100", "100", { complete: false }).status,
    ).toBe("BLOCKED");
    expect(compareBenchmark("zero", "0", "0")).toMatchObject({
      status: "PASS",
      relativeDelta: null,
    });
    expect(compareBenchmark("zero", "0", "0.001").status).toBe("FAIL");
    expect(compareBenchmark("bad", "100", "NaN").status).toBe("BLOCKED");
  });
  it("checks exact counts and rounded display margin with ratio inputs", () => {
    expect(compareBenchmark("orders", "309", 310, { exact: true }).status).toBe(
      "FAIL",
    );
    expect(
      compareBenchmark(
        "margin",
        "45.4",
        D("525595").div("1156812").toString(),
        { displayPercent: true },
      ).status,
    ).toBe("PASS");
    expect(
      compareBenchmark("margin", "45.4", "45.4", { displayPercent: true })
        .status,
    ).toBe("FAIL");
  });
});
describe("frozen reconciliation and acceptance gates", () => {
  it("does not turn public reference numbers into accepted customer results", () => {
    const result = reconcileZavod({ reference: provisional });
    expect(result).toMatchObject({
      status: "BLOCKED",
      numericStatus: "BLOCKED",
      referenceObservations: {
        channelSum: "1156811",
        channelHeadlineDifference: "1",
        oldDeadAlternativeCostDifference: "1050000",
        oldDeadAlternativeSkuDifference: "139",
      },
    });
    expect(result.blockers).toContain("CUSTOMER_EVIDENCE_REQUIRED");
    expect(result.blockers).toContain("STOCK_OBSERVATION_DATE_UNCONFIRMED");
  });
  it("accepts the complete contract only with matching bound evidence and sign-offs", () => {
    const result = reconcileZavod(fixture());
    expect(result.status).toBe("PASS");
    expect(result.blockers).toEqual([]);
    expect(result.classification?.matrix).toContainEqual(
      expect.objectContaining({
        oldStatus: "DEAD",
        newStatus: "HEALTHY",
        skuCount: 1,
      }),
    );
  });
  it("blocks synthetic fixtures even when all numbers match", () => {
    const input = fixture();
    input.manifest.origin = "SYNTHETIC";
    expect(reconcileZavod(input).blockers).toContain(
      "CUSTOMER_EVIDENCE_REQUIRED",
    );
  });
  it("requires both customer threshold approvers despite owner policy approval", () => {
    const input = fixture();
    input.manifest.approvals = input.manifest.approvals.filter(
      (a: any) => a.role !== "OLIA",
    );
    expect(reconcileZavod(input).blockers).toContain(
      "APPROVAL_THRESHOLDS_OLIA_REQUIRED",
    );
  });
  it("invalidates approvals after artifact, revision or scope changes", () => {
    const input = fixture();
    input.artifactHashes.sales = evidenceHash("changed");
    expect(reconcileZavod(input).blockers).toEqual(
      expect.arrayContaining([
        "FROZEN_SALES_EVIDENCE_REQUIRED",
        "APPROVAL_BENCHMARKS_OWNER_REQUIRED",
      ]),
    );
    const next = fixture();
    next.manifest.revision = 2;
    expect(reconcileZavod(next).blockers).toContain(
      "APPROVAL_THRESHOLDS_SASHA_REQUIRED",
    );
    const scope = fixture();
    scope.manifest.scope.stockDate = "2026-10-25";
    expect(reconcileZavod(scope).blockers).toContain(
      "STOCK_OBSERVATION_DATE_UNCONFIRMED",
    );
  });
  it("rejects partial GP even when the covered sum equals the target", () => {
    const input = fixture();
    input.sales.summary[0].current.coverage = "PARTIAL";
    const result = reconcileZavod(input);
    expect(
      result.checks.find((r: any) => r.metric === "grossProfit")?.status,
    ).toBe("BLOCKED");
    expect(result.blockers).toContain("PROFIT_COVERAGE_INCOMPLETE");
  });
  it("does not compare current snapshots as September end-of-month stock", () => {
    const input = fixture();
    input.daily.rows[0].sourceObservedAt = "2026-10-25T03:00:00+03:00";
    expect(reconcileZavod(input).blockers).toContain(
      "ACTUAL_STOCK_OBSERVATION_REQUIRED",
    );
  });
  it("blocks incomplete pages, mixed currencies, missing stock cost and mismatched settings", () => {
    const page = fixture();
    page.daily.rowCount = 2;
    expect(reconcileZavod(page).blockers).toContain(
      "COMPLETE_FROZEN_SKU_ROWS_REQUIRED",
    );
    const currency = fixture();
    currency.daily.rows[0].currency = "USD";
    expect(reconcileZavod(currency).blockers).toContain(
      "MIXED_STOCK_CURRENCIES_REQUIRE_SCOPE_REVIEW",
    );
    const unknown = fixture();
    unknown.daily.rows[0].productKind = "UNKNOWN";
    expect(reconcileZavod(unknown).blockers).toContain(
      "PRODUCT_POPULATION_UNVERIFIED",
    );
    const cost = fixture();
    cost.daily.summary.byCurrency[0].missingCostSkuCount = 1;
    expect(
      reconcileZavod(cost).checks.find((r: any) => r.metric === "stockCost")
        ?.status,
    ).toBe("BLOCKED");
    const settings = fixture();
    settings.settings.id = "changed";
    expect(reconcileZavod(settings).blockers).toContain(
      "SETTINGS_SNAPSHOT_MISMATCH",
    );
  });
  it("checks channel identity and exact headline sums independently from amount tolerance", () => {
    const input = fixture();
    input.sales.channels[0].current.revenue = "522125";
    const result = reconcileZavod(input);
    expect(
      result.checks.find((r: any) => r.metric === "channel:channel-0")?.status,
    ).toBe("PASS");
    expect(result.blockers).toContain("CHANNEL_HEADLINE_SUM_MISMATCH");
  });
  it("reports numeric failure separately from missing evidence", () => {
    const input = fixture();
    input.sales.summary[0].current.revenue = "1000000";
    input.manifest.approvals = [];
    expect(reconcileZavod(input)).toMatchObject({
      status: "BLOCKED",
      numericStatus: "FAIL",
    });
  });
});
describe("old/new classification and alternative population bridge", () => {
  it("attributes value changes to population differences and shared SKU valuation", () => {
    const input = fixture();
    input.legacy.rows = [
      { skuId: "a", classification: "DEAD", stockCostValue: "100" },
      { skuId: "b", classification: "DEAD", stockCostValue: "60" },
    ];
    input.alternative.rows = [
      { skuId: "b", classification: "DEAD", stockCostValue: "50" },
      { skuId: "c", classification: "DEAD", stockCostValue: "20" },
    ];
    const result = compareClassification(
      input.legacy,
      input.daily,
      input.alternative,
      "UAH",
    );
    expect(result?.alternative).toMatchObject({
      oldDeadCost: "160",
      alternativeDeadCost: "70",
      costDifference: "90",
      onlyOldCost: "100",
      onlyAlternativeCost: "20",
      sharedValueDifference: "10",
      onlyOldSkuCount: 1,
      onlyAlternativeSkuCount: 1,
    });
    expect(result?.matrix).toContainEqual(
      expect.objectContaining({
        oldStatus: "NOT_IN_OLD",
        newStatus: "HEALTHY",
      }),
    );
  });
  it("does not invent an old rule or accept duplicate SKU identities", () => {
    const input = fixture();
    input.legacy.ruleVersion = "";
    expect(
      compareClassification(
        input.legacy,
        input.daily,
        input.alternative,
        "UAH",
      ),
    ).toBeNull();
    input.legacy.ruleVersion = "TEST";
    input.legacy.rows.push(input.legacy.rows[0]);
    expect(
      compareClassification(
        input.legacy,
        input.daily,
        input.alternative,
        "UAH",
      ),
    ).toBeNull();
  });
});
