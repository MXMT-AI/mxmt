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
- Forward schema to PrismaPg and set a parameterized, identifier-quoted session
  search_path for every physical connection. This also keeps unqualified raw SQL
  on the same schema as generated ORM queries and migration readiness checks.
  Prisma disconnect owns/disposes the externally constructed pool.
- Declare pg and its types as direct dependencies at their already-installed
  stable 8.23.1 versions. No transitive package upgrade or schema migration.
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
