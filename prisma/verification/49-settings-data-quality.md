# Settings data quality and synchronization status (#49)

Baseline: `d9cf749` (merged #48). Branch: `feat/49-settings-data-quality`.
The approved business decisions remain authoritative; no migration or production
backfill is required. The reference artifact supplies the Data Quality requirements
and client-settings behavior, but its Settings navigation link has no dedicated
Settings artboard. This change retains the existing Settings typography, tokens,
section structure, source controls, aliases and product-type editor.

## Current diagnostics and stock coverage

`getProductQuality` extends the existing current-connection catalog diagnostic query.
The latest observation is deterministic per SKU. A repeatable-read transaction keeps
SKU rows, issue groups, currency coverage and distinct totals on the same snapshot.
The read model is live diagnostics, not a replacement for frozen financial reports.

Diagnostics cover missing/ambiguous brand, missing category, missing/non-positive
ordinary-product cost, missing/zero retail price with stock, unknown product type,
missing/future receipt date, negative stock/derived metrics, unavailable quantity,
unknown ownership, missing consignment commission, unknown supplier, unverified
supplier terms, missing supplier lead time and unverified transit. Explicit SKU
ownership/commission/supplier overrides precede brand defaults; configured monobrand
identity can supply the brand. An absent supplier lead time is disclosed as a client
default, not silently labeled verified. Service/gift-card exclusions are retained;
missing service cost stays visible rather than implying complete profit coverage.

Each issue group includes SKU count, known quantity, cost value and unknown-value/
quantity counts, separately by currency. `affectedStock` aggregates affected confirmed
merchandise once per SKU before grouping by currency. Its totals must **not** be
obtained by summing overlapping issue groups. Non-positive cost and negative/unknown
quantity cannot create a fabricated zero or negative stock valuation; covered value
is labeled as a known part when some rows remain unvalued. Unmatched order lines are
shown separately and are never added to merchandise-stock totals.

Synthetic fixtures reproduce the ticket examples: one missing-brand population with
330 units / UAH 433,000 and one zero-price population with 52 units / UAH 416,000.
Despite several overlapping exceptions, the distinct total is 382 units / UAH 849,000.
These deliberately isolated examples validate the contract; customer Zavod benchmark
acceptance remains the separate #38 process.

## Drill-down, lineage and recovery

`/api/data/quality` accepts an optional bounded issue `code` in addition to SKU/name
search and pagination. Group buttons filter the SKU list and move keyboard focus to
its heading. Diagnostic selection uses `qualityCode`, `qualityQ` and `qualityPage` in
the existing Settings URL, preserving the Settings tab and other parameters. Invalid
navigation values fall back to a bounded default. SKU rows retain source ID, import
run ID, observation time and source-record key, with localized exclusion explanations
and links to the source connection or Merchandising settings needed for correction.

`/api/data/issues?source=salesdrive` reuses `ImportIssue` for paged import warnings.
The default Sheets behavior is preserved. SalesDrive reads are scoped to the signed
tenant and its current connection; optional code/severity/run/SKU filters are bound
SQL parameters. Only explicit lineage fields are returned, not arbitrary contexts,
warning messages, credentials or raw customer payloads. This is import-warning history,
clearly distinguished from current catalog diagnostics. An unmatched-sale warning is
included only while its corresponding current order line remains unlinked; a repaired
or replaced line does not remain an active unmatched exception.

The existing synchronization cards continue to show source freshness/lag, scheduler
heartbeat, backfill progress, retry/error state, stock-history coverage and the existing
ADMIN-only refresh/resume/worker controls. Read-only roles can inspect diagnostics and
refresh displayed progress. `DataHealthSection` shares an invalidation callback across
the existing cards: a newly completed import or calculation refreshes diagnostics.
Initial progress loading and merely entering a queue do not trigger that callback.
The existing correction/settings paths continue to request background recalculation;
this task does not add a second worker, scheduler or formula engine. Alias changes still
require a catalog import so source identities are normalized again.

## Verification

Integration tests run the real migrations in isolated PGlite and check example values,
overlap deduplication, filtered SKU lineage, unknown valuation, effective ownership and
supplier warnings, post-correction diagnostics, invalid ages, negative quantities,
separate currencies, tenant boundaries, paged warning history and repaired unmatched
sales. API tests cover signed-tenant Viewer access, role restrictions inherited from
the existing mutation APIs, query bounds, uncached responses and sanitized failures.
UI tests cover both languages, correction links, partial coverage and URL round-trips.

Browser verification used the actual Settings diagnostic/sync components and the actual
quality/issue stores with isolated synthetic PostgreSQL data. Connector progress and
remote source correction were simulated locally; no SalesDrive requests or production
writes were made. Verified both example groups, group-to-SKU drill-down, URL changes,
focus on the filtered heading, lineage details, lazy warning history, manual refresh,
queue/completion states, automatic diagnostic invalidation after source correction,
and preservation of an open warning panel when entering the queue. Ukrainian and
English rendering and Viewer-only inspection were checked. Desktop used 1280 × 720;
at 390 × 844, viewport/document widths were both 390 px. Temporary fixture files and
servers were removed/stopped, and the viewport override was reset before finishing.

Final checks: `npm test -- --maxWorkers=1` passed **950 tests across 84 files**,
with no failures or skipped tests. `npm run build`, `npx tsc --noEmit` and
`git diff --check` passed.

## CodeRabbit follow-up

Loaded diagnostics remain mounted while a newer read is pending. The existing
loading status, disabled mutation controls, request ordering guards and `aria-busy`
remain active, and the focused product heading still waits for fresh data. This
preserves the warning panel's open state, selected code and page through diagnostic
refreshes instead of remounting its local state. Added helper docstrings document
navigation and localized correction behavior.

A delayed local browser regression fixture with 27 synthetic warnings confirmed
that an open panel set to all warnings, page 2 of 2 survives manual refresh, a
simulated completed-import revision and product search. Request logs confirmed the
open history refetched page 2 on revision. After a completed search, two matching
products were shown, page 2 remained selected and the search input retained focus.
Temporary fixture files and servers were removed/stopped afterward.

Follow-up validation: 12 focused diagnostic/UI/API tests, `npx tsc --noEmit` and
`git diff --check` passed. No production data or external source was changed.
