# CSV connector and onboarding (#82)

Baseline: `7624cc6` (main after #87). Branch: `feat/82-csv-connector`.
Parent: #52; shared source/runtime/history boundary: #81.

## Contract and explicit owner decisions

CSV schema v1 is a manual, offline input. No remote account/key is needed.
Settings contains separate files for order lines, products, dated stock, supplier
receipt lines and optional status/channel names. Each resource has an explicit
column mapping; the UI offers header templates and auto-selects exact matching
header names only. The administrator must confirm mappings before previewing.
No filename is sent to storage or used as a business identity.

- Each file is UTF-8 (fatal decoding), optionally with BOM. Delimiter must be
  comma, semicolon or tab. Quoting uses double quotes, doubled escaped quotes,
  embedded delimiters/newlines and LF/CRLF records. Bare CR, unclosed/misplaced
  quotes, duplicate/empty headers and unequal record widths fail validation.
- Values remain strings. Leading-zero IDs, SKUs and barcodes survive unchanged.
  Decimal syntax is dot-separated, no grouping/exponent/formula/locale conversion,
  at most 14 integer and 4 fractional digits. Empty optional amounts mean unknown;
  explicit `0` is zero. No spreadsheet formula is evaluated.
- Event dates accept `YYYY-MM-DD` in the selected source timezone or an ISO UTC
  instant ending in Z. Update and product/stock observation timestamps require
  UTC instants with seconds and at most 3 fractional digits. Invalid dates,
  local/offset datetime strings and future observations are rejected. Timezone
  becomes immutable for the CSV source after its creation.
- Orders require order ID, event ID, line ID and product ID. A JSON tuple of
  order/event ID is the external document identity, so independent sales/returns
  cannot overwrite each other. Line IDs are stable within that document. All
  header fields must agree across its lines. Corrections must include the full
  document line set and a strictly newer source update timestamp; removed lines
  then disappear through the existing atomic order replacement. Changing the
  event ID creates a different event and is not a correction mechanism.
- Receipts require document/line/product/supplier IDs, movement type and explicit
  event/update dates. Posting statuses, supplier-to-tenant-supplier mapping,
  currency and verified unit-cost semantics are owner decisions. Movement types
  remain explicit; transfers/write-offs are not purchases. The UI supports one
  supplier mapping per packet; the validated API policy supports up to 100.
- Existing status normalization uses canonical non-negative numeric status/channel
  codes (no leading zeros); these codes are separate from opaque business IDs.
  Map external text statuses to approved numeric codes before upload. Stable
  document/product/line identities are never coerced to numbers.
- Explicit order policy covers currency, statuses, channels, unit price before/
  after discount, absolute discount per line/unit, percentage/amount discount and
  unit cost. Existing client filters/status settings still apply. Ownership,
  commission, supplier terms and product-kind policy remain in existing Settings;
  vendor names never establish ownership or a commission contract.
- Optional dictionaries preserve uploaded names as partial metadata, not a claim
  that every upstream status/channel was enumerated.

## Catalog, dated stock and history

Products and stock are separate files uploaded together. Every stock product ID
must resolve within the product file. Product observation must be no later than
its corresponding stock observation. Multiple dated observations may be included;
activation sorts them chronologically and uses the existing catalog normalizer
and storage service. A packet is bounded rather than a replacement for a large
unbounded history backfill.

Stock timestamps are canonical UTC ISO instants before grouping, duplicate checks
and chronological sorting. Different fractional-second spellings of one instant
cannot create two observations. Products paired with a header-only stock file
are invalid in both complete and partial modes.

Catalog and stock each require an explicit complete/partial declaration. When
both are complete, every dated stock observation must include every uploaded
product. Partial packets update only supplied rows and never clear omitted stock
or certify complete population/history. Even a complete declaration never
manufactures zero rows for absent products. Existing population and history gaps
remain visible. Stock quantities may be missing or signed; current business rules
surface missing/negative observations instead of coercing them to zero.

Older observations cannot overwrite a newer active catalog. A stale catalog packet
is rejected atomically: combine the dated observations with the latest complete
observation or correct the packet before previewing again. The UI does not imply
that arbitrary older catalog metadata can overwrite current product attributes.

Order-history and receipt-history coverage are separate explicit UTC intervals.
File success/row count/upload time alone never establishes coverage. New CSV order
coverage uses the #81 verified-window helper, not the scan cursor, including gaps.
Claiming complete history while omitting already imported documents in that window
fails activation. Existing events outside the interval are retained. A CSV order
cursor records a confirmed interval end for freshness/provenance only.

A receipt baseline additionally requires an explicit declaration that the packet
contains every receipt since business inception, including no earlier receipts
outside the interval. Limited receipt intervals cannot establish cohort completeness.
The baseline uses the existing receipt policy hash and diagnostics. Historical
stock is represented only by supplied dated observations, never inferred from a
current feed. No financial/classification/repricing/reordering formula changed.

## Storage, dry-run and activation

The existing tenant-owned CSV `DataSource` and provider-isolated encrypted config
store timezone metadata only. The offline provider registration cannot issue a
network request; automatic polling remains disabled. A metadata check only means
the local source is configured; it is not customer file/mapping approval.

The dedicated `CsvImport` row freezes schema/mapping revision, exact file base64,
byte SHA-256, packet content hash, source and configuration context. Exact bytes
are retained in existing scoped `DataSourceRecord` records and can be downloaded
byte-identically. The packet hash includes exact bytes, delimiter, mapping and
business options but not filename, upload time or row position.

Preview parses/normalizes the full bounded packet without modifying active facts,
source selection or financial formulas. Errors use resource + physical starting row
and bounded safe codes; diagnostics never echo raw customer cell contents. The UI
shows counts and error/warning details separately from activation. The server
recompiles and verifies hashes again in the publication transaction. Existing
fact-version conflicts are fenced at activation; the transaction keeps active
facts intact if a conflict is discovered after the dry-run.

Activation requires explicit CSV selection through the #81 picker and an ADMIN
command containing the exact preview hash. Saving/previewing CSV does not switch
reporting sources. Configuration revision, source-selection revision and active
business-settings IDs/revisions are checked at activation and publication.
Business settings include the `settings:*` GENERAL configs, not calculation caches.
A changed context requires a fresh preview. Repreviewing unchanged bytes refreshes
an unqueued preview's context and records an audit entry; it does not reapprove an
already queued stale job.

A `ConnectorSyncJob` with resource/mode CSV is queued through the existing durable
lease/claim/failure boundary. The common worker routes it to the bounded offline
worker; the UI may trigger the same job immediately and otherwise the existing
worker picks it up. One transaction writes orders/receipts/catalog observations,
source mapping, successful run, cursors, activation audit and recalculation intent.
Catalog storage uses transaction-local tables sequentially. Failure rolls all
projections back; validated raw files remain for retry/correction.

Repeated identical packets return the same active/current preview and cannot
append facts or duplicate recalculation intents. Newer corrected documents reuse
stable IDs; conflicting or older versions pause visibly with a CSV-specific code.
Mapping changes require a higher revision and an explicit fresh preview. Settings
policies are captured on the successful job for the existing trusted-projection
checks used by metrics and screen calculations.

## Scope, RBAC, bounds and lifecycle

All CSV list/preview/file/action routes require a verified signed ADMIN session
(SUPER_ADMIN included). Tenant/user identity headers and body overrides are not
authority. IDs/files/jobs are looked up through the signed tenant/source/import
scope; no direct client-provided job is accepted. Source ownership and supplier
references are checked. Responses are no-store with server-generated request IDs;
raw downloads are attachment/nosniff responses. The UI has no upload controls for
viewers/analysts. This conservative restriction includes preview/raw-file reads.

- Maximum 6 files, 256 KiB per file, 1 MiB decoded packet, 500 total data rows,
  48 columns, 4096 characters per cell, 200-character stable IDs. The JSON request
  is bounded at 1,500,000 bytes before parsing; action bodies at 2048 bytes.
- UTF-8 decoding, canonical base64 and SHA-256 are verified server-side. Malformed
  files, duplicate IDs, conflicting document headers, ambiguous dates and invalid
  source numeric syntax cannot activate a partially valid subset.
- At most 20 unactivated READY/INVALID/QUEUED packets are admitted per tenant.
  One source lease prevents concurrent projection. Files and rows remain bounded
  so one atomic local step fits the existing 60-second function budget; the SQL
  transaction timeout is 45 seconds. Larger customer datasets need a reviewed
  resumable bulk-import slice rather than silently increasing this cap.
- Retry resets an existing recoverable job; it cannot bypass changed-settings,
  changed-source, expiration, hash or validation guards. Permanent input conflicts
  pause instead of creating an infinite retry loop. Fix input and create a new
  preview for immutable packet changes.
- After switching away and back, an explicit retry validates the selected source
  and frozen configuration again, then captures the current selection revision.
  This recovers the same packet without rotating its connection revision or
  weakening the worker's source fence.
- Cancel acquires the same tenant lock, revokes leases and marks the job CANCELLED.
  A running publication either commits first (then cancellation is denied) or
  cancellation wins and prevents projection. Existing report/pending/recalculation
  checks ignore cancelled jobs. Active facts cannot be cancelled away.
- Unactivated packet bytes expire after 30 days. Expired downloads/activation are
  denied immediately. Physical deletion and EXPIRED/audit transitions run lazily
  at the next upload for that tenant; there is no claimed unattended retention
  scheduler in this slice. Hashes, previews and audit metadata remain.
- Activated input bytes and provenance are retained for audit. Cancelled/expired
  hashes allow a new independent preview with the same bytes; old jobs never
  reactivate. Storage/export retention policy changes require a separate approved
  operation; no production data deletion or customer-file acceptance was run.

## Schema migration and compatibility

Migration `20261027010000_csv_imports` is transactional and additive except for
replacing the old inventory uniqueness rule. `CsvImport` is linked through the
existing composite import/source/tenant FK. State constraints include CSV jobs and
cancellation; index predicates retain tenant/source lease and content isolation.
Deleting an unprojected parent import cascades to its preview and raw files;
the preview does not add a new blocker to authorized source/tenant deletion.
Existing fact/job provenance constraints continue to protect projected imports.

Inventory observations now use tenant + source + SKU + date uniqueness, preserving
SalesDrive and CSV observations independently when source selection changes. A
partial unique index retains the old tenant + SKU + date rule only for legacy
rows with null source. The legacy Google Sheets upsert uses that partial conflict
target and cannot overwrite a provider observation. Prisma cannot represent that
partial index; retain it in the migration and do not replace it using `db push`.
Existing formulas and readers keep their source-scoped behavior.
The six legacy analyst/dashboard/calendar readers explicitly use null-source
observations, so they cannot select newer CSV/SalesDrive stock by accident.
Catalog activation links unresolved order lines by product ID or SKU only when
those identities resolve to one staged SKU; conflicting identities stay unresolved.

No live migration is applied. Rehearse on an authorized isolated database, verify
both uniqueness rules and legacy Sheets/provider imports, pause old writers, then
deploy matching schema/code together. An old-code rollback cannot safely use the
old inventory conflict target after this migration: pause writers and use a reviewed
forward fix. Do not drop CSV/source inventory facts or rewrite migration history.
The index replacement remains transactional in a planned maintenance window;
index creation/deletion takes table locks. Use the isolated rehearsal to measure
that window. Concurrent index operations cannot run inside this transaction and
would require a separately reviewed staged migration rather than a textual swap.

## Verification

Synthetic acceptance covers parser boundaries, RBAC/foreign previews/files/jobs,
byte-identical downloads, duplicate replay, corrected/removed document lines,
atomic conflicts, stale settings, cancellation, expiration and source isolation.
A comparison fixture imports equivalent source facts through CSV and asserts the
same financial/daily summaries, all five screen summaries and actual exported bytes
for both repricing and supplier-grouped reordering. The existing calculators and
export services are used directly; no copied CSV-specific formulas exist.

Browser checks use the real React component/theme in a local synthetic response
harness, not a production account: delimiter selection, file chooser/column mapping,
explicit approval, row-linked preview errors, disabled invalid activation and the
390px layout with no horizontal overflow. API and database activation are verified
separately with signed-session routes and isolated PostgreSQL/PGlite tests. A full
staging session with real files and customer mapping approval remains a release gate.

Local validation passed:

- Full `npm test -- --maxWorkers=2` after PR #88 review fixes:
  1049 tests across 103 files.
- Focused CSV timestamp/population, product back-link, retry and cascade regressions:
  21 tests across 2 files. Legacy source isolation: 6 tests covering all six actual
  page/API entry points against competing legacy/CSV/SalesDrive stock observations.
- Regression cases include equivalent instant spellings, chronological fractional
  timestamps, header-only stock in complete/partial modes, blank/different/ambiguous
  order SKU identities, retry after source reselection and deletion of unprojected
  parent runs/sources/tenants.
- `npm run build`: production build, including Prisma client generation.
- `npx tsc --noEmit`, `npx prisma validate` and `git diff --check`.
- Local synthetic browser harness: semicolon upload/auto-mapping, approval/preview,
  safe linked duplicate-row error, frozen mapping and raw-file link, disabled
  invalid activation, and 390px no-horizontal-overflow layout. This is separate
  from the isolated database/API acceptance; no live customer activation is claimed.

The migration remains unapplied on production. No real-file/mapping acceptance,
customer imports, production deployment, new cron/retention scheduler or credentials
change was performed. Real-file acceptance and production rollout remain separate
from implementation review.
