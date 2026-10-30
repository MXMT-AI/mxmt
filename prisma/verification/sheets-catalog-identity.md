# Sheets catalogue identity continuity — 2026-10-30

## Reproduction

The memory fix allowed the authorized test tenant's new raw import to finish and
become active. The subsequent MVP projection returned HTTP 503, and a new screen
snapshot returned `SHEETS_IMPORT_REQUIRED`.

Read-only diagnostics found one catalogue row where the established source
product-ID alias pointed to a generated Sheets identity, while the newly available
SKU matched a separate legacy row. The legacy row had no connector aliases,
catalogue source provenance, order lines, receipt lines, price history or sourced
inventory observations. The generic identity-conflict exception was being exposed
as a temporary infrastructure failure.

## Resolution

- Only for Sheets, retain an existing source product-ID alias whose SKU is the
  exact generated `@sheets:<source>:<external product ID>` identity.
- This exception applies only when the competing canonical SKU is an unbound
  legacy row. Any connector alias, catalogue source provenance, order line,
  receipt line, price history or sourced inventory observation on that row
  preserves the strict conflict rejection.
- A conflicting same-source SKU/vendor alias also remains a hard conflict.
- Keep the established canonical ID and SKU. Attach the new source-scoped SKU
  alias to it; preserve historical facts and the separate legacy row unchanged.
  This does not merge financial history or infer that the two records are the
  same real-world product.
- Record `CATALOG_LEGACY_SKU_COLLISION` against the exact import and SKU, with both
  record IDs and raw provenance for later manual reconciliation. Expose localized
  guidance rather than suggesting repeated imports will merge records.
- Serialize identity decisions with the existing tenant identity lock.
- Return HTTP 422 `SHEETS_CATALOG_IDENTITY_CONFLICT` for genuine catalogue identity
  conflicts, with a request ID and corrective guidance instead of generic 503.

## Verification

- Full suite: 173 files passed; 1,720 tests passed, one skipped. Production build
  and TypeScript passed with fixture JWT secrets for the build.
- Isolated integration reproduction uses two observations: a missing source SKU,
  followed by its real SKU colliding with an existing unbound legacy row.
- Assert unchanged legacy sales, preserved source order linkage, retained stock
  and price history, stable canonical IDs and idempotent warning/snapshot writes.
- Reject and roll back bound competitors, ordinary source identities and the
  equivalent remote-provider case. Another source's alias also blocks the
  exception. Existing catalogue linking/cost and Sheets projection tests pass.
- Native isolated PostgreSQL replay uses the latest production test tenant's
  saved raw rows and approved mapping, with a synthetic earlier observation
  reproducing the diagnosed identity pattern. No customer rows are committed.
- Projection completed in approximately 4.1 seconds: 3,978 catalogue products,
  15,898 normalized order lines and 3,978 stock observations. A repeat returned
  `duplicate`. Overview, Sales and Stock received real derived data; all five
  screen readers completed successfully.
- Both server-side scenario previews completed against that same snapshot.
  Repricing retained no eligible rows; reordering returned rows requiring the
  existing evidence checks. No export, price write or supplier delivery occurred.

## Production boundary

No production identities, aliases or history were rewritten during this fix.
After review/deployment, refresh MVP reports from the already saved active
import, then create a new screen snapshot. Another Google download is unnecessary
unless the source data changed.

The two records remain separate pending manual reconciliation. Repricing and
reordering still require their existing classification, ownership, sales-history,
supplier and transit evidence. Empty recommendations are not permission to invent
missing inputs. Browser UI and deployed-code validation remain separate rollout
checks.
