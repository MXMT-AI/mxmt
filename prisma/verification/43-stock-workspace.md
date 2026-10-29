> Superseded for K2 by #54: see `54-stock-history-retrospectives.md` for the observed-history implementation. Other K1/K3/K4 contracts below remain applicable.

# Stock structure, categories and brands K1–K4 (#43)

`/stock` replaces the navigation placeholder with the Stock workspace. Authority:
reference section 10a K1–K4 and approved #27 D13/D16/D17/D21. The screen reads the
same immutable version-2 daily rows as Overview and the existing detail APIs.
There is no schema migration or new financial/classification formula.

## Display contract

| Block | Behavior                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1    | Cost-valued DEAD/RISK/HEALTHY ring, with separate SKU counts and keyboard-accessible status links. The center shows eligible cost or the selected status's eligible-cost share. NEW, OFF_SEASON, SERVICE, DATA_ERROR and OOS remain outside the ring and retain separate counts/amounts. Services have no physical valuation. Missing eligible cost makes the ring shares unavailable. |
| K2    | Always the MVP explanatory placeholder: history will appear after one month; the history/LY chart is v2. Even when daily observations exist, this projection generates no monthly curve, zero-filled series or pretend historical balance.                                                                                                                                             |
| K3    | Category × status amounts in the panel's currency, without a hidden thousands multiplier. DEAD/RISK/HEALTHY plus Other statuses, full physical Total and a cost-share structure bar. Other statuses retain new, off-season, data-error and OOS amounts. Sort by the selected K1 status by default, otherwise Total; column controls provide explicit name/value sorting.               |
| K4    | Top 10 matching brands per currency/page, ranked by full stock cost or selected-status cost. Show quantity, receipt-cohort STR, aggregate WOH and canonical brand signal. All remaining brands are reachable by paging. Brand/category drills open paged SKUs; SKU links retain context for Repricing/Reordering. Navigation does not execute a scenario.                              |

A selected status matches groups containing that status, while category/brand
amounts and ratios retain the whole matching group. This prevents an ordinary
brand from acquiring an invented signal when its other SKUs are hidden. Category
status cells and the final SKU table apply the explicit selected status to drills.
The explanatory filter note makes the whole-group denominator visible.

WOH divides total group stock by total group weekly velocity; STR divides cohort
sales by cohort sales plus stock over the same covered SKU subset. STR is labeled
as since the **first verified external supplier receipt**, following D17 rather
than assuming receipt lots/current-batch allocations. Coverage remains explicit.
Unknown ownership and missing brand retain review warnings. NEW uses complete
first-receipt evidence; OFF_SEASON requires all group items out of season.

`dailyBrandSignal` is shared by daily publication and SQL aggregate rendering.
Its precedence and unrounded thresholds are unchanged. The UI does not reclassify
SKUs or average their ratios. Quantity/price fields, names, ownership, season,
receipt dates and policy values come from the saved snapshot, not live catalog
lookups. Each monetary panel isolates a currency, including unknown currency.

## Reconciliation with O4

`readStockStatusGroups` supplies both screens, and `stockStructure` supplies both
sets of percentages:

- **K1 denominator:** DEAD + RISK + HEALTHY physical stock at cost.
- **O4/category denominator:** all physical stock at cost, including NEW and
  OFF_SEASON. Their adjacent gray segments retain the same underlying values.
- SERVICE has no physical cost; OOS has no positive-stock ring segment.
  DATA_ERROR stays outside K1, with unknown/unpriced physical valuation disclosed.
- A status's amount agrees across K1, K3 and O4 for the same dimensions/currency;
  its K1 and O4 percentages can deliberately differ. Missing costs never turn
  partial values into a complete denominator.

Stock always says **All channels**. Shared sales-channel context survives links
but cannot filter physical stock, brand signals or ratios. The header labels the
stock as-of date and actual observation cutoff, never the selected sales month's
last day or an invented end-of-day observation.

## API, reuse and bounds

The existing authenticated GET `/api/merchandising/stock` adds `stockWorkspace`.
Sales and Overview responses retain their prior shapes and add a null Stock
projection. Stock-only controls are `categoryPage`, `brandPage`, `categorySort`
(`name`, `stockCost`, `DEAD`, `RISK`, `HEALTHY`, `OTHER`) and
`categoryDirection=asc|desc`. The existing `page` controls SKU paging. Enums,
duplicates, integer bounds and screen ownership are validated before SQL.

SQL aggregates before matching/ranking/paging groups. Category pages are bounded
by the existing page size; brand pages have 10 rows per currency. Counts remain
available for an out-of-range page. There is no per-SKU/group database request.
Existing snapshot input and SKU bounds remain; production-scale timing/query
plans still require staging validation.

The screen reuses the shared snapshot hook, URL filters/link helper, ReportTable,
locale formatting, theme and accessible report primitives. Sales now consumes
those same note/pager/partial-marker primitives. Semantic colors moved to shared
report styles; no chart dependency was added. SVG numbers position segments only;
server decimal strings remain authoritative for money, shares and ratios.

## Verification

`npm test -- --maxWorkers=2`: **733 tests passed across 65 files**.
`npm run build`, `npx tsc --noEmit` and `git diff --check`: exit 0.

- Isolated PGlite applies production migrations without accessing a configured database.
- Reconcile K1/O4 costs, the gray remainder, category sums and all brand/category pages; verify independent sorting, missing cost/kind, zero physical denominators and all-channel invariance.
- Synthetic named cases verify CITIZEN → DEAD, CASIO → NEW with first receipt October 7, and CHPO → OFF_SEASON in October. These are behavior fixtures, not claims that customer benchmark figures have been reconciled.
- Compare single-currency K4 metrics/signals directly with the published daily brand summary; verify whole-brand ratios survive selected-status filters and old reads survive live metadata changes.
- Verify canonical-version metadata, UA/EN renderings, preserved snapshot/date/channel/status/currency/brand/SKU action links, API parameter boundaries, and the invariant K2 placeholder.
- Local browser verification uses actual components with synthetic fixture API responses and a router adapter: reference hierarchy, keyboard status links, category sorting, brand-to-SKU context, both themes and a 390px responsive iframe. No physical touch device or production authenticated session is asserted.

The customer-specific financial benchmark/threshold acceptance in #38 remains
separate. No production import, migration or deployment is performed for #43.
