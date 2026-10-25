# SKU classification and brand signals (#37)

Branch: `feat/37-unify-classification-signals`.
Authority: section 8 and K4 of the MVP specification, plus owner-approved #27
D08, D13, D14 and D16. Daily calculation version: **2**.

## One published classification

`lib/classify.ts` adds the SalesDrive classifier alongside the unchanged legacy
Sheets formula. The daily store resolves #34 client, brand, SKU and supplier
settings in its existing repeatable-read transaction; it does not query settings
once per SKU. Its fingerprint includes the resolved metadata and policy inputs.

Each version-2 `SkuDaily` row stores one `classification`, mirrored in its frozen
JSON metrics. The new SQL constraint requires these values to agree and permits
only the canonical statuses. The existing daily API returns these saved values;
reads, searches, sorting and pagination never recalculate classification.
Use one `calculationId` across SKU screens, status counts, shortages and K4 brands.
The global summary and `brands` collection belong to that same immutable result,
regardless of the current SKU page/search. Each result retains its business date,
formula version, input fingerprint, source timestamps and settings provenance.

Existing version-1 rows/manifests remain readable without invented statuses.
Clients must check `calculationVersion` before expecting version-2 fields.
`SKU_DAILY_INPUTS_V1` identifies the manifest format, not the formula version.
A settings/metadata change creates another result; old results keep their saved
names, ownership, status and recommendations.

Priority, first match wins:

1. SERVICE: explicit services and gift cards; no stock action.
2. DATA_ERROR: unverified product kind, missing/negative stock, incomplete or
   missing first-receipt evidence, unknown last sale, unknown activity or
   unknown/return-dominated velocity. `classificationErrors` lists the blockers.
3. NEW: first verified external supplier receipt age strictly less than
   `newProductWeeks × 7` calendar days (default 42); replenishment cannot reset it.
4. OFF_SEASON: category outside its configured source-local calendar months.
5. OOS: active merchandise with exactly zero stock, including known zero velocity.
6. DEAD: last sale age at least `deadDays`, positive stock with known zero
   velocity, or unrounded WOH above `riskWohWeeks` (default 26).
7. RISK: unrounded WOH above `healthyWohWeeks` (default 12), up to 26 inclusive.
8. HEALTHY: remaining eligible rows.

Null last-sale dates remain errors unless complete since-first-receipt history
proves a zero-sales cohort. In that case first receipt bounds the known unsold
age; it is never treated as a zero-day sale. Financial-only diagnostics (missing
COGS/prices) and the documented receipt fallback do not by themselves invalidate
physical classification. The original diagnostic and velocity coverage fields
remain available separately from classification blockers.

Own-stock DEAD suggests `REVIEW_MARKDOWN`. Consignment DEAD suggests
`DISCUSS_SUPPLIER_RETURN`; it never recommends markdown. SKU ownership overrides
brand ownership, and UNKNOWN stays unknown with `OWNERSHIP_UNKNOWN` and a
`REVIEW_DATA` recommendation. These are review suggestions, not executed actions.

## Shortages and availability

`shortageRisk` is the separate strict predicate `daysToZero < leadDays + 14`.
`shortage` is its union with eligible active OOS, counted by distinct SKU ID.
Do not add `oosSkuCount` to `shortageRiskSkuCount`: they overlap.
Service/error/new/off-season/inactive rows are excluded. Unknown velocity is a
manual-review data error. Known zero-velocity OOS still counts once, even though
its days-to-zero is null. Verified supplier lead terms override the client lead
default; unverified terms use the approved default rather than invented terms.

Availability retains #36's active physical-SKU definition; quarantine affects
automatic shortage recommendations, not that definition. Out-of-season rows,
including unknown product kinds outside their category season, cannot enter its
active/unknown denominator. No active denominator remains unavailable, not 0%.
`offSeasonSkuCount` counts the canonical OFF_SEASON status separately.

## K4 brand signals

`lib/brand-metrics.ts` aggregates the same frozen daily rows by brand, with a
separate null-brand group. Priority: MISSING_BRAND → NEW (earliest first receipt
across physical SKUs, with complete receipt evidence) → OFF_SEASON (all constituent
categories outside season) → WOH band. Mixed-season brands retain the physical
brand population for their aggregate WOH. Partial/unknown physical inputs produce
UNAVAILABLE instead of a fabricated healthy signal. Positive stock with known
zero aggregate velocity is DEAD; zero stock/zero velocity is unavailable.

Brand WOH divides total units by total weekly velocity; it does not average SKU
WOH. STR sums cohort sales and stock over the same covered subset, exposes the
covered SKU count and completeness, and never combines currencies into money.
Brand UNKNOWN ownership has its own warning, independently of SKU overrides.
Services/gift cards do not enter brand stock signals. Signals share the SKU
classifier's unrounded WOH bands and first-receipt quarantine helper.

The existing dashboard/analyst/calendar Sheets consumers exclude SalesDrive-linked
SKUs through one shared Prisma filter, preventing a second classification of the
same SalesDrive SKU using legacy SalesRecord/default-zero inputs. Sheets formulas
and agent report contracts remain intact. The SalesDrive dashboard, product lists
and brand screen are separate #39–#43 UI work; they must use the frozen daily API,
not copy classifier logic into React.

## Deferred #32 consumer, now connected

When no remote import page is claimed, the existing sync worker drains one local
calculation phase. A source with incomplete/paused/failed imports is not consumed.
The durable outbox moves WAITING_ENGINE → RUNNING/DAILY → PENDING/SALES → COMPLETE.
Each tick runs one existing calculation service, independently of remote import
work, retaining the Hobby minute-tick setup without a new scheduler or host.

Short claim transactions lock the connection and intent. A partial unique index
allows at most one RUNNING intent per tenant/source. Two-minute lease tokens fence
completion acknowledgments and allow recovery after an interrupted worker.
Failure retains its phase and a sanitized error code, retrying after five minutes.
Settings/metadata invalidation restarts DAILY, including when it interrupts SALES;
an old worker cannot acknowledge the changed request. The settings card reports
pending updates and automatic retry using its existing styling and localization.

The intent records `dailyCalculationId` and `salesCalculationId`. These are
**separate immutable phase results**, not a claim of one cross-engine database
snapshot. Their own saved provenance is authoritative. Input trigger watermarks
are not frozen calculation inputs. Existing intents are drained independently;
repeated equivalent phases reuse the calculation services' fingerprints.

## Validation and rollout

Synthetic PGlite executes every production migration and calculation query.
Tests cover exact 12/26-week, 90-day and 42-day boundaries, configurable 60/120-day
rules, precedence, zero/unknown demand, fractional stock, shortage union, seasons,
ownership overrides, K4 aggregate ratios, immutable old results, tenant scope and
SQL status consistency. Consumer checks exercise real daily/financial publication,
import gating, phase retry, lease expiry, stale acknowledgments and settings edits.
The end-to-end sync test drains import completion through both calculation phases.

Run `npm test -- --maxWorkers=2`, `npx tsc --noEmit`, `npx prisma validate`,
`npm run build` and `git diff --check`. No configured remote database, customer
import, production migration or deployment is needed for these checks. Browser,
touch and screenshot verification were not run; UI changes are limited to the
existing synchronization status text/live region. Customer numerical reconciliation
remains #38; actual account evidence is not replaced by synthetic fixtures.

Deploy `20261025020000_sku_classification` before enabling this worker version.
Rolling back application code leaves the additive constraints and old results
intact; do not delete published calculations or rewrite version-1 rows.
