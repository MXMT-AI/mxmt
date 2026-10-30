# Zavod raw-import memory recovery — 2026-10-30

## Production evidence

An authorized test-account raw import returned HTTP 500 with a Next.js HTML error
page after approximately 82 seconds. Its unpublished RUNNING claim retained all
raw tables, the catalogue and only part of the typed sales rows. The previous
successful September import remained active. The HTTP response does not prove
the platform's termination reason; Vercel runtime logs remain necessary to
confirm an out-of-memory termination.

Local parsing and normalization of the saved real workbook reached approximately
2.5 GB RSS. This exceeds the documented 2 GB Vercel Hobby function allocation:
https://vercel.com/docs/functions/configuring-functions/memory.

## Change

- Parse only the five imported sheets using SheetJS dense cell storage.
- Retain cached formula results and formatted identifiers, without retaining
  formula expressions or rich HTML that raw imports do not consume.
- Support dense and sparse worksheets in the shared compatibility adapter,
  preserving its date, raw-number and XML-string behavior.
- Avoid allocating an Object.entries array for every worksheet's cells and
  release completed worksheets during raw-table conversion.
- Reuse the fixed Kyiv calendar formatter across sales rows rather than
  allocating a formatter for every date.

## Validation

- Full suite: 172 files passed; 1,708 tests passed, one skipped. TypeScript and
  production build passed with fixture JWT secrets.
- Compare all 31,781 raw rows, column metadata, sheet checksums and normalized
  products, sales and issues against the previous reader using SHA-256 digests:
  exact equality on the saved real workbook. No customer rows are committed.
- Native isolated PostgreSQL / Prisma replay includes a fresh claim conflict,
  overdue claim recovery, full raw/typed import, fenced old-claim activation and
  ARTICLE REPORT calculation. Final run: import approximately 11.6 seconds,
  calculation approximately 1.2 seconds, 3,978 report rows; peak process RSS
  approximately 1.68 GB. Measurements are local, not a production memory guarantee.
- Regression coverage includes dense/sparse date and number behavior, cached
  XML strings, cached formula results, formatted identifiers, row identity and
  summer/winter Kyiv day boundaries.

## Separate test-account configuration

The already owner-approved category classification and physical-stock observation
policy were activated through the application's preview/approval audit flow.
Projection from the saved active import succeeded, and all five screen APIs
returned HTTP 200 against a newly calculated snapshot. Year-to-date sales became
nonzero. This configuration change is separate from deploying this parser fix.

The active saved import is still from September. Empty October sales, unavailable
current stock and incomplete classifications must not be presented as fully
resolved. Ownership, receipts, supplier terms, history coverage and unknown
statuses remain subject to their existing evidence requirements.

## After merge/deployment

1. Confirm the production deployment contains the memory fix.
2. Wait until any interrupted RUNNING claim exceeds its ten-minute execution
   window; retry once through Import. Do not force-clear a live claim.
3. Check that the new raw import becomes SUCCESS/WARNING and active, then run
   the approved Sheets projection and calculate a new screen snapshot.
4. Verify source/import timestamps and the same period on all five screens.
   Distinguish unavailable evidence from genuine zero values.
5. Inspect Vercel runtime memory/logs and the import response before claiming
   the production import failure resolved. Browser UI verification remains pending.
