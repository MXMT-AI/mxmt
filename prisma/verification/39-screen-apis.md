# Five screen APIs and consistent drill-downs (#39)

Migration: `20261025030000_merchandising_screen_models`.

## Request flow

Both endpoints require a signed session with at least `VIEWER` access. Tenant IDs
come from that session; callers cannot select another tenant. Responses use
`Cache-Control: no-store`.

1. `POST /api/merchandising/snapshots` with an object such as:

   ```json
   { "dateFrom": "2026-09-01", "dateTo": "2026-09-30", "asOf": "2026-10-25" }
   ```

   The dates are optional; `dateFrom` and `dateTo` must be supplied together.
   Existing sales-period and stock-date validation/defaults apply. The body is
   bounded to 2 KiB and rejects unknown properties. The response contains
   `snapshotId` and `context` with period, stock date/cutoff, timezone, settings
   revisions, calculation IDs and calculation versions.
2. Use that same ID in `GET /api/merchandising/{screen}?snapshotId=...`, where
   `screen` is `overview`, `sales`, `stock`, `repricing` or `reordering`.
3. Follow a grouped row's `drillDown` URL. It preserves the snapshot and common
   filters, selects that group's currency and ID, and switches to SKU grouping.
   Start a new snapshot explicitly to refresh the underlying data.

## Query contract

| Control | Values and behavior |
| --- | --- |
| `domain` | `sales` or `stock`; selects the table on Overview. Sales requires `sales`; inventory screens require `stock`. Overview defaults to stock. |
| `groupBy` | `sku` (default), `brand`, `category`; `channel` is available only for sales tables. |
| `page`, `pageSize` | Defaults 1/25; page 1–100000, page size 1–200. |
| `direction` | `asc` (default) or `desc`; numeric sorting uses SQL numeric values, with nulls last and stable ID/currency ties. |
| `sort` | Default `name`. Sales: name, currency, revenue, units, orderCount, coveredGrossProfit, gmPct, lyRevenue, revenueDelta. Stock: name, currency, quantity, stockCost, stockRetail, weeksOnHand, velocityPerWeek, daysToZero, sellThroughRatio, skuCount. |
| Common filters | `brandId`, `categoryId`, `skuId`, `currency`, `search`. Search is literal, case-insensitive and limited to 200 characters. IDs are limited to 200 characters. |
| `channelId` | Filters sales only. Stock always reports `ALL_CHANNELS` with localized labels, including on Overview. |
| Stock filters | `classification` (canonical SKU status), `ownership` (OWN/CONSIGNMENT/UNKNOWN), `supplierId`. Rejected on a sales table. |
| Reordering `mode` | `shortage` (default) uses the stored shortage union; `brand` requires `brandId` and includes active/off-season merchandise for review. Other screens reject this control. |

Unknown or repeated parameters and unsupported sort/filter combinations return
400. `__unassigned__` selects a null group or currency. Currency codes otherwise
use three uppercase letters. Money is never combined across currencies and no FX
conversion is inferred.

Each response contains `context`, `freshness`, `dataState`, domain summaries,
`table` (rows, column metadata, pagination), and read-only `capabilities`. An empty
filtered table is explicitly `EMPTY`; pagination past the last page preserves the
total row count. Sales preorders and product-kind movements remain separate from
headline sales. The monthly target retains `CLIENT_MONTHLY_TARGET` scope even
when actual sales are filtered; it is not presented as an allocated brand target.

Money, quantities and ratios use decimal strings. Column metadata gives the unit,
encoding, nullability and the reason unavailable values can be null. Unknown
currency/coverage is retained. Distinct order counts and ratios must be recomputed
over the selected facts, not added across SKU rows; the server summary does this.

## Consistency and access boundaries

Snapshot creation calls the existing financial and daily-SKU engines inside one
repeatable-read transaction. It verifies matching source/settings provenance,
publishes an inactive derived manifest, materializes financial facts and binds
frozen SKU metadata to the exact daily rows atomically. Failed publication rolls
back all new component publications. Repeating identical inputs reuses the ID.

Reads never fall back to newer component caches or mutable catalog facts. They
aggregate the pinned rows in SQL, share the existing financial/stock finalizers,
and perform server-side filtering, sorting, counting and pagination. SKU details
are joined after pagination in one set operation; query count does not grow with
page size. Snapshot and SKU-to-daily foreign keys include tenant scope. A foreign
or missing snapshot returns 404; unsupported calculation versions return 409.

Only source progress is live. Freshness reports SOURCE_UNAVAILABLE, SYNCING,
SOURCE_CHANGED, HISTORICAL, STALE or FRESH, with separate source-changed, historical,
busy and stale flags. The two-hour order-watermark age is a source freshness
signal, not a claim that every stock observation is current. Stock cutoff and
per-SKU observation timestamps remain visible. Source changes recommend an
explicit refresh without silently replacing the selected snapshot.

Repricing defaults to DEAD merchandise with positive stock; RISK can be selected.
Reordering uses the canonical shortage union without double-counting OOS/RISK.
Candidate rows expose frozen cost, price, barcode, supplier/policy context and
eligibility reasons. These endpoints do not execute repricing/reordering scenarios,
exports or source mutations. Those engines and screen UI remain separate roadmap
work; `capabilities.preview` and `capabilities.export` are false.

## Verification and rollout

Run:

```sh
npx vitest run tests/lib/merchandising-screen-api.test.ts tests/lib/merchandising-screen-store.test.ts
npm test -- --maxWorkers=2
npx tsc --noEmit
npx prisma validate
npm run build
git diff --check
```

The PostgreSQL PGlite suite applies the complete migration history to synthetic
tenants. It verifies shared versions, existing formula parity, brand/category
drill-down reconciliation, channel-independent stock, currency/null handling,
candidate lists, strict controls, signed-role access, immutable reads, rollback,
foreign-key isolation and constant query counts. No production data is read.

Apply the additive migration on an isolated staging database before deploying the
application. Check representative tenant volume, materialization duration, query
plans and pagination there; local fixtures do not establish production capacity.
Existing manifests are not backfilled: the new endpoint creates screen snapshots
explicitly. Prefer application rollback with the additive schema retained, then
a reviewed forward fix. Do not delete used snapshot/daily rows or run `db push`.

Preparing this task does not deploy a migration, change production data or approve
the pending Zavod benchmark/threshold acceptance from #38.
