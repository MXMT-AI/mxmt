# PR #119 CodeRabbit follow-up

Date: 2026-10-30. Reviewed the four actionable comments against the current source.
No production database, account configuration or live connector was changed.

## Fixes

- Calendar event actions are visible by default. Only hover-capable inputs hide
  them until group hover; group focus-within also reveals them. Both icon buttons
  now have localized accessible names. The existing event/edit/delete flows remain.
- `connect_timeout=0` is accepted. Connection and pool deadlines accept nonnegative
  integers; connection_limit remains strictly positive. Empty/negative/fractional
  or overflowing timer settings fail before client construction.
- Restore pool acquisition default 10 seconds independently of the physical
  connection default 5 seconds. Preserve explicit pool_timeout, including zero.
  The pg pool's public Client hook supplies the physical connection deadline;
  pool checkout has its own deadline, including establishing a new connection.
  No pg private queue/state is modified. Zero disables only its named deadline.
- Forward schema to PrismaPg. Direct connections set a parameterized, quoted
  search_path for raw SQL. This proof applies only to direct PostgreSQL sessions.
  The subsequent transaction-pooler correction below supersedes any implication
  that connection-level SET provides custom-schema safety through PgBouncer.
  Prisma disconnect owns/disposes the externally constructed pool.
- Declare pg as a direct runtime dependency and @types/pg as a direct development
  dependency, both with manifest range ^8.23.1. The lockfile records installed
  version 8.23.1; these are not exact-version manifest pins. No transitive package
  upgrade or schema migration.
  README/RUNBOOK now document the deadline and schema behavior.

## Validation

- TypeScript — exit 0.
- Targeted pool regression — 16 tests passed (10 added): zero/invalid settings,
  actual pg saturated-queue behavior at default/explicit/disabled acquisition
  deadlines, schema quoting and real local TCP handshake timeout.
- Full suite — 167 files / 1,661 passed / one existing optional workbook skip.
- MVP suite — 80 files / 965 passed; overlaps the full suite.
- Independent npm ci, build and build:vercel — exit 0. Database-dependent build
  used isolated local native PostgreSQL; no production migration was applied.
- Native PostgreSQL probe — generated CRUD and unqualified raw reads/updates used
  the configured temporary schema, with a same-ID public row left unchanged.
  A saturated checkout survived the physical connection deadline and succeeded
  within the separate pool deadline. Temporary schema/rows were removed.
- Local production HTTP — login 200, database health OK, protected dashboard
  redirects to login. npm audit — zero findings.
- Browser — actual production Calendar with one disposable synthetic event:
  desktop keyboard focus reveals both actions with a visible outline, Edit opens
  its modal, Cancel returns without mutation, and 390px layout retains access.
  Compiled CSS confirms opacity 1 outside hover-capable media and focus-within
  opacity 1. A physical touch-device/emulated-hover:none session was unavailable;
  no such device test is claimed. Browser tab/server were closed and the synthetic
  tenant removed only from the isolated database.
- Git whitespace checks passed. Existing business/UAT/hosting activation limits
  remain unchanged; this follow-up does not claim customer acceptance.

The initial upgrade report and final-validation.json remain historical evidence
for their recorded implementation SHA. This follow-up supersedes the earlier
combined-timeout limitation and adds the custom-schema regression proof.

## Primary references

- [Prisma pool defaults and parameter translation](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool)
- [node-postgres Pool API](https://node-postgres.com/apis/pool)
- The accepted pg 8.23.1 and @prisma/adapter-pg 7.10.1 source/types were inspected
  locally to verify separate Client configuration, onConnect, schema and disposal.


## Second review — transaction pooling and documentation

The direct PostgreSQL probe did not verify Neon transaction pooling. Neon documents
that session SET/search_path is unsupported across transaction boundaries. This
application has unqualified raw SQL, so it must not advertise custom-schema safety
through a transaction pooler based on onConnect.

The shared databaseSchemaPolicy now applies in both startup readiness and runtime:
Neon -pooler endpoints and explicit pgbouncer=true URLs never execute session SET;
custom schemas on those URLs fail before network access or Prisma CLI execution.
Public pooled deployments retain the standard public role search_path. Custom
schemas remain supported with an explicitly configured direct runtime URL and
bounded pool, not an automatic fallback to DIRECT_URL. Non-Neon transaction
poolers must declare pgbouncer=true. No database-role defaults or production URLs
were changed. Schema-qualified raw SQL support for pooled custom schemas is not
implemented or claimed by this patch.

README now calls SalesDrive arrival records data requiring separate movement,
supplier/posting and cost verification. It no longer implies account-specific
receipt evidence is confirmed by connector availability.

Second-review validation:
- Focused pool/lifecycle tests: 44 passed, including eight new regressions.
- Full suite: 167 files / 1,669 passed / one existing optional workbook skip.
- MVP: 80 files / 965 passed. TypeScript passed.
- Independent npm ci, build and build:vercel passed; local HTTP login/health/
  protected redirect passed. Audit: zero findings. Whitespace/doc link checks passed.
- Direct custom-schema native probe passed again after restarting the unavailable
  disposable local PostgreSQL cluster. No production service or schema was changed.
- Pooled public no-SET behavior and pooled custom-schema rejection are regression
  tested before network/CLI dispatch. No live Neon/PgBouncer acceptance is claimed;
  custom schemas remain explicitly unsupported on transaction-pooled runtime URLs.
- The previous browser/calendar checks remain applicable; no UI changed here.
