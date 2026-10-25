# Sales workspace S1–S4 (#42)

`/sales` now consumes the tenant-authenticated, immutable merchandising screen
API instead of the navigation placeholder. It reuses shared URL filters,
snapshot loading, report tables, decimal formatting, theme and localization.
No schema migration or production data operation is required.

## Display contract

| Section    | Behavior                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1         | Brand/category/SKU grouping; monobrand snapshots coerce brand to category. Calendar months run from January of the selected end year through the selected end date, with a separate full-period total. Rank each currency by revenue with a stable ID tie-breaker. Brand/category show top 11, Others, Total; SKU rows are paged. Others expands to paged individual remaining groups, each with a SKU drill. |
| S1 metrics | Money mode exposes revenue, covered gross profit and covered margin. Units mode always uses merchandise quantities and disables financial metric controls. Service revenue follows the shared financial headline policy; service units do not become merchandise units.                                                                                                                                       |
| S1 heatmap | Server values determine intensity from 4% to 38%, including signed returns. Covered margin ≥50% is green, <40% red, intermediate values neutral. Unknown values remain unavailable; partial facts are marked. Totals and margin denominators use financial finalizers, never a sum/average of displayed ratios.                                                                                               |
| S2         | Selected-period channels ranked by revenue, with pagination and shares against the full filtered currency total. Money remains money when S1/S3 use units. Non-positive or incomplete denominators have no fabricated share. A channel link retains the period and snapshot.                                                                                                                                  |
| S3         | The same monthly facts and period as S1; top four revenue-ranked categories plus Others. The global units toggle changes the chart and its accessible value table together. In money mode this chart explicitly shows revenue, including when S1 uses profit/margin. Positive and negative stacks use separate sides of the baseline.                                                                         |
| S4         | Same selected dates and corresponding LY dates. Six largest declines and three largest increases by absolute revenue/unit delta, plus the exact all-group Total from the selected-period summary. Missing history/revenue and LY≤0 retain unavailable comparisons instead of infinity or invented zeros. Grouping follows S1, including category/SKU in monobrand mode.                                       |

A matching complete-month S1 cell reconciles to O2 for the same currency,
channel and dimensions. For a partial/custom interval, the selected-period
summary remains authoritative: the YTD table deliberately includes dates before
the selected start. Both date ranges are labeled. Currencies stay separate,
without conversion. Sale-order counts remain distinct source/order identities;
309 orders and 312 merchandise units are separate fields.

One-off notes reuse the Overview rule: a sale order strictly exceeding 50% of
its brand's full calendar-month LY net revenue, with complete revenue history.
Channel/currency/brand filters remain in the denominator; category/SKU/search
cannot shrink a brand-month into a false one-off. Category/SKU notes explicitly
refer to a **brand** purchase. Qualifying brand-months are deduplicated before
mapping to display groups. The Overview reader uses this same implementation.

## URLs, compatibility and bounds

`groupBy`, `measure=money|units`, `metric=revenue|coveredGrossProfit|gmPct`,
`others=1`, `page` and independent `channelPage` control the Sales projection.
The API validates enums, duplicates, bounded integer pages and screen ownership.
Financial metrics supplied with units are normalized to units server-side.
Global period/channel filters and pinned snapshots survive drills; changing dates
invalidates the snapshot. Cross-screen navigation drops page numbers. Within
Sales, independent pagers preserve the other section's page.

SQL performs ranking, monthly aggregation and pagination before serialization.
Existing snapshot input/SKU limits and read-only tenant transactions remain.
Only top groups, page rows, nine LY changes and exact totals are returned by the
workspace projection; the existing generic table API remains compatible.
No new chart library or client financial calculation is introduced. Floating
point is used only for SVG coordinates; monetary API values remain strings.

If optional YTD support is unavailable, S1/S3 use the selected interval and show
a notice. Legacy model-1 snapshots retain selected-period/LY summaries and ask
for refresh to obtain dated monthly facts. Missing LY history is never filled
with zeros. Freshness describes the source separately from the saved snapshot.

## Validation

- Isolated PGlite fixtures apply repository migrations; no configured database is accessed.
- Reconcile S1 monthly totals with O2, top-11 + Others with Total, paged remainder with Others, S3 category buckets with S1, and all channel pages/shares with period revenue.
- Verify 309 orders vs 312 units, covered margin thresholds, signed returns, missing/zero LY history, monobrand grouping, immutable snapshots and YTD/legacy fallback.
- Render UA/EN S1–S4, pinned filter-aware drills, disabled financial controls and accessible chart values.
- API checks validate Sales-only controls, enum/duplicate handling, page limits and signed-tenant boundaries.
- `npm run build` and `npx tsc --noEmit` pass; full Vitest suite: **707 tests across 64 files pass**.
- Browser verification uses actual components with synthetic fixture API responses, rather than production source data. Desktop light/dark, shared units/category controls, SKU drills, Others, chart values and narrow responsive layout are checked locally.

The financial thresholds and imported customer figures still require the
separate Stage 1 customer reconciliation/approval tracked in #38.
