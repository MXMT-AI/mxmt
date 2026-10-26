# Server-side repricing calculator (MVP 18 / #44)

## Scope

Implements deterministic R1–R4 calculations using approved decisions D08 and
D10–D12. The legacy AI/elasticity engine in `lib/promo-calc.ts` remains separate.
No catalog prices, CRM records, inventory, action logs or financial policy settings
are changed. No database migration is needed.

The interactive workspace belongs to #45. CSV generation, idempotent action
logging and execution/export permissions belong to #48. The screen API now
advertises the repricing preview endpoints; actual export/execute capabilities
remain disabled. `canExport` describes selection/price validity for the future
export consumer, rather than granting permission or implementing a download.

## API contract

Both endpoints require a signed session with at least VIEWER access. Tenant IDs
come exclusively from that session. Responses use `Cache-Control: no-store`.

1. `POST /api/merchandising/repricing/inputs`, body `{ "snapshotId": "..." }`.
   Returns an immutable `inputSetId`, version, source/snapshot provenance,
   defaults, presets and 1/3/7-month history availability. The body is limited to
   2 KiB. Repeated requests reuse the same inactive calculation manifest.
2. `POST /api/merchandising/repricing/preview`, body containing `inputSetId`,
   optional `parameters`, `filters`, `selection`, `manualPrices`, `editContext`,
   `page` and `pageSize`. Unknown fields, client facts, numeric coercion,
   duplicates and out-of-range values are rejected. The body is limited to
   4 MiB; page size is at most 200; input sets and each edit list are limited
   to 20,000 SKUs. Decimal filter and price values are decimal strings.

Parameters default to CAPITAL, 15–40% discount, 70% share, 10 days, cost
protection enabled and liquidation disabled. Supported durations are 4/10/14
days. Presets populate sliders without introducing another pricing algorithm.
Filters support DEAD/RISK/DEAD_OR_RISK, brand/category/SKU/currency, inclusive
price/stock bounds and sold-unit maximum over 1/3/7 months. Default status is
DEAD and default currency is UAH. Non-UAH rows are never included in UAH totals;
no exchange rate is invented. Missing brand/category IDs use `__unassigned__`.

A response includes globally calculated totals/counts, paginated rows,
`previewId`, `editContext`, input provenance and explicit eligibility/price
errors. Monetary values and ratios are decimal strings; discounts and margins
in totals are ratios, while slider and target discounts are percentages.
`previewId` is independent of pagination. Dates use the source timezone.

Manual selection uses `{ "skuId": "...", "included": true }` entries and
manual prices use `{ "skuId": "...", "price": "240.01" }` entries. Obtain
`editContext` from an unedited preview first. It binds edits to the input set,
normalized filters and parameters: stale edits return 409. This reset fence is
not an authorization token. Every edited SKU is revalidated against the server's
filtered eligible universe, even when the client supplies a matching context.

## Frozen inputs and history

Prices, cost, stock, names, classification and effective ownership come from
version-2 persisted screen/SKU inputs, with no live catalog joins during preview.
Creating an input set initially requires unchanged source/settings state and no
pending synchronization; otherwise a fresh screen snapshot is required. Cached
input sets can still be previewed after subsequent synchronization or settings
changes, without mixing new facts into old scenarios.

Canonical normalized SALE/RETURN/CORRECTION quantities are aggregated separately
for completed local-date windows `[asOf minus N calendar months, asOf minus one
day]`. Returns retain their signed quantity. Preorders, excluded facts and
non-merchandise are excluded. Each window requires complete imported history;
unknown history is `null`, never zero. A sold-unit filter excludes unknowns.
An input-fact limit marks history unavailable while preserving basic repricing
without a sold-unit filter. Other report/source errors remain explicit failures.

The repeatable-read publication transaction stores compact per-SKU sales
aggregates in an inactive, versioned GENERAL calculation manifest. It references
the existing screen snapshot for price/stock facts. Preview is a read-only
repeatable-read transaction. A future export can reuse
`calculateRepricingInSnapshot` inside its own authorized audit transaction.

## Pricing rules

- Eligible SKUs are canonical DEAD/RISK merchandise with positive stock,
  verified OWN ownership, positive current price and known positive cost.
  Consignment and unverified rows can remain visible with exclusion reasons.
  All R1 filters combine with AND before the eligible population is counted.
- CAPITAL and SEASON rank by frozen cost capital descending, then stable SKU
  ID. TURNOVER ranks by days since last sale, then SKU ID; proven never-sold
  stock uses its first receipt date. Unknown age is excluded from TURNOVER.
- Automatic selection is `ceil(eligibleCount * share / 100)`. For example,
  31 eligible SKUs at 70% select 22, following D10 rather than the reference's
  inconsistent example. Manual inclusion outside this automatic share remains
  restricted to filtered eligible SKUs.
- After checkbox edits, the final selection is ranked again. Discounts run
  from maximum for the first SKU to minimum for the last. A single selected
  SKU receives the maximum; an empty selection has zero monetary totals and
  null discount/margin. SEASON applies the maximum to every selected SKU.
  Display order remains cost capital descending, independently of goal rank.
- Automatic prices round half-up to UAH 10. Protection clamps to
  `ceil(unitCost / 10) * 10`. Manual prices retain at most two decimals and
  must also respect that rounded floor when protection is enabled. D12
  prohibits automatic price increases; valid manual increases remain explicit
  user overrides and can produce a negative effective discount.
- Below-cost pricing requires protection disabled, explicit liquidation and
  a nonblank reason. Invalid manual prices return 422. A selected automatic
  zero price or price increase is surfaced as a blocked row; the preview is
  not export-ready until corrected or deselected. No silent replacement SKU
  or partial export-ready selection is substituted.
- Only selected valid rows enter totals: cost capital, quantity, original and
  discounted stock value, weighted discount `1 - newValue / oldValue`, own-stock
  gross profit and revenue-weighted gross margin. Revenue assumes all selected
  stock sells; it is not a sales forecast. Duration is scenario metadata.
  Selected row margins are red below zero, amber below 20%, green from 20%;
  unchecked rows are gray.

## Verification

Synthetic fixtures apply the production migrations in PGlite. Tests cover
ranking/ties, ceiling selection, zero/single/final selection gradients, AND
filters, unknown histories, ownership/currency exclusions, half-up rounding,
rounded cost floors, manual cents, liquidation, blocked automatic prices,
weighted totals, stale edits, deterministic IDs, pagination, immutable inputs,
tenant isolation, signed-session API access, body limits and error redaction.

No production database, SalesDrive API or customer workbook was modified.
These fixtures verify the calculator contract; they do not replace pending
customer benchmark acceptance in #38. There is no new UI requiring visual
comparison in this backend-only task.

Validation run on 2026-10-26:

- `npm test -- --maxWorkers=2`: 793 tests passed across 68 files.
- `npm run build`: passed, including both new API routes.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
