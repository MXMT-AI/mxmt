# Consistent SalesDrive financial metrics (#35)

Branch: `feat/35-consistent-sales-metrics`.
Policy authority: the owner-approved D01–D08/D15 decisions in #27 and the
versioned settings from #34. The legacy Sheets calculation remains version 2.
The SalesDrive financial engine starts at version 1.

## Entry points and reuse

Open **Data & Reports → SalesDrive**, or
`/data-reporting?provider=salesdrive`. The explicit source selector preserves the
existing Sheets reporting contract. Both sources reuse the report grid, table
metadata and value formatting. Financial arithmetic runs on the server only.

`GET /api/data/sales` calculates/loads a result for the authenticated tenant.
Supported financial views are `articles`, `brands`, `categories` and `channels`.
The response includes the server summary, components, paid preorders, outliers,
diagnostics and a paginated table. `calculationRunId` reads an immutable result;
changing views/search/sort/page does not recalculate financial totals.

CSV requires an explicit calculation ID, uses the same saved numbers and selected
view/search, and includes formula version and period. It uses UTF-8 BOM, semicolon
separators, quoted fields and formula-injection protection. Unknown values stay
empty. Percentage fields are **0–1 ratios**, consistent with existing report
metadata; client settings such as `minMarginPct` remain 0–100 inputs. No AI is
called by these calculations or exports.

Extend the existing article/group/channel modules with shared SalesDrive
aggregation entry points. Share the own-stock/consignment formula with the #34
server preview. Decimal arithmetic uses local 48-digit precision without changing
legacy Decimal defaults. UI formatting preserves long decimal strings without a
binary floating-point round trip; it does not sum displayed values.

## Financial rules

- Consume normalized net line amounts after verified discounts. Do not subtract
  discounts again. Require the captured import policy to match the currently
  approved amount/date/status policy and client ingestion filters. Old or missing
  normalization provenance requires replay rather than silent reinterpretation.
- Sales use payment dates; returns are signed once and use verified return-event
  dates. Approved inferred sale dates remain visible in diagnostics. Undated
  financial events stay outside trusted totals and prevent complete comparisons.
- Keep paid PREORDER rows separate from recognized sales and profit. Honor the
  approved status-33 preorder mapping even if a client sale-status list contains
  that ID. Unpaid preorders, refusals and configured exclusions do not enter sales.
- Own-stock GP = net revenue minus known cost. Consignment GP = net revenue times
  the approved commission ratio; zero commission is a known value. Unknown
  ownership, missing commission and zero/missing ordinary-product cost do not
  become fabricated profit.
- Covered GP and covered revenue use the same eligible rows. Covered GM is their
  ratio; it is not an average of row margins or GP divided by uncovered revenue.
  Missing-profit counts, partial-data labels and the saved margin threshold remain
  visible. Zero covered revenue produces no margin percentage.
- Include services in headline revenue and sale-order counts; keep service profit
  unavailable until its accounting treatment is approved. Physical unit totals
  cover merchandise. Gift-card and unknown-type movements remain separate
  components outside headline merchandise/service revenue.
- Count distinct source/order identities where at least one sale line exists.
  Returns have a separate distinct-order count. Group order counts must not be
  summed to produce a headline count: one order can span multiple SKUs or brands.
- Keep currencies separate, including an explicit unknown-currency bucket. No FX
  conversion or cross-currency grand total is invented.

## Calendar, plans and LY

Default D15 period: Kyiv local days 1–6 use the preceding complete month; day 7
onward uses the current month through yesterday. Explicit dates are inclusive,
validated calendar dates, limited to 366 days and cannot end in the future.
Event instants are assigned to the configured source business timezone.

LY shifts both calendar endpoints back one year, clamping February 29 to February
28. It does not subtract 365 days. Return revenue belongs to the return period,
not the original payment period. Absolute revenue/unit changes and covered LY
GP/GM accompany the percentage comparison. Non-positive LY revenue yields no
growth percentage; missing history or revenue yields no trusted comparison.

Monthly plan attainment uses the complete targets for the months touched by the
period. Pace compares actual revenue with each target multiplied by the selected
calendar-day fraction of that month. For a month-to-date interval, this equals
`revenue / elapsed_days × days_in_month / monthly_plan`. Missing plans/currency
and zero targets do not yield fabricated percentages. Incomplete current history
also suppresses plan attainment and pace.

Reference O1/S4 flags **LY** orders strictly above 50% of the brand's **full calendar
month** net revenue, independently per currency. The reader loads full LY months
for that denominator even for a partial-month report; headline and comparison
metrics still use their selected dates. Full-month history is required for the
flag. Returns contribute to the monthly denominator. Flags include month, brand,
source/order identity and share; they do not remove revenue or rewrite plans.

## Snapshots, provenance and incomplete inputs

Reuse `ReportCalculationRun` instead of adding another job/calculation identity.
The additive migration `20261025000000_sales_financial_results` adds `reportKind`,
`inputKey` and `financialResult`, extends the cache key with the input fingerprint,
and enforces the legacy/financial payload shape. Existing rows retain
`SHEETS`/`legacy`/SQL NULL defaults and their original cache behavior.

Read facts, current metadata, approved config versions, import coverage and source
progress in one REPEATABLE READ transaction. Hash those inputs and publish all
financial views atomically as a single JSON result. Include config/import IDs,
fact hash/count, source ID and the calculation version in provenance. A changed
ownership setting or import changes the fingerprint; previous reports remain
readable. Retry a serialization conflict once with a fresh database snapshot.

History coverage is based on completed order-creation backfill windows and the
incremental watermark, not on the earliest sale found. Partial boundary days are
excluded. In-flight/recoverable source jobs, stale projections, undated events,
unverified project mappings or quarantined orders in the latest completed import
prevent complete-history claims. Coverage is an import-window statement, **not**
proof of accounting reconciliation or a provider-side immutable snapshot.

Current OrderLine projections are the available source of truth. Do not invent
an original sale or a partial refund event from a later status snapshot. The
connector's raw/version history and verified event evidence remain important to
#38 reconciliation, including older unresolved quarantine cases.

The request bounds inputs to 100,000 relevant/undated lines and 1,000 backfill
windows, failing explicitly above those bounds. Table pages are at most 200 rows
(25 by default); the API returns at most 100 outlier details plus the full count.
This is an on-demand financial result; the combined financial/inventory outbox
remains WAITING_ENGINE until #36–#37 supply the stock/classification engine.

## Verification and rollout

Automated checks cover returns and discounts, distinct orders, services/gift
cards, commission, zero/missing amounts and plans, partial months, leap endpoints,
LY zero/insufficient history, weighted covered margin, client thresholds, strict
monthly outlier boundaries and 10,000-order/high-precision sums. PGlite executes all
migrations and production SQL against synthetic tenants to test cache publication,
saved-result stability, tenant isolation, policy invalidation, real return dates,
preorder separation, quarantine disclosure and serialization retry. API checks
cover signed sessions, forged identity headers, query bounds and frozen CSV reads.

Browser checks use the actual components and a synthetic API fixture: Ukrainian
light/English dark, 320px layout, server-provided totals, channel switching,
separate movements/preorders, search/empty state and import-not-ready errors.
The original artifact loaded in the browser on October 25 after an initial loading
and sign-in notice. O1/O2/O3/S4 and the monthly outlier rule were reread; section 11
is now visible. Its displayed targets are not a frozen, owner-verified source
dataset, so customer numerical reconciliation remains #38. This does not rewrite
the historical approval/evidence record from #27.

```sh
npm test -- --maxWorkers=2
npx tsc --noEmit
npx prisma validate
npm run build
git diff --check
```

Implementation verification: 441 tests across 48 files passed. TypeScript,
Prisma schema validation, the production build and whitespace checks passed.

No production migration, customer import or connector activation is performed by
this implementation. Deploy the additive migration before the new application;
verify on an isolated/staging database with approved source mappings and import
history. Re-import history when ingestion policy changes, then reconcile #38 using
the approved fixture. To roll the application back, retain the additive schema
and financial snapshots. Do not drop report history or manually reactivate old
settings to conceal a discrepancy.
