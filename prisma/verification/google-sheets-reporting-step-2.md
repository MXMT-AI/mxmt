# Google Sheets reporting — step 2: mapping preview and approval

Step 1 is committed as `82fcd76` on `feat/google-sheets-reporting-source`.
Step 2 adds field/policy configuration against an existing, immutable raw import.
It does not project merchandising facts yet. Projection is step 3; the five-screen
integration, readiness UX and real-data acceptance remain steps 4–6.

## Administrator workflow

Settings reuses the shared Field/control styles, tenant source list and signed API.
An ADMIN selects a saved Google Sheets source, maps actual columns from Product
YML 2.0 and ZAVOD_API, explicitly supplies currency, event classifications and
amount bases, and previews the saved import. Header suggestions are editable and
never approve business classifications. Source channel and category dictionaries
are read from the selected snapshot columns. Changing fields invalidates the
visible preview and the confirmation checkbox.

Preview reports total and problematic rows, missing/duplicate/conflicting product
identities, ambiguous order-line identities, unknown statuses/channels, invalid
amounts and event dates. It returns up to 100 issue examples, while counters cover
all inspected rows. Duplicate product identities and dictionary overflow block
approval. Other issues require review and later quarantine; a preview is not proof
of source completeness or an assertion that every row is usable.

Approval is a separate action with an explicit reference and confirmation. It
records an immutable config revision, actor, timestamp, preview hash and audit.
The source then becomes selectable but IMPORT_REQUIRED under the shared source
contract. Neither preview nor approval selects it, imports a file, writes canonical
facts, runs financial calculations or activates a projection manifest.

## API and revision binding

- `GET /api/connectors/sheets/mapping/:sourceId`: frozen import metadata, current
  draft revision, active revision, suggestions and observed dictionaries.
- `POST .../preview`: exact body `{expectedRevision, importRunId, mapping}`.
- `POST .../approve`: exact body `{configId, previewHash, reference}`.

All routes require a signed ADMIN session, ignore identity headers, reject query
parameters, scope stores to actual same-tenant admin membership and return private,
non-cacheable successful responses. POST bodies are bounded at 64 KiB. Unknown
infrastructure failures return sanitized 503 responses without database messages.

The preview pins source/file ID, active import ID/checksum/timestamp, snapshot
metadata/columns/checksums/counts, mapping, summary and optimistic config revision.
Selected raw columns are streamed in pages of 1,000 outside the tenant transaction;
a final tenant lock rechecks the binding before inserting the inactive draft.
Approval rechecks that binding and recalculates the mapping hash. A changed import,
file, schema, stored mapping, newer draft or expired preview cannot be approved.
Preview TTL is 30 minutes. Repeating an active approval with the same reference is
idempotent; a disabled approval is not silently reactivated.

Reuses MerchandisingConfig SOURCE_MAPPING (`sheets:<sourceId>`), MerchandisingAction,
the native DataSource and shared transaction/Decimal/date helpers. No migration,
new credential or fake connector connection is needed. Limits are 100,000 total
rows, 256 columns per snapshot, 100 statuses/channels, 200 categories and 128 KiB
per persisted preview. Oversized contracts require a deliberate future extension.

## Business boundaries carried into step 3

- Unknown statuses stay excluded; no hardcoded status 5/7 approval is inferred.
- Sales and corrections require an explicitly mapped payment/event date; returns
  require their own mapped return date. Row update/order dates are not substitutes.
- Sales amounts are explicitly net line totals or net unit amounts. Cost is line,
  unit or unavailable. Step 3 must preserve exact line totals in the shared
  normalizer rather than dividing and rounding into fabricated unit prices.
- Stable line identity is either a source line-ID column or an owner-approved
  unique order/product pair. Duplicates require quarantine, not positional IDs.
- Product kinds default to UNKNOWN, with explicit category overrides. Ownership
  and supplier terms remain separate settings; they are not inferred from a name.
- Stock timestamps are unverified unless explicitly approved as a timestamp column
  or current import observation with a reference. This does not create historical
  closing stock. Missing in-transit values, receipts and history coverage remain
  unknown. Raw snapshots do not establish historical financial completeness.

## Verification

- Full offline suite: 154 files / 1,546 tests passed before the final bounded-
  dictionary regression and empty-state refinement.
- Final targeted suite: 21 tests passed, covering strict schema validation,
  no fallback dates, duplicate/conflicting identities, prototype keys, bounded
  issue samples/dictionaries, tenant roles, stale previews, optimistic revisions,
  idempotent approval, stored-config tampering, API auth/body bounds and sanitization.
- TypeScript and the final production build passed. The build used an isolated temporary source copy,
  synthetic JWT secrets and no production environment files.
- Local Settings was opened through Chrome; a stale dev cache initially returned
  missing JS chunks and was replaced after stopping only this task's test server.
  The saved Zavod import metadata loaded successfully: actual column mappings,
  observed statuses and categories appeared in the form. Business-rule approval
  and canonical projection were not performed in the browser.

No live import, reporting-source switch, financial calculation, customer mapping
approval, production schema mutation or push is part of this step.
