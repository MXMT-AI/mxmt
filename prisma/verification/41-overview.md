# Overview O1–O8 (#41)

The Overview replaces the navigation-only destination at `/overview`. It reuses
#40 filters, i18n, theme and link helpers, and consumes the tenant-authenticated
#39 snapshot APIs. No AI service generates the summary.

## Display and reconciliation contract

| Block    | Source and behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1       | Localized templates from the same O2/stock aggregates. Brand contributors appear only when the absolute LY change is at least 5%; select up to three matching the change direction, ordered by absolute money delta and stable ID. The LY note requires one sale order to exceed 50% of its brand's full calendar-month net revenue, using the same channel/currency/brand filters; category/SKU/search do not shrink the brand-month denominator (shared with #42). Missing comparison falls back to a known plan attainment; no comparison or plan means no first sentence. |
| O2       | Existing revenue, distinct sale-order count, target, expected target, attainment and pace fields. Plan colors use unrounded pace (1 / 0.8 thresholds), which equals attainment for complete months. Missing plans link to Settings; explicit zero targets and LY=0 have non-dividing states. Client targets are labeled as unallocated when actuals are filtered.                                                                                                                       |
| O2 trend | Frozen monthly current/LY facts from January through the selected interval's final date. A proven empty month is zero; unproven history remains unavailable. Profit coverage is not used as a proxy for revenue-history completeness. A paired SVG includes a table for assistive technology; chart coordinates alone use floating-point presentation values.                                                                                                                           |
| O3       | Covered GP, covered margin, threshold and LY reuse the financial engine. Missing profit lines, covered revenue and incomplete coverage remain explicit. No client financial formula is added.                                                                                                                                                                                                                                                                                           |
| O4       | Stock value/units, turnover, availability and canonical status subtotals use the shared stock finalizer. Currency panels use their own availability denominator. Status structure includes the canonical saved classifications; non-merchandise is not valued as physical inventory. Ownership splits retain UNKNOWN and link unverified brand groups to Settings.                                                                                                                      |
| O5       | The same DEAD subtotal used by Stock and Repricing. Zero DEAD count has no action. The explanatory threshold comes from the saved settings, not prototype constants.                                                                                                                                                                                                                                                                                                                    |
| O6       | The RISK subtotal and observed min/max WOH, linking to Stock with `classification=RISK`.                                                                                                                                                                                                                                                                                                                                                                                                |
| O7       | The saved shortage union, counted once per SKU; off-season SKUs are reported separately and excluded from that count. Links to Reordering's shortage mode.                                                                                                                                                                                                                                                                                                                              |
| O8       | Rank brands by DEAD stock cost in each currency; display the winning brand's full stock/units, first verified supplier receipt and STR since that receipt. Missing DEAD cost prevents inventing a winner. Incomplete full-brand valuation or cohort coverage stays unavailable/partial.                                                                                                                                                                                                 |

Money is never combined across currencies. Distinct order counts and ratios are
not additive across SKU/brand rows: details reuse the same server summary rather
than summing displayed order counts. Source diagnostics are labeled as source
scope; financial coverage labels apply to their respective metrics.

All detail/action links carry the snapshot ID, period, channel, currency and
explicit dimensions. Destination-specific controls (`metric`, classification,
grouping and reorder mode) survive relevant detail navigation without leaking
stock-only controls into Sales. Monobrand links skip brand grouping. O5–O8 open
the routes prepared in #40; scenario execution and exports remain later tasks.

## Frozen supporting facts and compatibility

Migration: `20261025040000_overview_supporting_facts`.

Screen model version **2** adds nullable business dates and supporting membership
to the existing fact table. Snapshot publication materializes the selected
financial period, a YTD financial context, and the exact daily SKU version in one
repeatable-read transaction. Both financial contexts must agree on source and
settings. Their IDs enter the snapshot key; the YTD calculation ID/period/version
are exposed in `context.trend`.

The union of facts is deduplicated by line ID and capped at 100,000 rows. The daily
engine's existing 20,000-SKU bound remains. Supporting facts include the full LY
months needed by outlier checks; their presence cannot inflate selected-period
cards or tables because ordinary reads require current/LY period membership.
Stock aggregation and brand/status/ownership grouping use set-based SQL and shared
finalizers, with no per-SKU or per-brand database lookup.

YTD history is optional: a typed `SalesReportError` with `SALES_INPUT_LIMIT`, or a
merged selection exceeding 100,000 facts, omits the trend context and materializes
only main-period facts. The fallback has its own stable cache key with no trend
calculation ID and exposes `trendUnavailableReason=INPUT_LIMIT`. Period sales,
stock and action counts remain available; the chart and supporting LY outlier
notes are unavailable. The localized message describes the history-volume limit
rather than promising that refreshing an older snapshot will fix it. Main-report
limits, unrelated failures and provenance mismatches still fail atomically; they
are not swallowed as optional-history errors.

Version-1 screen snapshots remain readable. Their absent dates are not backfilled
or invented; their chart requests a refresh rather than presenting fabricated
history. `SCREEN_SNAPSHOT_V1` remains the manifest-format marker, independently of
the screen read-model version. SQL membership/date CHECK constraints must be
preserved in later Prisma migrations.

The client pins the published ID in the URL, aborts superseded requests and gates
visible data by the selected filter signature and snapshot. It validates period
and as-of agreement before display. Refresh explicitly creates/reuses an aligned
snapshot; ordinary navigation keeps the pinned one. Old results cannot briefly
appear under newly selected filters. Source freshness can change independently of
saved metric values. Stock business date and order watermark are labeled
separately; the order watermark does not certify each inventory observation time.

## Verification and rollout

```sh
npx vitest run tests/lib/merchandising-overview.test.ts tests/lib/merchandising-screen-store.test.ts tests/lib/merchandising-navigation.test.ts
npm test -- --maxWorkers=2
npx prisma validate
npx tsc --noEmit
npm run build
git diff --check
```

PGlite tests apply all migrations to synthetic tenants and verify KPI/detail/trend
reconciliation, strict 5% and 50% boundaries, partial-month pace, currency and
channel isolation, ownership, shortage counting, zero/unknown values, missing LY
history, saved snapshots after source/settings edits and localized action routes.

Browser verification uses the actual components with a temporary local router
adapter and synthetic API responses. It checks initial publication/URL pinning,
missing-snapshot recovery, channel changes with unchanged stock, DEAD action
navigation, Back/reload, English/Ukrainian and both existing themes. Responsive
checks use a 390px iframe, not a physical touch device. This does not certify a
production authenticated session or customer benchmark acceptance.

Apply the additive migration to an isolated staging database before application
deployment. Check representative YTD volume and query plans against the existing
45-second transaction timeout; route `maxDuration` does not extend it. Record a
restore point and use the rollout guidance in #39. Prefer application rollback
with the additive schema retained and a forward fix; older applications reject
newer snapshot versions rather than mixing results. No production migration,
import, deployment or Zavod threshold sign-off is performed by this task. #38's
customer acceptance remains separate.
