# Local reporting recovery checks — 2026-10-29

## Scope

Synthetic tenant, catalog, orders and approved test mapping in an isolated local database. No customer mapping, production database or live connector was activated or changed.

## Confirmed fixes

1. Sheets screen freshness uses the active successful import's `completedAt` in UTC. The existing two-hour threshold is unchanged. Import observation time is separate from order-history coverage and never becomes an order watermark. Missing/future import timestamps remain unavailable/stale.
2. Stock history copy is shared across providers in Ukrainian and English. It requires verified dated observations and makes no promise that a chart will appear after one month.
3. Overview classification coverage distinguishes complete, partial and unavailable assessments. Unknown classification does not produce zero dead-stock share, absence claims or a largest-bottleneck winner. Confirmed positive findings remain visible with a partial-coverage warning; confirmed zero findings remain available for complete assessments.

## Repricing investigation

Status: **not reproduced; original cause remains unconfirmed**.

- Fresh isolated local start: first browser opening of Repricing succeeded without Retry.
- Browser Stock → Repricing navigation also succeeded without Retry.
- Fifteen sequential HTTP cycles of Stock → Repricing → inputs → preview completed; all 62 probe requests, including source and snapshot setup, returned 200 or 201.
- This is synthetic local evidence, not a live SalesDrive, real Zavod or production-load acceptance test.
- An older local test server could no longer reach its database during this investigation. That does not establish the cause of the earlier first-open failure.

Unexpected merchandising failures now use the existing server logger. The screen API returns the same safe error code plus a request ID in its body/header. On recurrence, correlate `x-request-id` with the `api.merchandising.screen` server log. Known source-readiness failures remain distinct and are not logged as unexpected crashes. No automatic retry was added to conceal a failure.

## Visual checks

Chrome on the isolated current-code app confirmed the Sheets import timestamp and fresh-source status, provider-neutral Stock history copy, and insufficient-data Overview actions for two unclassified SKUs. Repricing loaded its controls and explicitly unavailable history; no customer prices were changed.

## Final validation

- `npm test -- --maxWorkers=2`: 160 files passed; 1,600 tests passed, one optional private-workbook test skipped.
- `tsc --noEmit --incremental false`: passed.
- `npm run build`: passed in an isolated temporary copy without production environment files; build type checks passed.
- `git diff --check`: passed.
- API recovery regression tests verify one server log per unexpected screen failure, a correlated safe 503 response, no automatic replay, and unchanged expected source-readiness responses.

The first three findings are fixed and locally verified. The original Repricing first-open failure remains unconfirmed; diagnostics are in place for a recurrence. The changes in this report are prepared for the existing reporting PR.

## Live Zavod file import rehearsal

On 2026-10-29 the current owner-provided Google Sheets file was downloaded through the application's normal public-link connector into a dedicated disposable local tenant/database. The Google file itself and production database were not modified.

- Actual production-build `POST /api/data/import` returned 200 in 24.64 seconds, status WARNING, with 31,781 saved raw rows: 4,599 catalog rows, 22,185 order rows and 4,997 source article-report rows.
- Raw table APIs returned the saved catalog/order counts. Actual `POST /api/data/calculate` returned 200 in 1.104 seconds for 2026-01-01 through 2026-10-28; the calculated table APIs returned 3,978 articles, 90 brands and 22 categories. This verifies execution and availability, not acceptance of business formulas or reconciliation to a customer benchmark.
- Import warnings: 942 UNMATCHED_PRODUCT and 8 DUPLICATE_SALE_LINE. Informational issues: 202 MISSING_VENDOR, 105 MISSING_VENDOR_CODE, 105 MISSING_ARTICLE, 254 INFERRED_PAYMENT_DATE and 5 MISSING_CATEGORY.
- Two non-approved mapping previews returned 200. No approval or reporting-source selection was performed; readiness remained MAPPING_REQUIRED. Projection intent correctly returned 409 SHEETS_SOURCE_SELECTION_REQUIRED.
- The production compiler was exercised on all rows read back from that exact saved import, fenced to its importRunId. Default product-ID mapping produced 3,978 catalog products and quarantined all 15,599 orders / 22,185 order rows. The diagnostic SKU-only alternative accepted 13,717 orders / 15,896 lines and quarantined 1,882 orders / 6,289 rows. Both quarantined 621 catalog rows.
- Financial rows remained zero because status meanings and currency were deliberately unapproved. SKU matching is a candidate for explicit review, not an activated rule.
- The fresh downloaded-workbook offline suite passed 84 tests in six files. Its download was a separate observation of a dynamic workbook; exact-import diagnostic counts above come from the saved HTTP import, not an assumed identical later download.

Private workbook, raw rows, cookies and row-level diagnostics stay outside Git with mode 0600. Only aggregate findings are recorded here. At this stage, full acceptance still required owner approval and a projection rehearsal; the subsequent approved attempt is recorded below.

Repeat live download/import returned 200 in 17.768 seconds with outcome `unchanged`, the same active importRunId/checksum and 31,781 rows. No duplicate import was published.


## Subsequent owner-approved five-screen attempt

The owner subsequently approved the proposed rules and requested testing on all five screens. Mapping approval and source selection succeeded only in the disposable local tenant. The existing supplied test account was separately verified: login returned 200 and its existing Sheets reporting source remained MAPPING_REQUIRED; its source configuration was not changed.

The isolated approved policy used SKU matching, UAH, net line sales and line costs, sale statuses 5/59/60, refusal 6 and preorder 33. Service and gift-card categories were separated; miscellaneous remained UNKNOWN. The validator refused RETURN for status 7 without a return-event date column, so it remained UNKNOWN/excluded rather than using generic updateAt as a return date. Receipt history, in-transit stock and ownership were not fabricated.

The full five-screen real-data flow **did not pass**:

- The first projection attempt hit a prepared-statement collision in the temporary PGlite socket adapter.
- After clearing the adapter's temporary prepared statements, projection returned 503 SHEETS_MAPPING_UNAVAILABLE after 85.022 seconds. Its server log reported an expired 45-second transaction (83.978 seconds elapsed). Publication rolled back.
- No current real-data shared screen snapshot was certified for Overview, Sales, Stock, Repricing or Reordering. Earlier synthetic screen checks must not be presented as real Zavod acceptance.
- PGlite/WASM timings do not establish normal PostgreSQL or Vercel performance. A separate direct PGlite profiling attempt was stopped without completing. A native local PostgreSQL rehearsal was prepared but not completed when the owner stopped testing and requested commit/push.

Remaining work: complete an actual five-screen rehearsal in the intended test-account environment, capture request-level SQL timings, resolve any confirmed bottleneck, and obtain verified return-event dates before claiming complete net financial acceptance. Production database, Google workbook and live connector actions were not changed.
