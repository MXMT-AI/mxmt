# Brands, product types and data exceptions (#33)

## Authority and compatibility

Implements issue #33 and section 5 of the [reference](https://claude.ai/artifact/NKECTQztioMNUsgsRjMhwq).
Reviewed October 24, 2026. Examples include SEIKO/Seiko, BRISTON/Briston,
ZEISS/Zeiss, UNIMATIC/Unimatic, ARTHUSS/ArtHuss and СЕМЕН ШИРОЧИН/Семен Широчин.
The currently published artifact also contains section 11, which was unavailable
when #27 recorded its earlier observation. This is not an owner-approved frozen
benchmark. The approved #27 decisions and E01–E03 evidence gates remain authoritative.

Reuses existing Brand, Sku.productKind, OrderLine, ImportIssue, raw source records,
MerchandisingAction, connector workers and Settings. Financial formulas remain
#35–#37; the existing Sheets report rules are not replaced by SalesDrive rules.
The Sheets pipeline version advances to 9 solely to reproject malformed raw
transaction values as NULL rather than fabricated zero on the next import.
Earlier import runs retain their original values and provenance.

## Brand identity

`normalizedBrandKey` implements `upper(trim(name))`; blank/whitespace-only vendor
values become Unbranded. It does not invent spelling/fuzzy aliases. Original
vendor text remains in raw YML and Sku.catalogAttributes. Canonical brand IDs,
normalization version and applied alias revision are retained in those attributes.

Brand.normalizationKey has a tenant-scoped unique key, supplementing the existing
case-insensitive name constraint. New imports reuse the canonical brand. Planner
create/rename also populate this key so surrounding whitespace cannot create a
second normal brand through that entry point.

The migration populates keys only for unambiguous existing groups. Padding variants
with conflicting records keep their IDs, terms and associations; no ownership,
commission, supplier or currency is selected/merged arbitrarily. Imports diagnose
ambiguous brand identity instead of creating another brand. An explicit alias can
select the intended existing target for future catalog observations.

BrandAlias is tenant-scoped and points directly at an existing Brand ID. ADMIN
changes are validated, versioned and audited in the existing action log. Aliases
can be added, redirected or removed through Settings; refresh the catalog to apply
changed mappings to imported products. Raw source spellings remain unchanged.
Unbranded is a virtual group with missing-brand diagnostics, not a fabricated
supplier or ownership policy. The calendar stock aggregation also retains this
group instead of silently dropping its units.

## Product types and exclusions

Uses the existing productKind values MERCHANDISE, SERVICE, GIFT_CARD and UNKNOWN.
An administrator explicitly confirms/changes type per SKU in Data quality. Imports
preserve these overrides. Product names alone are not reliable service/gift-card
identifiers; no customer-specific name heuristic is hardcoded. New unverified
imports remain UNKNOWN and appear in diagnostics until confirmed.

`productEligibility` is the shared boundary for new consumers:

| Type | Merchandise revenue/margin | Service revenue component | Stock/classification |
| --- | --- | --- | --- |
| MERCHANDISE | included subject to financial coverage | no | included with valid observations |
| SERVICE | excluded from merchandise components | separate | excluded |
| GIFT_CARD | excluded | no; separate gift-card component | excluded |
| UNKNOWN | unverified/excluded | unverified | excluded for imported products |

Current order components are disjoint and currency-separated, with gift cards and
services shown separately from merchandise and returns/corrections. This diagnostic
view covers all retained current lines; it is not a period financial report.
Unknown revenue remains NULL and is counted as uncovered. No cross-currency total,
missing-cost profit assumption or completed financial calculation is presented.

Legacy analyst/calendar classification entry points now exclude explicit services
and gift cards, preserve fractional snapshot quantities, and refuse unknown or
negative stock instead of converting it to zero. Legacy products without a new
source/type projection retain their existing type behavior. Zero-price stocked
merchandise is flagged and exposed as ineligible for repricing until corrected.

Type edits are audited atomically and invalidate existing source recalculation
intents into WAITING_ENGINE, consistent with #32. They do not start the pending
SalesDrive financial engine or rewrite historic raw records.

## Signed movements, costs and dates

Order projection version 2 adds signedQuantity, signedRevenue, signedCost and
normalization provenance alongside retained source quantity/amounts. Returns are
signed once even when source quantity is already negative. Absolute and percentage
discounts operate on the correct magnitude before applying the movement sign.
Signed correction rows may remain unlinked/uncategorized; they are retained and
shown separately instead of being dropped as unmatched merchandise.

Revenue/cost inclusion still requires the approved source amount/currency mapping
and a usable event date. A generic updateAt never becomes a return date implicitly.
A separately verified return-event DTO timestamp or an explicitly approved
SOURCE_MAPPING `dates.returnDateField` can supply the event date. Without one,
RETURN_DATE_UNAVAILABLE remains visible and signed financial amounts stay NULL.
The approved mapping parser also accepts explicit CORRECTION statuses.

A SALE orderTime fallback requires `dates.saleOrderTimeFallback: true` in the
approved source mapping. It is flagged/dateInferred and retains date precision.
No fallback is silently enabled. Ordinary zero purchase cost remains unknown.
Invalid quantities are quarantined with raw evidence, never normalized to zero.

The first-sale age proxy is a separate, labelled reference for insufficient
history. It does not overwrite firstReceiptAt, establish an STR cohort or silently
replace the verified receipt required for new-product quarantine. Missing receipt
dates remain diagnostic even when a sale proxy exists. Future receipt/proxy dates
and negative derived metrics yield exceptions, not negative ages or zero substitutes.

Existing signed projections are not guessed during migration. Settings reports
normalizationReplayRequired for older OrderLine records. Replay history to apply
projection version 2 and any approved date/amount mappings to unchanged older data.

## Diagnostics, authorization and provenance

`GET /api/data/quality` is authenticated and tenant-scoped, with bounded search and
25-product pages. It returns current-connection observations, per-SKU exceptions,
SKU counts, currency-separated observed cost values and explicit unvalued counts.
Unknown costs do not become zero; partial sums retain coverage counts. Current
order-line exceptions include source SKU/order identities, not customer payloads.
The view includes Unbranded stock, order components and raw-to-normalized record keys.

`POST /api/data/quality` requires ADMIN/SUPER_ADMIN and a body no larger than 4 KiB.
Actions change an alias or product type using the signed session tenant/actor.
Cross-tenant targets fail. Tenant row locks serialize metadata edits with catalog
identity activation. The UI shows save failures, saved-but-refresh-failed outcomes,
read-only states, source lineage and a warning before leaving unsaved alias input.

ImportIssue.entityKey identifies each SKU/order line within a run/code. Unique
per-entity diagnostics avoid duplicate issues on replay while retaining historical
raw import context. Current diagnostics recompute from current observations/types,
so corrected metadata no longer appears as an active exception merely because an
older run retained its warning.

Read payloads are bounded: 25 SKU rows, 25 order exceptions, 500 brand options and
100 alias rows. These are initial administrative-view limits; alias API mutations
remain valid for any tenant-owned target ID. Source records and credentials are
never exposed in this read model.

## Verification and rollout

Tests replay migrations and execute production SQL in isolated PostgreSQL/PGlite.
They cover reference spellings, whitespace-only vendors, old ambiguous brands with
different currencies, alias replay, type persistence, gift/service stock exclusions,
signed refunds/corrections and discounts, raw lineage, null preservation, date
fallbacks, negative metrics, tenant isolation and administrative audit. Existing
10,000-order/catalog, retry, scheduling and authorization tests continue to run.
Browser checks use the actual component with synthetic responses, not a customer
account: Ukrainian/light, English/dark, 320 px, type save, alias save, read-only
controls, empty/error states and source lineage.

Apply the versioned migration in an isolated environment before deployment.
Review classification and aliases, replay order history for the new projection,
then refresh the catalog. Use a reviewed forward fix/restore after new data exists;
do not reinstate NOT NULL on legitimate unknown source amounts or drop audit/raw
history to reverse the change. No production migration, live import or metadata
edit was performed while implementing this task. E01–E03 remain activation gates
for customer-specific mappings and final financial reconciliation.

Final local validation (2026-10-24):

- `npm test`: 41 files, 350 tests passed.
- `npx tsc --noEmit`: passed.
- `npx prisma validate`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Generated schema SQL matches the migration before explicit brand-key backfill/check.
- Synthetic browser checks passed for type/alias saves, failed saves, empty/viewer
  states, keyboard lineage disclosure, Ukrainian/light and English/dark at 320 px.
