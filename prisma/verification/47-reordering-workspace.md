# Reordering workspace (MVP 21 / #47)

## Behavior and reuse

The authenticated `/reordering` route now mounts the supplier-aware workspace
inside the existing merchandising shell. It calls the #46 preview API; it does
not implement velocity, shortage, order quantity, MOQ or procurement formulas.

- Two modes follow the prototype: shortage/at risk and a specific brand. Brand
  mode prompts for a brand before showing recommendations. An unfiltered
  shortage request can supply frozen choice metadata while that prompt is
  visible; it is not shown as a valid brand recommendation.
- Editable delivery and post-delivery coverage controls inherit each SKU's
  frozen supplier policy when blank. Approved client defaults are disclosed as
  fallback hints, without overriding different saved supplier terms globally.
  Server field errors identify invalid whole-day values.
- Brand/supplier choices use frozen canonical IDs. Shared dates, channel,
  snapshot and Stock/Overview brand/category/SKU/currency drill-down context
  remain in the URL. Changing controls resets the SKU table to page one.
- The table reuses the shared report grid and decimal formatters. It includes
  product/brand/category, SKU, barcode, stock, weekly velocity, days to zero,
  in-transit quantity, recommended units, purchase amount and notes. Urgency
  uses the server's red signal; excluded/off-season rows are gray with zero and
  a reason. Effective lead/coverage/MOQ terms are visible per row.
- Unknown transit stays unknown until the user enters a known non-negative
  quantity or explicitly confirms zero. Confirmations are scenario-only and can
  be restored to their saved values individually. Terms and SKU pagination
  retain confirmations; changing mode or filter scope clears them to avoid
  carrying out-of-filter SKU overrides. Reset, external navigation and a fresh
  snapshot clear transient confirmations.
- Requests debounce for 250 ms, abort superseded work and reject late responses.
  Old quantities/cash totals are suppressed while the scenario is pending or
  rejected. An invalid transit value remains editable with a localized inline
  error. Malformed transport errors normalize to a recoverable state.
- Summary units, partial coverage and currency totals come from the complete
  server scenario. Supplier groups use the server's stable supplier/currency
  groups and global counts/amounts, never sums of the visible SKU page. Large
  supplier lists use bounded local pagination; SKU pagination is URL-owned.
  Unknown costs/quantities remain explicit rather than appearing as zero.
- Both Ukrainian and English and the existing light/dark themes are supported.

Shared scenario fields and the debounced, identity-checked preview transport now
serve both Repricing and Reordering. The request-ordering primitive moved to
`lib/scenario-preview.ts`; the existing repricing export remains as a compatibility
alias. This removes duplicated interaction logic and preserves #45 behavior.

## Export and data boundaries

The server still reports `export: false` and `execute: false`. Global and per-
supplier CSV controls are disabled with an explanation. No client-generated CSV
or order submission bypasses the authoritative selected snapshot. Actual CSV
files and action auditing belong to #48, including verification that supplier
files match these server groups and exclude off-season/zero/ineligible rows.

No production database, supplier order, CRM record or customer workbook was
modified. No schema migration or new financial policy was introduced. The missing
detailed Reordering section remains recorded in #27; approved D14/D18–D20 and
section 10 govern this implementation. Synthetic fixtures do not replace pending
customer benchmark acceptance under #38.

## Reference and accessibility

Read the published Reordering artboard and section 10, then inspected its full-
screen prototype: two mode buttons, delivery/coverage controls, compact table,
red days-to-zero urgency and off-season zero rows. The implementation retains
that hierarchy while using the existing project shell, theme and report grid,
and adding required transit confirmation and supplier/partial-data summaries.

Applied the requested React, frontend-design and Web Interface Guidelines.
Controls use native labels/semantics, visible keyboard focus, appropriate input
modes and inline invalid states. Request progress is announced politely; tables
are keyboard-focusable scroll regions. Choice lists are bounded/searchable,
and the shared searchable selector uses a fieldset rather than nesting multiple
controls in one label. No automatic motion was introduced.

## Validation (2026-10-26)

- `npm test -- --maxWorkers=2`: 876 tests passed across 76 files.
- `npm run build`: passed; `/reordering` is included in the production bundle.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- Dedicated tests cover deep links/URL round-trips, inherited settings,
  server-side validation of day/transit drafts, explicit zero, terms/page
  persistence, scope/reset behavior, localized controls, disabled CSV actions,
  off-season/urgent rows, partial currency/supplier totals, stale-total hiding,
  editable rejected values and shared transport error handling. Existing request
  ordering/debounce tests and Repricing UI tests exercise the shared refactor.
- Browser verification used the real shell, workspace and #46 calculator with
  a synthetic assortment. Verified both modes and brand prompt, transit zero,
  page-two off-season zero, terms preserving confirmations, rejected negative
  transit and recovery, scope changes clearing confirmations, both locales,
  light/dark themes and keyboard focus.
- At 390 × 844, viewport and document widths were both 390 px; horizontal
  overflow stayed within the report table. Desktop used the default 1280 × 720
  viewport. Temporary fixture routes, proxy and development servers were removed
  or stopped after verification; viewport overrides were reset.
