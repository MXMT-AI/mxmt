# Database schema startup incident — 2026-10-29

## Confirmed cause

The local dashboard reports Prisma P2022: Sku.catalogAttributes is absent.
Read-only inspection using the existing local runtime configuration confirmed:
- Only 4 of the repository's 23 migrations are applied; 19 remain pending.
- Latest applied migration: 20260827000000_data_import_reporting_schema.
- Missing column is introduced by 20261024010000_catalog_receipts_history.
- Pooled runtime and direct migration URLs target the same database/schema.
- No tenant/source/brand relationship violations were found by the #28 preflight.

The screenshot also reported a Vercel runtime error. After the approved database
update, the existing Vercel deployment opened its authenticated dashboard normally
without a code redeploy. No Vercel environment variables or credentials were changed.

Legacy count checkpoints, without record content:
Tenant 1; User 1; Sku 4037; Brand 105; SalesRecord 18703; InventorySnapshot 8043;
CatalogItem 3510; DataSource 1; DataImportRun 1.
These are time-specific observations, not acceptance benchmarks or a backup.

## Prepared fix

Branch: fix/database-schema-startup, based on main d73b565.
Local dev/start check migration history before Next.js starts. Vercel build checks
history before generation/build. A mismatch between runtime/direct database/schema
targets also fails before a misleading readiness result.

Checks are read-only. No automatic migrate deploy, db push, reset, column-only
patch, migration-history rewrite or silent fallback is introduced. Ordinary
npm run build remains an offline compiler verification; it is not a runtime
database acceptance check.

Automatic production migrations were rejected by approval review because of the
unrehearsed 19-migration backlog. The prepared Vercel command only checks readiness.
No attempt was made to bypass that rejection or apply the backlog to the live DB.

## Recovery record

- Project: broad-snow-66995795 (MXMT), production branch
  br-lingering-sun-av1p7axj.
- Rehearsal branch: br-wispy-mud-avdvaf2q, migration-rehearsal-20261029.
  Created from production with data; expires 2026-10-30 12:42 Europe/Kyiv.
- Unmodified backup branch: br-dark-shape-avyrvhqw,
  pre-migration-backup-20261029; expires 2026-10-30 12:46 Europe/Kyiv.
- Rehearsal applied all 19 pending migrations successfully. All 23 migrations
  completed. Legacy row counts and sales revenue/quantity, inventory quantity
  and SKU price totals matched the parent exactly. Original dashboard Prisma
  queries passed. An authenticated HTTP smoke test against a local production
  build and this isolated branch returned /dashboard 200 with no server error.
  That server used synthetic JWT secrets and was stopped after verification.
- A one-off production deployment was initially rejected by approval review because
  it required separate explicit owner approval. No alternate route bypassed the block.
- The owner then explicitly answered: "Погоджую застосування до production".
  The approved one-off Prisma migrate deploy verified the exact endpoint/database
  and original four-migration pre-state before applying the same 19 migrations.
- Production finished all 23 migrations. The missing catalogAttributes column
  exists; all legacy counts and financial/inventory/price totals were preserved.
  Full SKU/brand reads returned 4037 rows. No reset, db push, source import,
  financial recalculation or migration-history rewrite was performed.
- The readiness guard failed as expected before migration and returned success
  afterward: "Database schema is up to date!".
- Existing authenticated Vercel dashboard verified through the browser: normal
  navigation, 4037 products and no application error. Local browser verification
  also passed at localhost:3000/dashboard using the owner's test login, with 4037
  products and no server exception. No password is stored in the repository.

## Code verification

- Full suite: 148 files / 1497 tests passed, including 13 startup/deployment checks.
- TypeScript and offline production build with synthetic JWT values passed.
- Whitespace checks passed.
- Git branch: fix/database-schema-startup.
- Original uncommitted #54 work in the separate checkout remains untouched.

The prepared guard does not automatically apply migrations in any environment.
Future releases must rehearse and apply migrations to the intended database before
the guarded build. The two temporary Neon branches automatically expire as recorded;
the backup is not an indefinite backup policy.

## PR #114 CodeRabbit follow-up

Host equivalence now removes `-pooler` only for genuine `*.neon.tech` hosts.
Non-Neon hosts must match exactly. The guard also compares Prisma's decoded `host`
query parameter for Unix-socket connections and rejects repeated/ambiguous socket
parameters before executing migration status. This prevents readiness checks on a
server different from the runtime target. No database was contacted or changed.

Validation: all 20 lifecycle tests passed, including seven new regressions for
non-Neon hosts, misleading Neon suffixes, distinct/missing/repeated socket targets
and valid identical hosts/decoded sockets. TypeScript and whitespace checks passed.
