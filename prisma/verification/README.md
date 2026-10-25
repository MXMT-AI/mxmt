# Merchandising model rollout and verification (#28)

Migration: `20261023000000_merchandising_data_model`.
Policy authority: [approved MVP decisions](../../docs/mvp-business-decisions.md), revision 0.1.
Baseline application/schema: `8fb4b92` (merged #27).

## Model boundaries

`Tenant.tenantId` remains the client boundary, `Sku` the canonical product and
`Brand` the existing brand. No second tenant, product or sync-run system is added.
All new relational links include tenant scope; import-backed facts also bind the
run to the exact source. Composite foreign keys harden the existing SKU/brand,
sales/SKU, inventory/SKU and catalog/brand/upload links. An active source cannot
reference another source's run, even within the same tenant.

| Requirement | Storage and identity |
| --- | --- |
| Categories and seasons | `Category`, unique tenant/key; explicit calendar months (all year by default), verification timestamp; `Sku.categoryId` |
| Supplier distinct from brand | `Supplier`, unique tenant/key; nullable terms and verification timestamp; brand default and SKU supplier override |
| Ownership and commission | Brand defaults; nullable SKU overrides mean inheritance, `UNKNOWN` overrides it explicitly; commission is a 0–1 ratio, not the SalesDrive unit flag |
| Product identity | Existing tenant/SKU key; `SkuAlias` unique tenant/source/type/value; conflicting alias assignments fail rather than arbitrarily matching |
| Raw payloads and sync runs | Extend `DataSource` with kind and source key; reuse `DataImportRun`; `DataSourceRecord` retains API/YML payload and hash per run/resource/external ID |
| Normalized order lines | `OrderLine` unique tenant/source/order/line/event; status, channel, paid/return dates and exact nullable financial amounts |
| Receipts and movements | `Receipt` unique tenant/source/external ID; `ReceiptLine` unique receipt/source line ID; movement type, posting evidence, supplier and nullable cost |
| Daily stock/cost/retail | Extend `InventorySnapshot`; existing tenant/SKU/date identity; actual observation, timezone and import provenance |
| Price history | `PriceHistory` unique tenant/source/SKU/stable source revision; observed time separate from nullable effective time |
| Versioned configuration | `MerchandisingConfig` unique tenant/type/key/revision; owner, approval reference and activation separate; SQL partial index permits one active revision |
| Daily calculated facts | `SkuDaily` unique tenant/SKU/business date/config/calculation version; input provenance, nullable metrics and diagnostics |
| Actions log | `MerchandisingAction`, tenant-scoped actor/config links and idempotency key; before/after and context |
| Incremental checkpoints | `SyncCursor` unique tenant/source/resource; successful run of the same source required by FK and trigger |

New money and quantities use `Decimal(18,4)`; rates/derived metrics have explicit
precision. Existing Float amounts, integer stock quantities, date-only fields and
14-day planner lead-time defaults remain intact for compatibility. New reports
must use the new Decimal facts, not copy their arithmetic through legacy Float
fields. Migrating legacy consumers and removing old columns requires a separate
reconciled contract migration.

New stock consumers treat `qtyInTransit` as unknown unless
`inTransitVerifiedAt` is present; the old default zero is not evidence. Legacy
`dateAdded` and `snapshotDate` do not prove first supplier receipt or observation
time. No source/account values, ownership, commission, cost, receipt dates or
approval records are guessed by this migration. Category seasons use the approved
all-year default but remain unverified until confirmed.

`DataSource.driveFileId` becomes nullable for API/YML sources. A SQL check requires
Sheets sources to retain a non-empty file ID and non-Sheets sources a non-empty
source key instead. Source keys are stable account/feed identities, never API keys
or URLs containing secrets. Existing Sheets reporting, agents and the 07:00
scheduler explicitly filter `GOOGLE_SHEETS`; adding a connector does not activate
new calculations or scheduling.

## Migration and backfill sequence

1. Run `npm ci`, `npx prisma validate`, `npm test` and `npm run build`. The migration
   tests replay the complete previous SQL history on isolated PostgreSQL PGlite,
   seed two tenants with overlapping identities, apply the new migration and
   exercise constraints, preservation, failed migration rollback and guarded
   schema rollback/reapplication. They never read application DB credentials.
2. Create a staging Neon branch from the current deployment and record the parent
   branch, restore point, commit and existing migration history. Use a direct
   connection for migration tooling. Do not use `db push` or reset production.
3. Record counts and financial totals for legacy SKU, sales, inventory, catalog,
   import and report tables. Run the pending migration on staging with
   `npm run db:migrate:deploy`. It is one transaction and aborts on inconsistent
   tenant/source/brand links; investigate those records and resolve them through a
   reviewed data correction before retrying. Confirm that the transaction rolled
   back and no migration DDL remains, inspect the failed entry in
   `_prisma_migrations`, then run
   `npx prisma migrate resolve --rolled-back 20261023000000_merchandising_data_model`
   against that same staging database before retrying `npm run db:migrate:deploy`.
   Otherwise Prisma blocks later deploys with P3009. This recovery applies only to
   a failed migration whose changes have been rolled back; it does not reverse a
   successful migration (see the rollback section below). The migration never
   deletes or reassigns inconsistent records. See the
   [Prisma failed-migration recovery guidance](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/patching-and-hotfixing#option-1-mark-the-migration-as-rolled-back-and-re-deploy).
4. Compare the recorded legacy counts/totals and active imports. Verify both tenants'
   reporting, scheduler selection, catalog upload and brand deletion. Optional
   SKU/brand links use `NO ACTION` to protect the required tenant column; the brand
   delete route detaches only that tenant's SKUs inside the delete transaction.
5. Backfill in bounded tenant batches only after source mappings are approved.
   Keep original SKU IDs and legacy category/collection text. Upsert reviewed
   category keys and map `categoryId`; do not infer calendar seasonality from
   collection labels such as SS26. Map external product IDs through reviewed
   `SkuAlias` entries, quarantining ambiguous identities in existing `ImportIssue`.
   Link existing brands to verified suppliers, then add explicit SKU overrides.
6. In #29–#33, create connector sources/runs through the existing import lifecycle;
   persist sanitized/raw provenance per run before normalized projections. Use
   stable source identities for upserts below. Do not prune a run referenced by
   normalized facts, price history, snapshots or checkpoints: these FKs deliberately
   preserve provenance. Any retention/archival change needs an explicit policy.
7. Load only verified supplier receipts with the correct movement/posting policy.
   Transfers, write-offs and inventory adjustments cannot establish first receipt.
   Backfill dates/cost only from evidence. Do not expand legacy daily sales into
   invented order lines or manufacture midnight observation timestamps from dates.
8. Add approved configuration revisions in #34 with actual approving user IDs and
   evidence references. The migration seeds no profile and activates nothing. In
   #35–#38, calculate versioned daily results and reconcile before switching any
   consumer. Keep E01–E03 gates from #27; missing September snapshots remain missing.
9. Repeat staging checks with production-like volume and the current deployed
   schema, then schedule production rollout with an observed lock window and
   restore point. Apply the reviewed migration before the new application build.
   The isolated PGlite checks do not certify production data, permissions, lock
   duration or deployment compatibility by themselves.

## Import idempotency and provenance contract

- Retry a run by its existing tenant/idempotency key. Within a run, upsert raw
  records by run/resource/external ID; keep the original payload hash immutable.
- Upsert normalized order events by tenant/source/order/line/event, receipts by
  tenant/source/external ID, receipt lines by receipt/line, and aliases by
  tenant/source/type/value. Never use import run IDs or arrival time as event IDs.
- `OrderLine.eventKey=current` is only for a source line's current projection.
  Where verified refund/event IDs exist, use stable event keys for separate events;
  the later normalizer must choose one reconciled accounting representation and
  must not count the current projection and its event rows twice. Unknown return
  dates remain null and diagnostic. D01–D05 still require real payload verification.
- Append price history by stable source revision/observation key, not by the retry
  run. A genuine later observation may add a new history row. Update the existing
  tenant/SKU/business-date stock row with the latest valid observation and retain
  raw payloads for earlier observations; do not overwrite it with an older retry.
- Daily results upsert by their full version key. Store input run IDs/checksums,
  snapshot observation times and coverage in `inputProvenance` so results are
  reproducible. Unknown amounts remain null, not zero.
- Config payloads and approved provenance are immutable by application convention:
  create a new revision for changes, atomically deactivate the old revision before
  activating an approved replacement. Record changes in the actions log. The SQL
  checks enforce approval completeness and active uniqueness, not payload shape.
- Finish a run successfully before advancing its resource cursor in the same worker
  transaction. SQL rejects checkpoints pointing at failed/pending or foreign runs;
  overlap windows, pagination and stale-event protection belong to the connectors.

## Verification and rollback

Run the focused check with
`npx vitest run tests/lib/merchandising-migration.test.ts`.
This is real PostgreSQL execution in a local WASM runtime, with synthetic fixtures.
The full test suite remains the legacy behavior check. Prisma validation/diff
cannot express the migration's CHECK constraints, cursor trigger or partial active
config index; retain those SQL additions in future migrations.

The preferred incident response is to roll the application back while retaining
the additive schema and data, then apply a reviewed forward fix. Existing columns
and rows are preserved. Once new merchandising data exists, do not drop it.

`28-rollback.sql` is an emergency **pre-use** rollback, kept outside the deployable
migration history. It locks affected tables, refuses any new-model rows or
populated new fields, then restores the baseline columns/FKs without CASCADE.
Stop writers and take a restore point before using it on a staging clone. It is
tested for preservation, refusal after use and reapplication. After new data is
written, export and reconcile it and use a forward fix or a separately approved
restore procedure instead.

Prisma has no automatic down migration. After manually reversing an already
successful deployment, `_prisma_migrations` still records it as applied. Do not
edit that history or use `migrate resolve --rolled-back` for a successful run.
Keep the app at the matching baseline and prepare a reviewed forward migration to
re-expand, or restore the entire isolated database including migration history.
The test's SQL reapplication proves reversibility, not a production history reset.

The rollout follows the existing [runbook](../../RUNBOOK.md) and the
[Prisma expand-and-contract guidance](https://www.prisma.io/docs/guides/database/data-migration).
No production migration or backfill is performed by preparing this task.

For SalesDrive scheduling, webhook relay, manual refresh and the external worker,
see [automatic sync verification (#32)](32-automatic-sync.md).

For canonical brands, product types and source-linked diagnostics, see
[product normalization verification (#33)](33-product-normalization.md).

For versioned client policies, ownership overrides, supplier terms and category
seasons, see [merchandising settings verification (#34)](34-merchandising-settings.md).

For deterministic financial reports, LY comparisons, covered margin and frozen
exports, see [sales metrics verification (#35)](35-sales-financial-metrics.md).

For daily velocity, WOH, STR, dated valuation and availability materialization,
see [daily SKU metrics verification (#36)](36-daily-sku-metrics.md).

For canonical SKU status, shortage union, K4 brand signals and the phased sync
recalculation consumer, see [classification verification (#37)](37-sku-classification.md).

For Stage 1 benchmark comparison, private frozen evidence and Sasha/Olia sign-off,
see [Zavod reconciliation (#38)](38-zavod-reconciliation.md). Customer acceptance
remains pending until the required source package and approvals are supplied.

For version-pinned Overview, Sales, Stock, Repricing and Reordering read models,
see [screen API verification (#39)](39-screen-apis.md).

For MVP routes, URL-owned shared filters, monobrand grouping and retained legacy
features, see [navigation verification (#40)](40-mvp-navigation.md).

For the template-based Overview summary, reconciled O1–O8 KPIs/actions and frozen
YTD supporting facts, see [Overview verification (#41)](41-overview.md).
