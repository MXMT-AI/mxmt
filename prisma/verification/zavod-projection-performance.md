# Zavod MVP projection recovery — 2026-10-30

## Observed production behavior

The test ADMIN approved the Sheets mapping and selected Zavod as the reporting
source. An explicit MVP refresh failed; all five screens continued to show that
the selected Sheets import had not been projected. A separate combined raw import
had saved its import before the legacy report calculation returned HTTP 504.
The exact production exception was not available from the browser console.

## Reproduction and change

Replayed the previously saved real workbook observation against a separate schema
in local native PostgreSQL 18, using Node 24 and the production migrations. No
production database, source workbook, permissions or approved rules were changed
while developing this fix. The saved local observation has 4,599 raw catalogue
rows and 22,185 order rows; it is not an assertion that the active production
snapshot (4,085 catalogue rows observed during mapping preview) is identical.

The original catalogue-to-order linkage SQL was cancelled at a 45-second local
statement deadline. EXPLAIN showed a one-row estimate for the just-inserted order
population. Correlated ID/SKU ambiguity checks repeatedly scanned the catalogue.
After that bottleneck was removed, the correlated latest-sale-cost lookup also
exceeded the same deadline.

- Resolve pending order/receipt identities into transaction-local, analyzed,
  indexed sets. Only one distinct candidate SKU permits linking; disagreement
  between ID and SKU, duplicate SKU matches, pre-existing links and foreign
  tenant/source facts retain their previous behavior.
- Rank eligible receipt/sale costs once per SKU. Keep all latest timestamp ties,
  currency/verification checks, receipt precedence and source provenance. Do not
  choose an arbitrary tie or fall back to older evidence when the latest evidence
  is incomplete. Future evidence is excluded before ranking.
- Keep full-snapshot writes atomic and leave the existing 45-second transaction
  and 60-second projection-route limits intact. Temporary linkage tables are
  removed after each catalogue observation, including multiple CSV observations
  within one transaction.
- Distinguish gateway timeout messages from mapping/configuration errors. Return
  a generated request ID for projection failures and log it with a bounded error
  code, without database messages, SQL parameters or source rows.

## Verification

- Full real-data projection: 4,063 ms locally; 3,978 accepted products, 13,717
  orders, 15,896 order lines. Unverified/ambiguous rows remain quarantined.
- Repeating the same intent returns `duplicate`; existing idempotency and injected
  replacement-failure/rollback tests pass.
- With stock observation unverified, zero InventorySnapshot records are created.
  Product kind, ownership, history coverage and supplier terms are not inferred.
- All five screen services returned successfully on that isolated observation.
  Local production-build browser checks also opened Overview, Sales, Stock,
  Repricing and Reordering without server errors. Missing evidence still limits
  metrics and action candidates; this is not financial acceptance of Zavod.
- Separate real-workbook legacy import through Prisma 7: approximately 14.8 s;
  legacy ARTICLE REPORT calculation: approximately 1.1 s, WARNING, 3,978 rows.
  Production's intermittent legacy 504 did not reproduce locally and is not
  declared fixed by the projection optimization.
- Full suite: 169 files passed, 1,677 tests passed, one skipped. TypeScript and
  production build passed. Regression coverage includes SalesDrive and CSV,
  conflicting identity matches, same-date costs, missing costs and currency ties.

## Release verification still required

Deploy this branch through the normal PR workflow, then run **Refresh MVP reports**
once for the already approved/selected test-account Sheets source. Check completion
and all five screens before retrying or downloading the workbook again. Use the
request ID, operation time and Vercel runtime logs for any remaining failure.
Recheck the separate legacy calculation and capture its actual server exception
if HTTP 504 recurs. No production deployment or live financial action was performed
as part of this local verification.

Real workbook rows, local credentials and screenshots are private artifacts under
`/tmp/mxmt-projection-fix`, not repository fixtures or public attachments.
