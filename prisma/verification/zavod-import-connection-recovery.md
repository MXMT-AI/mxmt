# Zavod import connection recovery — 2026-10-29

## Observed failure

The test ADMIN reported `Data import failed` in Google Sheets reporting.
Read-only inspection of its latest failed import found Prisma P1017 during
`sourceSaleLine.createMany`: the database server closed the connection.
No calculation was created for that failed import. The previous successful/warning
import remained active; neither old report values nor WARNING indicate that the
failed import completed.

The configured public Google Sheets export downloaded successfully (HTTP 200,
XLSX, 11,191,479 bytes). The supplied file/folder IDs were already configured.
The source workbook was not modified. Access permissions, service-account keys,
database schema and source selection were not changed by this fix.

## Implementation

Raw rows, normalized products/sales and normalization issues are immutable staging
records for a private import run. A shared insertion helper assigns explicit UUIDs
once per batch and retains those exact IDs/data across retries. The first insert
keeps normal uniqueness enforcement. Only recognized Prisma connection failures
P1017/P1001 get up to two retries, after 100/200 ms, with duplicate suppression on
those retries. A response lost after a committed INSERT therefore cannot append
another copy, including issue rows without a populated natural unique key.

Integrity errors, transaction/pool timeouts and arbitrary exception message text
are not classified as connection loss or retried. There is no global Prisma
client disconnect/reconnect, whole-pipeline replay, source write, scheduler retry
or external-action retry. Import activation remains the existing atomic operation
after all stages complete. Exhausted recovery follows existing failure cleanup.

The import API maps recognized connection failures to a sanitized actionable 503
`IMPORT_DATABASE_CONNECTION_INTERRUPTED`, without returning SQL, endpoints or
credentials. Other unexpected errors retain the existing generic failure path.

## Verification

- A normal import of the actual workbook succeeded on isolated Neon rehearsal
  branch br-wispy-mud-avdvaf2q; the original intermittent failure did not recur
  deterministically.
- A second real-workbook import in a separate synthetic tenant on that same child
  deliberately threw P1017 after the first sale-line batch committed. Recovery
  completed with 3,978 normalized products, 19,435 sale lines and five snapshots,
  followed by successful report calculation for 2026-01-01 through 2026-10-31.
  WARNING remains the data-quality result; no clean-data acceptance is claimed.
- The source XLSX and one-off real-data rehearsal test stayed outside committed
  artifacts; the temporary test was removed before the full offline suite.
- Offline regressions cover before/after-commit loss, bounded attempts, preserved
  IDs, actual PGlite duplicate prevention, nonretryable errors and signed ADMIN
  API behavior with sanitized 503 responses.
- Full suite: 150 files / 1,517 tests passed. TypeScript, whitespace checks and
  production build using synthetic build-only JWT values passed.
- Local patched development server is available at http://localhost:3107.
  Browser verification reached authenticated Data & Reports. A final button-driven
  import was not executed because the user was actively navigating that browser.
- Production data was only inspected read-only during diagnosis. The live workbook
  was downloaded, and all import/recalculation writes for verification used the
  isolated rehearsal branch. No deployment or live import is claimed.
