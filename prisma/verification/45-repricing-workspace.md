# Repricing workspace (MVP 19 / #45)

## Behavior

The `/repricing` route mounts R1–R4 inside the authenticated merchandising shell.
It reuses the shared snapshot loader, report table, panels, money/quantity/ratio
formatters, theme, localization and signed-tenant APIs from #44. Client-safe
constants and types now live in `lib/repricing-contract.ts`; pricing formulas
remain in the server-only calculator. No schema migration is needed.

- R1 defaults to DEAD and three months. Status, brand/category, current-price
  bounds, stock bounds and sold-unit maximum narrow the server's eligible
  universe with AND semantics. SKU and currency drill-down context is retained.
  Reset restores defaults and clears edits; the active-filter counter counts
  departures from defaults. Shown/total/eligible counts come from the server.
- Brand/category choices come from the complete frozen candidate universe,
  before filtering or pagination. Native selects preserve names and canonical
  IDs; large choice sets have a search field and bounded suggestions, including
  the current selection even when it falls outside the search results.
- R2 provides three sliders, the approved goals, slider-only presets,
  4/10/14-day durations, rounded-cost protection, and explicit liquidation with
  a required reason. There is no Calculate button and no frontend pricing,
  rounding, ranking, eligibility or totals implementation.
- Requests debounce for 250 ms. Superseded requests abort, and a separate
  current-request guard rejects late success and failure even if transport
  cancellation is ignored. A response is keyed to the complete request intent.
  Old totals and derived row margins/discounts are hidden during pending or
  rejected scenarios; rows remain available for correcting a manual price.
- Every parameter/filter edit resets manual prices, inclusions and pagination.
  Paging preserves manual overrides. Draft controls and page are URL-owned;
  manual edits are transient. Browser navigation/deep links reset overrides.
  Both `classification` drill-down links and the local `status` control are
  supported. Shared dates, channel and snapshot remain in the URL.
- R3 shows frozen product/brand/category/SKU/status, stock, sold units, cost,
  current price, days since sale, discount, editable price and margin. The
  backend owns frozen-capital ordering. Manual prices retain cents and a manual
  marker, and can be restored individually. Eligible SKUs outside the automatic
  share can be selected manually. Consignment and missing/zero prices are
  disabled with explanations. Selected negative margins receive a red row;
  amber/green margin text and gray unchecked rows follow server-provided tones.
- Invalid ranges, missing liquidation authorization/reason and rejected manual
  prices show localized errors without displaying obsolete totals. A rejected
  manual value remains visible and editable. Source changes before input
  publication prompt a new snapshot rather than mixing old and new data.
- R4 displays server totals for selected valid rows only, including cost capital,
  potential stock revenue, weighted discount, GP/margin, count and duration.
  The all-stock-sales assumption and all-channel basis are explicit.

## CSV boundary

The existing backend intentionally reports `export: false` and `execute: false`.
The CSV control is disabled with a user-facing explanation; no client-generated
CSV or substitute financial calculations bypass the authoritative preview.
Shared CSV/action-audit implementation remains in #48, as recorded by #44.
That consumer must use the same immutable input set, parameters, filters, edits
and validated selected snapshot. No export, price write or action log occurs
from this workspace. The CSV portion cannot be exercised until #48 exists.

## Reference and accessibility review

Compared the authenticated Claude artifact's Repricing artboard and R1–R4 text
with the implemented layout: filter panel, parameter panel with three horizontal
sliders, compact editable table and summary. Reused existing project colors,
typography and light/dark themes rather than adding another visual system.
Approved D10–D12 override inconsistent reference arithmetic and rounding examples.

Reviewed against the current Web Interface Guidelines and the requested React
and frontend-design skills. Controls have native labels/semantics, visible
keyboard focus, numeric input modes, inline invalid states and polite live
request status. The table is a keyboard-focusable scroll region, with bounded
25-row pages. No automatic motion was introduced.

## Validation (2026-10-26)

- `npm test -- --maxWorkers=2`: 804 tests passed across 70 files.
- `npm run build`: passed.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- Dedicated tests cover defaults and deep links, URL round-trips, reset/paging
  semantics, manual-price restoration, frozen filter choices, 250 ms debounce,
  cancellation, stale success/failure rejection, both locales, disabled rows,
  inline manual-price errors and suppression of obsolete totals.
- Browser verification used a temporary local fixture around the real shared
  shell, workspace and server calculator with a synthetic watch assortment.
  Verified manual cents and floor errors, slider reset, brand/status filters,
  selection outside automatic share on page two, global count updates,
  liquidation with a reason, negative margin coloring, min > max errors,
  English/Ukrainian, light/dark appearance and keyboard focus.
- At 390 × 844, document width matched viewport width (390 px); horizontal
  overflow stayed inside the report table. Desktop verification used the default
  1280 × 720 viewport. Temporary routes, proxy and development servers were
  removed/stopped after verification.

No production database or customer workbook was changed. Synthetic UI verification
does not replace real-data benchmark acceptance under #38.
