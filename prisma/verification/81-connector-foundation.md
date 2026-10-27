# Provider-neutral connector foundation (#81)

Baseline: `7bf5637` (`main`, merged #86). Branch: `feat/81-connector-foundation`.
Parent: #52. Policy authority: approved #27 D01–D22; provider evidence/implementation
boundaries: [discovery](52-connector-discovery.md).

This change provides the shared infrastructure for #82–#85. Only the existing
SalesDrive adapter is registered in production code; CSV, KeyCRM, Horoshop and
Shopify remain separate implementations. Synthetic registrations exercise the
common runtime without installing or activating those external integrations.
No production database, scheduler, credentials or customer account was changed.

## Schema and compatibility

Migration: `20261027000000_connector_foundation`.

- Add KEYCRM, HOROSHOP, SHOPIFY and CSV enum values; never relabel existing sources.
- Add `ConnectorSelection`, one tenant-owned selected source/revision, with a
  composite source/tenant FK. No selection row preserves the existing SalesDrive
  default, including clients created after migration.
- Store checked adapter capabilities on the existing connection and query-cost
  feedback on the existing account budget. Credential rotation invalidates checks
  and capabilities without changing the selected source.
- Add tenant/source/job-scoped `ConnectorCatalogPage` staging, with composite FKs.
  Staging does not become an active catalog or stock observation until completion.
- Extend the existing financial-result shape constraint to permit CONNECTOR
  publications alongside legacy SALESDRIVE and SHEETS records. Preserve the existing
  cache key, payload shape, immutable result IDs and financial calculation version.

Enum additions precede the schema transaction, following PostgreSQL enum rules;
a later migration failure may leave the additive enum labels, but the table/
constraint changes roll back. No down migration drops live data or rewrites old
migration history. Rehearse with the pinned Prisma toolchain on an authorized
isolated Neon branch before deployment. Use direct migration credentials, record
actual migration status and retain a restore point. Do not run `db push`/reset.
No live migration/rehearsal is claimed by local PGlite verification.

Old SalesDrive encryption envelopes remain readable via #52's provider-bound
helper. Existing numeric job checkpoints, cache names, raw YML identities, source
mapping keys, API URLs and exported receipts remain compatible. SalesDrive order
pages keep their existing maximum of 100; receipt pages remain bounded to 25.
Existing API tests retain the same signed-session authorization and public response
contract; their transaction double now models the added tenant lock/prior-source read.
Existing partial order-transport doubles now declare their provider/capabilities.

## Explicit source selection

`lib/connectors/source.ts` supplies the shared selection predicate, selected source
lookup, mapping key and administrator-only selection service. Sales, daily metrics,
navigation, current Data Quality, sync progress, scheduler, workers and recalculation
all use that same source boundary. Source selection never consolidates upstream CRM
and shop orders, sums providers' stock or performs FX.

`GET /api/connectors/source` returns only the signed tenant's public connection
choices and selection revision. `POST` accepts exactly `{sourceId, revision}` and
requires ADMIN. It rejects identity overrides, foreign/missing sources, failed/
missing checks and stale revisions. A successful switch locks the tenant, creates a
new revision and records SOURCE_SELECTED with the signed actor in the existing
actions log. The FK rolls the whole transaction back for a foreign actor.
Repeated selection of the current source/revision is a no-op.

Saving/checking a connection does not activate a new provider. Replacing a legacy
SalesDrive account pins the previous default source rather than silently moving
financial reporting to the replacement account. That old source may now be
unavailable until the administrator checks and explicitly selects the replacement.
The picker retains its previous source ID/revision and shows that unavailable state.

Settings reuses the existing control/label components and theme tokens for a
localized reporting-source picker. Viewer controls are disabled; only checked saved
connections can be selected. The existing credential form notifies it after save/
check. The picker warns before leaving with a pending selection, displays errors
and live status, and explicitly asks the user to refresh the report after activation.
Shared sync cards use provider-neutral routes/headings in Settings; their old URLs
and default SalesDrive presentation remain compatibility aliases for old consumers.

## Snapshots, scenarios and in-flight work

A new screen snapshot records the selection revision in source-state provenance.
Revision zero retains the old source-state hash format. Switching away and back
still invalidates old current scenarios; a source ID match alone is insufficient.

- Historical screen reads remain available, with changed-source freshness metadata.
- New Repricing input creation, Repricing/Reordering previews and new exports
  require the currently selected source/revision. Conflicts are surfaced as
  CONNECTOR_SOURCE_CHANGED with HTTP 409 rather than a generic provider failure.
- Existing saved CSV downloads/history and an exact export retry remain immutable.
  No audited CSV is regenerated from live inputs on a source switch.
- Scenario publication takes a tenant share lock before its calculation snapshot;
  selection writes update the tenant row so repeatable-read conflicts retry with
  the new selection. This prevents a newly published financial action racing a switch.
- New claims and dispatches use the selected connection. Deselected queued/paused
  jobs and raw evidence are retained, not discarded. A worker rechecks selection
  under the tenant/source locks before committing a fetched page. A switch during
  the remote read pauses the old job without projecting that page.
- Recalculation claims/publication also check the selected source; its immutable
  phase results remain separately versioned. Metrics and classification formulas
  are unchanged, including partial totals and incomplete-history semantics.

## Provider registrations and secure onboarding

`PROVIDER_ADAPTERS` is a static code registry of parse/identity/factory definitions.
It contains no per-tenant mutable state, shared credential cache or user-provided
executable configuration. A provider slice registers its parser, public account
identity/timezone, connector factory and budget policy. CSV may declare an offline
transport; a network call from that transport is rejected rather than bypassing quota.

`createProviderConnector` decrypts with both tenant and provider, validates the
provider configuration and constructs the adapter with the shared budgeted transport.
`loadConnectorRuntime` resolves the signed tenant's selected source, or the exact
source bound to a claimed job, and verifies source kind and returned adapter provider.
Unknown/uninstalled providers and unverified network budgets fail closed. The shared
failure handler pauses those configuration failures instead of retrying forever.

Connection storage and check logic are parameterized by provider while legacy
SalesDrive service exports remain wrappers. The reused handler backs
`/api/connectors/[provider]` and the existing `/salesdrive` route: signed sessions,
ADMIN-only writes/checks, bounded bodies, validated fields, fresh request IDs,
no-store responses and sanitized errors. Unregistered adapters cannot save arbitrary
JSON credentials or issue remote probes. Provider-specific secure forms belong to
#82–#85 and reuse this boundary; no generic secret JSON editor is added.

## Continuation and recovery

`ConnectorPosition` supports numeric pages, offsets and opaque cursors. A v2 adapter
returns explicit `next` (a position or null) with legacy `nextPage:null`; omission of
`next` is accepted only for the legacy numeric protocol. Request position and adapter
page-size capability are separate from the provider response's completion signal.

A durable continuation binds source, provider, connection revision, resource,
mode/window, policy, page size and observation/query identity. It rejects changed
bindings, protocol changes, oversized responses, invalid positions, offset jumps,
backwards numeric pages and repeated cursor hashes. Orders are capped at 10,000
continuation pages; catalogs additionally cap staging at 1,000 pages / 32 MiB, with
an 8 MiB page payload bound. Limits fail visibly instead of truncating coverage.

Cursor state is stored only in the tenant/source-scoped job; progress responses do
not expose it. Failed page transactions preserve the previous checkpoint and raw
projection. The old numeric checkpoints are adopted at their existing page number.

Resume goes through one shared service for individual jobs, displayed cycles and
backfill. With the same credential revision it retains the continuation. On revision
change it drops continuation/staged catalog state: SalesDrive retains its numeric
page, while a new provider restarts the fixed saved window from its first page/stage.
Counters restart for that replay; raw evidence, stable identities and existing facts
remain. Replaying pages remains idempotent. A checkpoint cannot reuse an old opaque
cursor with the new credentials. Account/source changes never acknowledge another
source's job.

## History and atomic catalog activation

Capabilities decide whether status/channel/receipt reads are supported. New
providers explicitly opt into automatic sync; offline/unverified sources are not
polled automatically. The legacy SalesDrive schedule and cron URLs remain available.
The external worker still performs one bounded page or local calculation phase per
tick and uses existing source leases, queue admission guards and account quotas.

An unsupported receipt scope does not advance a receipt cursor. A new provider's
order history is unverified unless completed pages explicitly declare coverage.
Verified partial bounds are intersected across pages and with the requested window,
then stored as coverageFrom/coverageTo. Existing history helpers consume those bounds
without claiming the full requested two years. For example, verified August–October
coverage can support September current metrics while LY stays incomplete and the
change percentage stays unavailable. Known partial amounts remain visible under
existing partial-data rules; they are not converted into complete acceptance totals.

For new providers, `SyncCursor.through` tracks scan progress only. The shared
`readOrderHistory` boundary supplies all three consumers with explicitly verified
backfill/incremental creation-history intervals; it never extends them to that
scan cursor. Verified intervals are merged in SQL before the disconnected-span
limit and complete-business-day calculation, retaining gaps. This also avoids
counting every routine incremental page/window toward the history limit. A
webhook or successful updated-at scan alone cannot certify creation history.
SalesDrive retains its legacy baseline plus incremental-watermark contract.

For a paginated catalog, each page carries a stable observation identity and an
explicit complete-population declaration. Pages are staged durably under their
job/source/tenant. A failed/partial/mismatched observation cannot change active
catalog/stock or claim successful receipt coverage. The terminal page validates
contiguous page sequence and the complete assembled identity/stock population
before one transaction activates it. Old active observations remain usable on failure.

Atomic activation is not a claim that a live remote API provides a frozen snapshot.
Every product/stock row retains its actual observation timestamp; different pages
can have different times and business dates. Price history uses the product time;
stock and cost evidence use the stock time. The manifest timestamp records the
latest page observation, not a fabricated common observation instant. SalesDrive's
single-feed same-observation validation remains strict. New complete-snapshot methods
must also declare completeness/observation identity explicitly. Pagination warnings
and missing historical-stock/receipt evidence remain visible.

## Request budgets and GraphQL feedback

The request reservation helper accepts a validated provider policy while retaining
the exact SalesDrive defaults. Provider/account identity namespaces budget hashes;
independent accounts do not share a fixed-host quota, while the same verified account
can share its budget across tenants. Registrations must provide a stable non-secret
account identity (or derived identity), not a label that changes on key rotation.
Keys/tokens are never stored as budget IDs. Backfill keeps routine headroom and even
a one-request policy reserves at least one permitted request.

The query-cost wrapper atomically reserves estimated cost using durable available/
maximum/restore-rate state, then consumes bounded feedback from a response clone.
HTTP-200 GraphQL errors reject partial data; THROTTLED persists a retry block. Cost
feedback cannot refund another in-flight reservation through an out-of-order response.
Backfill leaves 20% cost headroom; queries larger than the available policy capacity
must be split by the adapter, not looped indefinitely. No request sleeps in a worker.
Initial query-cost estimates/limits are supplied by the registered adapter policy,
then refined conservatively from verified numeric feedback. The Shopify slice must
verify its actual plan/scopes/version; this foundation does not claim a live quota.

## Verification and rollout

New synthetic tests exercise:

- Two tenants, saved inactive providers, source/actor FK isolation, optimistic
  revisions, source switches and unchanged equivalent financial/daily results.
- Historical reads versus invalidated scenarios after switching away and back;
  current-only verified history with incomplete LY.
- Signed source APIs, forged identity headers, viewer denial, bounded inputs,
  safe metadata and stale/foreign-source errors.
- Legacy numeric pagination, bound cursors, offsets, loops and ignored-continuation
  rejection; actual cursor worker completion without invented history.
- Partial catalog staging, failed atomic validation, retry, cleanup and distinct
  per-row observation times; no cursor for unsupported receipts.
- Provider-bound runtime decryption, foreign source denial, key rotation replay
  without duplicate facts and source switching during a remote read.
- Provider/account request isolation, durable cost restoration/headroom and HTTP-200
  GraphQL partial/error/throttle handling.
- PR #87 review regressions: sale-cost evidence bounded by each stock observation,
  complete versus gapped incremental receipt intervals, unverified/disconnected
  order history versus contiguous verified incremental intervals, and cancellation
  of both response tee branches when GraphQL inspection rejects a response.

Local validation passed:

- `npm test -- --maxWorkers=2` after PR #87 review fixes: 998 tests across 95 files.
- Focused continuation/source/history/receipt/cost/response-cleanup regression:
  17 tests across 5 files.
- `npm run build`: production build, including Prisma client generation.
- `npx tsc --noEmit`, `npx prisma validate` and `git diff --check`.

No new provider account
acceptance, real credentials/imports, production migration/deployment or live scheduler
change is included. Native browser automation was disabled in this environment;
no new interactive browser/reference-layout verification is claimed for the Settings
picker. A staging visual/keyboard/mobile check remains part of release verification.

Before rollout, stop old workers/relay writers, rehearse the additive migration on
an authorized isolated database and verify legacy and generic route behavior. Deploy
code matching that schema, retain the selected/default SalesDrive source and run
an authorized canary before registering new provider adapters. An application rollback
must keep schema/data and pending jobs intact; if incompatible with v2 continuation,
pause workers and use a reviewed forward fix rather than handing those jobs to the
old numeric-only worker. Follow [the #51 release checklist](51-mvp-acceptance-rollout.md).
