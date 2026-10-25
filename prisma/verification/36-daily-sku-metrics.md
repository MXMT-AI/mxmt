# Daily SKU velocity, WOH, STR and availability (#36)

Branch: `feat/36-daily-sku-metrics`.
Policy authority: owner-approved #27 decisions, especially D02, D13–D17 and D21,
plus the versioned client/category settings from #34. Calculation version: **1**.

## API and materialization

`GET /api/data/sku-daily?asOf=2026-10-25` calculates or reuses a tenant-scoped daily
result. Omit `asOf` for the current source business date. Read an existing result
with `?calculationId=<id>`; do not combine a calculation ID with another date.
Authenticated readers may consume derived results, following the #35 contract.

Initial calculation requests accept only the date selection. Follow-up requests
with `page`, `pageSize`, `q`, `sort` or `direction` require `calculationId` (including
explicit default controls), so navigation cannot repeat the source aggregation.
An explicit fresh date request still revalidates the fingerprint and creates a
new immutable version when inputs change; it does not return an unchecked latest
result. Invalid stored timezone/clock values use the generic server-error path,
not the `INVALID_AS_OF` client-error response.

The response contains calculation ID, input fingerprint, formula version, business
date, cutoff/window metadata, source provenance, global summary and a paginated
SKU list. Supported controls: `page`, `pageSize` (1–200, default 25), `q` (up to
200 characters), `sort` (`sku`, `velocityPerWeek`, `weeksOnHand`, `daysToZero`,
`sellThroughRatio`) and `direction`. Search and pagination do not change the
availability or valuation denominator. Frozen reads use saved SKU names/values.

Reuse the existing `SkuDaily` materialization, source models and authorization.
The additive migration `20261025010000_daily_sku_metrics` adds typed quantity,
stock values, days-to-zero, STR and nullable activity fields, plus a JSON metrics
payload. It expands velocity/WOH numeric precision and preserves existing rows.
Full-precision JSON values are authoritative; fixed-scale numeric columns mirror
them for database queries. Future threshold classification must use the unrounded
values, not a displayed or fixed-scale rounded value.

Each calculation has an **inactive derived-input manifest** in MerchandisingConfig
under `calculation:sku-daily:<source>:<date>:<fingerprint>`. It is not an approval or
activation of client business settings. Its ID binds all SKU rows and the saved
summary. An identical input fingerprint returns the same calculation; changed
inputs create another immutable version. Never overwrite an old result.
The `SkuDaily_config_idx` tenant/config/SKU index supports frozen-result reads.

## Calendar and formula decisions

- `asOf` is a validated source-local calendar date, never a future date. The
  reporting timezone is taken from the configured source.
- Velocity uses **84 completed calendar days before asOf**, with a matching
  stock-observation window. For October 25, that is August 2–October 24. Calendar
  arithmetic handles DST; this is not a fixed UTC-hour subtraction.
- A SKU's stock comes only from a provenance-bearing observation on the exact
  requested business date. Keep its actual observation timestamp. A current
  October observation cannot stand in for September stock or previous-day 23:59.
  Legacy/date-only rows without source observation provenance are not evidence.
- Demand uses trusted signed merchandise quantities from the #35 status/date/
  discount normalization: sales plus signed returns/corrections. Returns are
  signed once on their verified event date. Excluded channels/projects and paid
  preorders do not become demand. Honor the approved preorder mapping even if
  a client sale-status list also contains status 33.
- With all 84 valid daily observations, exposure weeks are
  `max(in_stock_observation_days, 28) / 7`. Count observations with quantity > 0;
  missing observations do not become observed stockouts.
- While snapshot history is incomplete, use the agreed temporary fallback:
  `max(28, min(days_since_last_verified_receipt, 84)) / 7`. Mark it explicitly as
  RECEIPT_FALLBACK and retain missing-history diagnostics. A two-day PRINTWORKS
  receipt therefore still uses four weeks, not a fraction of a week. Without
  exposure evidence or complete sales coverage, velocity is unavailable.
- `velocity = net_units_12_weeks / exposure_weeks`,
  `WOH = quantity / velocity`, `days_to_zero = WOH × 7`. Known zero velocity stays
  zero with null WOH/days-to-zero. Return-dominated negative demand is a distinct
  planning state, not a fabricated zero or an import error. No NaN/Infinity is
  persisted or returned.
- STR is `net_sold_since_first_verified_external_receipt / (that_sold + stock)`.
  Its sales endpoint is the last completed day (`cohortWindowTo`), matching the
  daily demand cutoff; stock retains its separately identified observation.
  Require complete cohort sales coverage. This is a first-verified-receipt cohort,
  not inferred lot-level allocation. Later receipts do not reset it. Unverified
  posting, internal movements and non-positive receipt lines do not establish
  first/last supplier receipts. Missing or return-dominated cohort values and a
  zero denominator remain unavailable.
- Active merchandise has a positive sale less than 90 calendar days ago or a
  verified supplier receipt less than 60 days ago, and is currently in season.
  A known recent event proves activity; otherwise incomplete activity history
  stays unknown. Absence of recent receipts requires a completed initial receipt
  scan, a matching current receipt-policy hash and a sufficient receipt watermark;
  a missing/stale receipt scope cannot establish inactivity or a confirmed cohort.
  Services/gift cards do not enter availability. Unknown product
  types remain visible as unknown eligibility. Classification/quarantine
  precedence is the next task, #37; it is not written into `classification` here.
- Availability is distinct active in-stock SKUs / active SKUs. Unknown eligibility
  or unknown stock on an active SKU prevents an exact ratio. Return known counts
  and unknown counts separately. Zero active SKUs means unavailable. Classify the
  unrounded ratio: green ≥ 0.85, amber ≥ 0.70, red < 0.70.
- Cost/retail valuation uses quantity and prices from that dated observation,
  not mutable SKU prices. Missing price or invalid quantity yields unavailable
  value; verified zero quantity has zero value. Separate currencies and covered
  subtotals/missing counts. Do not invent an FX conversion or unknown unit cost.
- Turnover is dated stock cost / (signed COGS over the last three complete
  calendar months / 3). A completed historical month-end includes that month;
  an ongoing month does not. Require complete history, known costs and matching
  currency. Zero/negative COGS produces no turnover ratio. Aggregate turnover uses
  aggregate stock/COGS, not an average of SKU ratios. Apply the saved client norm
  and 1.5× norm boundaries before display rounding.

## Consistency, provenance and limits

Calculate and publish in one REPEATABLE READ transaction, using the same bounded
serialization retry as #35. Hash approved settings, metadata, dated observations,
receipt/order aggregates and import coverage. Do not include a ticking request
clock in cache identity when the actual inputs are unchanged. Retain source ID,
config IDs, order watermark, snapshot ID/raw key/import run and input fingerprints.
Roll back the input manifest and all SKU writes if any batch fails.

Reuse #35's import-window coverage and projection trust rules. A current status,
amount/date policy or ingestion filter must match the captured import policy.
Changing exclusions requires replay, including rows previously marked excluded:
they cannot silently become trusted zero sales. Source quarantine, unassigned
order lines, running/recoverable jobs and unverified projections retain incomplete
history states. Missing project mapping also blocks demand when normalization has
already cleared signed amounts. A missing order baseline does not invent zero
demand; dated observed stock can still be retained as an available input.

Receipt coverage additionally requires a completed initial inventory/receipt scan
under the current receipt policy, a matching receipt cursor and no invalid receipt
or version-conflict diagnostic in that baseline/latest scope. Unassigned verified
receipt lines prevent complete receipt coverage. Treat the actual `inventory`
worker resource as in-flight while it is running or awaiting recovery.

Coverage describes imported creation windows plus incremental watermarks, not a
provider-side financial snapshot or proof of accounting reconciliation. Current
canonical metadata and retained current order/receipt projections are used for
recalculation. Earlier saved calculations remain readable when those inputs change.
Customer evidence and benchmark reconciliation remain #38.

Bound processing to 20,000 source-linked SKUs, 500,000 retained order rows and 1,000
backfill windows, with explicit limit errors. Perform stock/receipt/order aggregation
in PostgreSQL; do not transfer all historical raw payloads into application memory.
Materialization batches contain at most 200 SKU rows. The API returns bounded pages
of the immutable result.

The existing recalculation outbox remains WAITING_ENGINE until #37 adds the full
classification consumer. This task exposes the reusable calculation/materialization
service and read API; the dedicated stock dashboard and its visualizations remain
separate roadmap work.

## Verification and rollout

Unit checks cover recent-receipt/minimum exposure, complete/incomplete observations,
known zero versus unknown/return-dominated velocity, fractional/invalid stock,
first-receipt STR, cohort gaps, season/activity boundaries, mixed currencies,
missing/zero COGS, turnover norms and availability color boundaries. A 10,000-row
summary check verifies decimal aggregation; it is not a database load benchmark.

PGlite executes all migrations and production SQL with synthetic tenants to verify
typed materialization, exact-date stock, source timestamps, idempotency despite a
clock advance, inactive manifests, frozen old versions/names, first versus later
receipts, source-policy replay, project gaps, preorder exclusion and transactional
rollback. API tests cover signed sessions, forged headers, query bounds, frozen
reads and sanitized failures. Existing financial tests exercise the shared
snapshot/coverage/trust helpers after extraction.

```sh
npm test -- --maxWorkers=2
npx tsc --noEmit
npx prisma validate
npm run build
git diff --check
```

Implementation verification: 505 tests across 51 files passed. TypeScript,
Prisma schema validation, the production build and whitespace checks passed.

No production migration, live customer import or connector activation is performed.
Deploy the additive migration before using the new API. Test the selected date
against approved source mappings and actual dated observations, then reconcile
the customer fixture in #38. For application rollback, retain the additive schema
and saved calculation versions; do not delete history to hide a discrepancy.
