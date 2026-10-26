# Server-side reordering calculator (MVP 20 / #46)

## Scope and authority

The SalesDrive MVP calculator in `lib/reorder-calc.ts` implements approved D13,
D14 and D18–D21. It consumes version-2 frozen screen/SKU inputs from #36–#39;
it does not infer current demand from the legacy Sheets dataset.

The existing Sheets agent simulation and its 45-day multiplier contract now live
in `lib/legacy-reorder-calc.ts`. Its endpoint, modal and sheet export import that
explicit legacy module, preserving existing agent behavior. The MVP endpoint
rejects `qtyMultiplier` and client-supplied formula, stock, velocity and cost.

No schema migration, order submission, stock update or action log is introduced.
The reordering workspace belongs to #47; shared CSV/action auditing belongs to
#48. Export and execute capabilities remain disabled until that work exists.

## Formula and canonical metrics

`target = ceil(speed_per_week / 7 * (lead_days + cover_after_days))`

`demand = max(0, target - stock - in_transit)`

`quantity = demand == 0 ? 0 : ceil(demand / MOQ) * MOQ`

The ceiling applies before stock/transit subtraction; MOQ rounding applies only
to positive demand. Fractional stock and confirmed transit quantities remain
exact decimal strings. Quantities and purchase amounts use the existing local
48-digit financial Decimal implementation. The same quantity primitive is
reused by the settings-policy preview, avoiding a separate approximation.

The canonical 12-week velocity from #36 is authoritative. Its denominator must
be at least four weeks and its state must be KNOWN/ZERO with a supported observed-
days or receipt-fallback basis. The calculator does not recompute velocity from
client data. A denominator below four weeks or return-dominated/unavailable
velocity requires review; it cannot create a positive order. Receipt-date
fallback remains explicitly identified in row warnings and the frozen metrics.

The shared D14 shortage helper is used by classification and scenario previews.
Service/data-error/new/off-season/inactive SKUs cannot enter the automatic
shortage union. Eligible active SKUs satisfy `stock == 0 OR days_to_zero < lead +
14`; overlapping OOS/risk conditions count the SKU once. Scenario lead changes
re-evaluate this predicate without changing canonical status. Urgency is red
strictly when `days_to_zero < lead`; excluded rows have unavailable urgency.

Brand mode shows matching merchandise, including excluded zero-quantity rows
with reasons. Shortage mode includes the approved union, off-season rows shown
separately with quantity zero, and manual-review rows whose missing velocity,
stock, activity, classification or lead prevents determining shortage. Missing
transit/cost alone does not turn otherwise healthy stock into a shortage.

## Settings, incomplete data and procurement cash

Per-SKU scenario terms take precedence over global scenario terms, then frozen
supplier/client policy. Effective supplier identity already resolves the SKU
supplier override before the brand default. Missing supplier settings may use
approved client defaults (30 lead days, 60 post-delivery cover, MOQ 1), with
`CLIENT_DEFAULT` provenance; legacy brand defaults are not silently rewritten.
Lead/coverage overrides allow 0–3650 whole days; MOQ allows 1–1,000,000.

Only a verified snapshot transit value or explicit scenario confirmation is
used. Unknown transit is not zero and leaves recommended quantity unavailable.
`overrides: [{ skuId, inTransitQuantity: "0" }]` explicitly confirms zero for
that scenario, without changing the source snapshot or persisting a new fact.
Values must be non-negative decimal strings with at most four decimal places.

Missing velocity/stock/lead/coverage/MOQ/transit/activity yields a visible
quantity-review state. Missing or zero ordinary-product cost leaves a known
quantity visible but purchase amount unavailable. Unknown ownership and
consignment without confirmed purchase terms cannot produce procurement cash
claims. Existing consignment commission or supplier lead/MOQ verification is
not treated as purchase-term confirmation. Unknown supplier identity or
unverified supplier terms block that row's future export.

All rows carry issues, exclusion reasons, effective terms and provenance.
Off-season, quarantined-new and inactive rows recommend zero with reasons;
zero demand never becomes MOQ one. Invalid/missing facts are not silently
removed from a selected scenario or replaced by invented inputs.

Supplier groups use stable supplier ID plus currency, never display text or
brand name. Different currencies are never added into one cash total. Currency
and supplier totals expose known quantity, covered purchase amount and explicit
unknown counts; complete totals remain null when incomplete. Global totals
contain units only. `canExport` describes a complete positive validated
selection for future #48, not an implemented download or authorization grant.
Zero/excluded rows are never export-eligible.

## API and reusable export boundary

`POST /api/merchandising/reordering/preview` requires a signed session with at
least VIEWER access. Tenant identity comes exclusively from that session;
responses use `Cache-Control: no-store`.

Request:

```json
{
  "snapshotId": "frozen-screen-id",
  "mode": "shortage",
  "filters": { "brandId": "brand-id" },
  "parameters": { "leadDays": 30, "coverDays": 60 },
  "overrides": [{ "skuId": "sku-id", "inTransitQuantity": "0" }],
  "page": 1,
  "pageSize": 25
}
```

All fields except `snapshotId` are optional. Mode defaults to `shortage`; `brand`
mode requires a brand ID. Parameters default to an empty override object,
preserving each row's frozen policy; `defaults.clientPolicy` exposes the pinned
client settings separately. Filters support brand/category/supplier/SKU/currency,
with `__unassigned__` representing missing IDs. Overrides may also supply
per-SKU lead/coverage/MOQ, but may not change supplier identity or frozen facts.
Foreign, excluded or out-of-filter SKU overrides return 422. A valid override
may legitimately cause its SKU to leave the shortage list.

The request body is limited to 4 MiB; input sets and overrides are limited to
20,000 SKUs; page size is at most 200. Duplicate IDs, unsupported fields, numeric
coercion, invalid ranges and formula injection are rejected before calculation.

Preview runs in a read-only repeatable-read transaction. It joins only persisted
screen inputs and daily metrics, not live catalog, supplier, inventory or order
facts. Incomplete snapshots fail rather than returning partial inputs. All
rows, supplier groups and totals are calculated before display pagination.
`previewId` includes snapshot/version and normalized scenario intent, excluding
pagination; repeated requests reproduce the same selected data version.

Future export can call `calculateReorderingInSnapshot` with validated parameters
inside its own authorized audit transaction and use the full server result.
The screen API advertises this preview endpoint, while UI/export work remains
separate.

## Validation

Tests cover target ceilings, MOQ, zero/negative demand, fractional stock/transit,
explicit transit zero, overrides, strict shortage/urgency boundaries, seasonality,
new/inactive exclusions, missing data, return-dominated velocity, the minimum
four-week denominator, receipt fallback, supplier/currency separation,
deterministic IDs, pagination, immutable source data, tenant isolation,
bounded/authenticated API requests and error redaction.

PGlite fixtures apply production migrations with synthetic data. No production
database, supplier order, CRM record or customer workbook was modified. No new
UI was introduced; browser/reference layout verification belongs to #47.
These tests do not replace pending customer benchmark acceptance in #38.

Validation run on 2026-10-26:

- `npm test -- --maxWorkers=2`: 861 tests passed across 73 files.
- `npm run build`: passed, including the new preview route and legacy agent route.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- Focused store verification additionally confirmed that transit verified before
  the snapshot cutoff is consumed, while a future verification remains unknown.

## CodeRabbit precision follow-up

Reproduced the integer-boundary over-ordering case before fixing it: velocity
8 units/week over 7 days produced target 9 after early Decimal division; MOQ 8
amplified the recommendation to 16. The helper now multiplies the weekly rate
by the day count before dividing by 7 and applying the target ceiling.

Regression tests cover MOQ 1 and 8, stock that exactly covers demand (remaining
quantity zero), both calculator/policy consumers, and a genuinely fractional
value that must still round up. Added documentation for canonical-ID matching.
The follow-up full suite passed 865 tests across 73 files; production build passed.
