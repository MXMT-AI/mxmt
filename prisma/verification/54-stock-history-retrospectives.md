# #54 — Observed stock history and retrospective preparation

## Owner decision and scope

On 2026-10-28 the owner approved: implement stock history from actual observations,
prepare retrospective contracts, and create separate external-action delivery issues.
GMROI and external sending/writes stay inactive pending explicit decisions.

This branch starts from `main` after PR #107. The original Claude reference could
not be fetched by the web tool; implementation follows issue #54, approved D21 in
`docs/mvp-business-decisions.md` and the existing K2 workspace layout. No unseen
reference detail is asserted. The surrounding K1/K3/K4 layout, typography, report
components and theme are reused. This is a compact analytical panel, not a new
visual system: existing dark/light background/text/border tokens, teal accent and
muted prior-year dots, with an accessible exact-value table and no animation.

## K2: exact observations, fixed cohort

K2 now shows the last 12 **completed month-end dates** and corresponding actual
prior-year month ends. Leap-year February is resolved to the genuine last date.
No current-day value, nearest-day fallback, interpolation or carry-forward fills a
missing month. LY is shown only where the actual prior-year observations exist.

The population is explicitly the fixed merchandise SKU cohort from the selected
saved screen and filters. Brand/category/status/ownership/supplier selections
identify that current cohort; historical category membership or the full historical
catalog population is not reconstructed. Missing retired/historical-only products
are not silently presented as a full account stock history. A new SKU with missing
older observations makes its fixed cohort incomplete for those dates.

Sales channels never narrow physical stock. Currencies are separate; historical
currency changes are unavailable in the current-currency cohort rather than converted.
Legacy/unknown product kinds are outside the merchandise cohort, as disclosed by the
existing stock quality UI. An empty cohort remains an empty state.

The chart requires **30 consecutive completed daily observations** for every SKU
in the scoped currency cohort immediately before stock as-of. This is stricter than
30 scattered dates and provides an honest readiness window. Before readiness, show
a localized empty state and complete-day count. More than 5,000 scoped merchandise
SKUs makes history unavailable with a narrow-filters prompt; it does not block the
existing stock tables or silently truncate the cohort.

Each accepted observation must have matching tenant/source/SKU, actual observation
instant, matching source timezone and local observation/business date, a raw source
record key, successful/warning import provenance, a nonnegative Decimal quantity
and matching currency. Observations at/after the saved stock cutoff are excluded.
A daily observation is not asserted to be a 23:59 closing balance. UI/table show the
actual observation-time range. Source data corrections may change historical reads;
K2 is an as-of-bounded read of retained observations, not a new immutable historical
catalog publication. The saved cohort/settings remain fixed.

Historical cost is derived with Decimal quantity × observed cost price, following
existing stock valuation semantics; zero quantity is zero cost without inventing a
unit cost. Positive quantity with unknown/zero cost yields unknown full valuation,
while covered cost/counts stay explicit in the server contract. A partial quantity
cohort has no headline quantity/cost point. Plot coordinates use display numbers
only; exact decimal values remain in the response and table. The chart draws
observed dots and gaps, with no line suggesting interpolated monthly stock.

`readStockHistory` batches the bounded cohort across 24 month ends and 30 readiness
dates using existing indexed InventorySnapshot identity; the result is at most 54
aggregate dates per currency. No per-SKU network request, new cron, schema migration
or chart-library dependency is introduced. It is loaded in the same parallel server
workspace transaction and uses the existing signed/no-store stock API.

## Retrospective preparation API

`POST /api/merchandising/retrospectives/prepare` requires a signed ANALYST or higher
session and current database membership. Body:

```json
{
  "exportId": "audited-export-uuid",
  "kind": "reprice",
  "period": {"from": "2026-10-26", "to": "2026-11-26"}
}
```

`kind` may also be `reorder`; inclusive valid date windows are bounded to 366 days.
Only the original export actor in the same tenant can read this preparation.
Query overrides, client actuals, launch claims and GMROI inputs are rejected.

The response reproduces the **original stored export command**, canonical scenario
parameters, optional supplier/currency target, receipt, file SHA-256 checksums,
source/calculation version metadata, exported row count and row-set MD5 identity.
MD5 here is a reproducibility fingerprint of the stored row set, not a security
signature; exported file integrity remains SHA-256. No CSV bodies or full row lists
are returned and no calculator is rerun. Metadata is bounded to 512 KiB. Repeated
preparation does not append actions or send anything.

The result is always `PREPARATION_ONLY`, `executionState: UNCONFIRMED` and
`metricsState: NOT_EVALUATED`. Actual sales, GMROI and causal uplift are null.
The versioned `RETROSPECTIVE_GATES` contract identifies unresolved start/applied-row
evidence, complete sales/stock evidence, GMROI/ownership/currency rules and distinct
sent/accepted/received events. A downloaded export or calendar entry is not proof
that prices changed, a campaign started, an order was sent or stock was received.

No GMROI formula, attribution window or performance threshold is approved here.
The evaluation period is preparation intent only, not a declaration of actual launch.
No production promotion retrospective, causal model or automatic order exists.

## Delivery sequence and separate issues

1. #54 ships observed K2 and read-only retrospective preparation only.
2. #108 — Approve execution evidence and GMROI for scenario retrospectives. Record
   actual start/applied rows, approved inventory/profit/returns/ownership/currency and
   annualization rules before implementing outcome calculations or their UI.
3. #109 — SalesDrive price write-back: verify the official current provider contract,
   account permissions/limits and exact product/price mapping; separate preview,
   explicit approval, dispatch, per-item audit, unknown outcomes and compensating actions.
4. #110 — Supplier order delivery: choose approved transport/recipient/terms and
   file group; separate preview, approval, sending, acknowledgement and receipt.
   Unknown delivery cannot automatically retry or be undone by a DB rollback.

These are native sub-issues under #54, on the existing project board with existing
labels. External delivery issues are backlog and do not activate anything. Their
acceptance requires fake transport/error/idempotency tests and a separately approved
real-account canary; creating a ticket does not authorize contacting a supplier.
Applicable customer rules/results acceptance remains #92.

## Verification

Offline fixtures cover readiness, actual month-end/LY/leap dates, missing data,
unknown costs, negative quantities, currency/source/tenant boundaries, observation
provenance and channel independence. Localized UI render checks cover ready/empty
states, semantic table, chart labels and absence of invented values/interpolation.
Retrospective checks cover exact export replay, non-execution, bounds, actor/tenant
isolation, query/client-result rejection and sanitized failures. Repository-wide
checks are recorded at handoff. Native browser inspection was attempted but local
browser use is disabled in Work settings; no live browser or pixel-match claim is
made. Ready/empty UA/EN states are checked through real React static rendering.

No customer-data reconciliation, GMROI approval, live migration, remote price write,
supplier message or order dispatch was performed.


Validation on 2026-10-28:

- `npm test -- --maxWorkers=2` — 142 files / 1,427 tests passed.
- Targeted history/workspace/retrospective suites — 30 tests passed across four files.
- `npx tsc --noEmit` — exit 0.
- `npm run build` — exit 0.
- `git diff --check` — exit 0.
- Original Claude visual reference unavailable through the web tool; browser use
  disabled in Work settings. No live browser comparison was completed.
