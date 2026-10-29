# Google Sheets reporting — step 3: shared fact projection

Step 2 is committed as `dc0163a` on `feat/google-sheets-reporting-source`.
This step implements explicit projection of a saved, approved Sheets import into
shared merchandising inputs. It does not yet wire the reporting hub actions and
five screens into the complete Sheets workflow; that is step 4. No live customer
mapping was approved or activated during development.

## Explicit intent and publication

`POST /api/connectors/sheets/projection/:sourceId` accepts exactly
`{importRunId, mappingId, selectionRevision}`. A signed ADMIN session and actual
same-tenant ADMIN membership are required. Query overrides and extra body fields
are rejected; the body limit is 4 KiB. The API returns outcome and bounded counts/
issue codes, never raw rows, provider credentials or database error messages.

The source must already be explicitly selected. Its current raw import must be
successful/warning, and its active mapping must be approved for the same file and
column schema. Approval now captures the shared amount policy alongside the
source field mapping. Projection verifies the two representations agree and does
not mutate the approved mapping revision. A mapping approved using an older
incomplete contract must be reviewed again rather than silently upgraded.

Selected columns are read once in pages of 1,000 and checked with the same analyzer
used by mapping preview. Preparation runs outside the publication transaction.
A final tenant/source lock rechecks membership, file/import checksums, snapshot
metadata, approved mapping, selected-source revision and effective client settings.
Changed input or intent fails without publishing anything.

Publication atomically replaces current source order facts, updates catalog/price/
verified stock facts, records diagnostics and provenance, records the completed
native `orders` / `REFRESH` lifecycle, writes the projection manifest and enqueues
the existing idempotent recalculation intent. No fake ConnectorConnection or new
adapter registration is created. No schema migration is needed.

Repeating identical intent returns `duplicate` and does not append facts or audits.
A failed transaction retains the previously published facts. Omitted/quarantined
orders do not survive as old current financial rows after a successful replacement.
This means current order facts describe the selected raw observation, not an
unverified union of changing workbook snapshots. Older raw imports/source records
remain auditable; absence is not proof of complete historical coverage.

Reprojecting the same raw import under a newly approved mapping replaces that
run's derived price/stock observations, including revoked in-transit confirmation.
Older-run observations, raw rows, source records, approvals and action history
remain retained. Publication never changes reporting-source selection or fetches/
modifies the original Google spreadsheet.

## Shared normalization and provenance

- `normalizeOrder` and `parseOrderPolicy` support explicit `net_line` revenue and
  line cost evidence. Source totals are retained exactly; no division into rounded
  unit prices is performed. Existing unit/gross/discount policies remain supported.
- Multi-line orders are grouped before publication. Conflicting headers, duplicate
  line identities, unmatched/ambiguous products and amounts requiring unsupported
  precision quarantine the whole order. A source order is never replaced one row
  at a time. Large single orders above 1,000 lines are quarantined.
- Source statuses, channels, event dates, amount units and currency come only from
  approved rules. Return dates do not fall back to order/update timestamps.
  Missing dates/costs remain unavailable. Returns use the shared signed convention.
- Shared catalog storage resolves native product IDs/SKU aliases, brands and
  categories. Explicit product-kind mappings apply; an unverified source default
  preserves an existing manual classification. New products still default UNKNOWN.
  Vendor/category text never establishes ownership or supplier terms.
- Mapped current catalog cost carries mapping ID, approval reference, raw source
  record and import provenance. It is not misrepresented as a supplier receipt.
  Canonical price/stock money uses existing Decimal fields.
- Unverified stock timestamps create no inventory observation. Approved timestamp
  columns must parse and not be later than import observation. Import-time stock
  is labelled current observation, never historical closing stock.
- In-transit quantity requires a valid mapped nonnegative integer and observation
  time. Its verification timestamp remains null when unknown; a stored legacy zero
  is not evidence of zero incoming stock.
- Raw snapshots and per-order selected-row references remain linked through the
  original tenant/source/import identity. Source raw/report tables remain intact.
  The shared data-quality writers run after canonical alias/kind resolution.

## Limits and readiness

At most 100,000 combined raw rows, 32 MiB selected raw data and 64 MiB prepared
order documents are accepted. SQL staging is batched at 500 orders. Publication
uses one transaction with a 45-second timeout; the HTTP route budget is 60 seconds.
Oversized inputs fail explicitly rather than publishing partial data.

The server-written manifest identifies the raw import, approved mapping, source,
checksum and input hash. It makes the source projection-ready under step 1's gate;
it does not establish complete sales/LY history, missing receipts, ownership,
supplier policies, historical closing stock or approved recommendations.

History coverage remains explicitly unconfirmed (`historyComplete: false`). No
cursor/window is invented. The recalculation intent is queued; this operation does
not itself run financial calculations or external price/order actions.

## Validation

Final full offline suite: 156 files / 1,571 tests passed. TypeScript and the final
production build passed. The build ran in an isolated temporary source copy with
synthetic JWT values and no production environment files. Git whitespace checks
also passed.
Targeted tests cover exact totals and signed returns, independent amount bases,
precision quarantine, duplicate SKUs, conflicting multi-line orders, unknown stock
observation times, tenant roles, stale fences, duplicate intent, approved mapping
immutability, remapping, full replacement and transaction rollback.

A larger synthetic PostgreSQL fixture verifies 1,201 products/orders across raw
pagination and multiple staging batches, including exact revenue and SKU matches.
Production schema/data, real-sheet approval/activation and live CRM actions were
not changed. Browser work is unnecessary for this backend-only step; end-to-end
Zavod/SalesDrive UI and production latency verification remain in steps 4–6.
