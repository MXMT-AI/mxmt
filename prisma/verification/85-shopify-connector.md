# Shopify read connector and onboarding (#85)

Baseline: merged #84 / PR #90, main `27de5e9`. API contract reviewed on 2026-10-27.
This implementation does not activate a real shop, deploy code, register webhooks,
request new permissions or perform provider writes.

## Official contract

- [Orders](https://shopify.dev/docs/api/admin-graphql/2026-10/queries/orders),
  [Order](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Order) and
  [LineItem](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/LineItem).
- [Refund](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Refund),
  [RefundLineItem](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/RefundLineItem)
  and [OrderTransaction](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/OrderTransaction).
- [ProductVariant](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/ProductVariant),
  [InventoryLevel](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/InventoryLevel)
  and [global IDs](https://shopify.dev/docs/api/usage/gids).
- [Access scopes](https://shopify.dev/docs/api/usage/access-scopes) and
  [limits](https://shopify.dev/docs/api/usage/limits).

Static queries use `/admin/api/2026-10/graphql.json`; a different returned
`X-Shopify-API-Version` fails validation. No runtime `latest` URL or automatic
version fallback is accepted. No GraphQL mutation or arbitrary query input is exposed.

## Identity, credentials and activation

Only a canonical `<shop>.myshopify.com` host is accepted. Schemes, paths, ports,
URL credentials, IP literals and custom storefront domains are rejected. The access
token is sent only in `X-Shopify-Access-Token`, never a URL or GraphQL variables.
Redirects fail. Existing tenant/provider encryption, signed ADMIN connection routes,
write-only credentials and explicit source selection are reused. A token must be
obtained through the shop's authorized app workflow; expiry requires an explicit
credential update in Settings. This slice does not implement OAuth installation or
exchange client secrets for access tokens.

Every adapter read verifies permanent shop domain, shop/app global IDs, timezone,
currency and granted `read_orders`, `read_products`, `read_inventory`, `read_locations`
scopes. A separate check probes product-cost permission; current unit cost is never
used as historical cost. Non-secret actual shop/app IDs, API version, timezone and
granted scope handles are persisted in the connection check and available in Settings.
Successful reads do not prove the token lacks write permissions.

Default order access is limited to recent history. `read_all_orders` is an additional
permission, not a substitute for `read_orders` and not proof that a customer has
complete historical data. Verified history requires both an actual grant and an
independent approved interval/reference. Empty pages or successful scan cursors do
not create that approval. Unverified current/LY coverage stays unavailable.

Connection saves version and audit the complete non-secret warehouse, money and
history evidence. Credential-only rotation clears checks/capabilities, increments
connection revision, and retains unchanged mapping approval. Saving or checking a
connection does not select the reporting source. Automatic sync remains disabled.

## Durable nested pagination

All query pages use the existing `DataSourceRecord` import lifecycle with resource
`shopify-query`. Migration `20261027020000_connector_journal_counters` adds
integer byte/page counters to the existing import run and backfills existing journal
pages once. The journal is scoped to
tenant, source, connection revision and import run. Its immutable page key also
binds query text, API version, app/shop identity, credential fingerprint, approved
mapping, filters, top-level cursor, variables and bounded generation.

Order roots request one order. Every order-line connection, each refund-line and
refund-transaction connection is drained explicitly. Catalog variants are queried
at the top level to avoid truncating a product's first variants; every variant's
inventory levels are drained separately. Provider pageInfo is validated, duplicate
IDs/cursor loops fail and parameterized InventoryLevel GIDs are retained intact.

Each worker invocation verifies identity and fetches at most three new journal
queries. It may yield an empty page with a new bound continuation while nested pages
accumulate. These are successful resumable checkpoints, not failed job attempts.
The adapter reconstructs from the durable pages on the next invocation and emits
only fully assembled orders/events or catalog rows. Nested cursors reside in the
journaled pageInfo and the exact next query variables; completed pages are not
refetched during replay. Large refund event lists are emitted in bounded output
batches without truncating nested lines.

Order line/refund page versions must match the root order/refund version. A final
order-version query guards against changes during assembly. Mixed versions publish
nothing and restart under a fresh bounded journal generation; persistent churn fails
closed. This guard does not turn a multi-order or inventory scan into a provider
snapshot. Shared source/revision/lease checks still fence final projection commits.

Queries use fixed creation or updated-time bounds with matching sort keys. Shared
continuations bind these bounds and mapping to the source/revision. Failed scans
retain their checkpoints; rotation or source changes cannot reuse old cursors.
No unapproved cross-source cursor, user-controlled URL or API query is followed.

Bounds are explicit: 4 MiB per HTTP/query page, 128 MiB and 10,000 pages per run
journal, 1,000 pages per nested connection. Existing catalog staging also keeps its
1,000-step/32 MiB limits. Since this adapter emits one variant per completed top-level
catalog step, large catalogs or very deep nested data can reach these limits; imports
fail explicitly rather than declaring truncated data complete. Scaling beyond the
existing worker/catalog limits requires a separate capacity change.

Order transactions are a documented array, not a cursor connection. The adapter
requests at most 250 and checks exact `transactionsCount` against returned entries.
A larger or unverified array quarantines that order rather than counting a truncated
payment history. Refund transaction connections are fully paginated independently.

## Request budgets and failure handling

The durable query-cost key is the app plus permanent shop, shared across tenant labels
and token rotations for that app/shop, separate for other apps or shops. A conservative
bootstrap reservation (500 points, 1,000 maximum, 1 point/second restore) is an internal
pre-feedback guard, not a claim about every shop plan. Provider cost/throttle feedback
then controls availability, maximum and restore rate.

Actual cost reconciles only the current request's unused reservation while keeping
concurrent reservations debited and clamping to provider-reported availability. This
allows multi-resource onboarding to complete without exhausting an overestimated
local budget. Backfill headroom and shared HTTP 429 backoff remain in force.
HTTP-200 THROTTLED errors persist bounded Retry-After timing; any GraphQL error,
partial data, missing version header or malformed response fails before publication.
Token echoes fail closed before journal persistence; audits use separate redacted
copies without mutating mapped source facts. Raw provider error messages are not
logged or returned.

## Financial and inventory interpretation

Money approval is explicit: shopMoney, tax-exclusive merchandise, shipping excluded,
original line quantity/price and all allocated line/order discounts. Presentment
currency never substitutes for shop currency. Line totals must reconcile to Shopify's
pre-return discounted subtotal and cannot exceed the order total. No financial
formulas are duplicated outside the existing normalizer/calculators.

A full-payment date requires complete transactions, successful non-test SALE/CAPTURE
money movement covering the order total and verified processing timestamps.
Authorizations, failures, partial payments and tax-inclusive/unverified scope do not
establish a sale date. Unpaid cancellations are distinct from paid sales followed
by refunds. Removed/edited quantities that cannot reconcile with current quantity
plus explicit refund lines leave financial scope unavailable.

The sale uses original quantities before refunds. Each refund has its own stable
Refund ID and native refund-line IDs. A return date requires successful REFUND
transactions covering the refund total; that total must also cover the associated
merchandise and tax. Refund creation time alone is insufficient. Return merchandise
uses the exact subtotal per quantity only when representable without rounding.
Current net order values are never imported alongside separately subtracted refunds.
Current inventory unit cost, receipts, historical COGS and historical stock remain
unknown. Supplier receipt support and provider writes remain disabled.

Numeric source mapping codes reuse the shared policy: 1 SALE, 2 RETURN, 3 PREORDER,
4 REFUSAL. These are adapter event codes, not Shopify status IDs. Review client-wide
status overrides before activation. Unknown channels stay unavailable. Record-level
money/currency validation failures retain a quarantined audit record, preserve old
valid projections and do not block later identified orders.

Stock uses owner-approved physical `on_hand` at explicitly selected active location
IDs. `available`, inventory value, reserve and omission never imply physical stock
or in-transit zero. Untracked variants or absent selected locations retain unknown
stock; malformed requested quantities fail. Variant GIDs are product identities;
SKU/barcode strings preserve leading zeroes. Product types use deterministic,
source-namespaced category keys; vendor text does not establish ownership or cost.

## Settings and verification

Shopify uses existing Field controls and localized diagnostics. A shared connection
hook also serves Horoshop: bounded authenticated save/check requests, malformed JSON
and metadata rejection, unsaved-change warnings, accessible status/error feedback,
and no checking an unsaved draft. The token clears only after a successful save;
viewers never receive credential inputs. Existing Settings parallel server reads and
theme are reused, following the requested React, frontend and interface skills.

Validation covers real signed API handlers, isolated SQL workers/journals, source and
revision isolation, credential rotation, query/filter cursor rejection, interruption
and replay, nested connections beyond 250 rows, cost feedback and throttling,
version churn, partial payments/refunds, unchanged financial calculations and all
five screens. A synthetic comparison imports sale 40 minus refund 20 as revenue 20;
missing historical cost prevents a financial action export. No real shop or production
database is used.

Local browser verification was attempted but the tool reported browser use disabled
in Work settings. No interactive screenshot, mobile overflow check or production
browser E2E is claimed. A local synthetic fixture of the real components was prepared
outside the repository; static component/role/localization tests remain the available
UI evidence. Final command results are recorded after verification below.

## Real-shop acceptance checklist

1. Obtain restricted authorized shop/app credentials through Shopify; enter the token
   in Settings, not chat, source files or issue comments.
2. Verify permanent domain, app ID, actual scopes, token lifecycle, timezone and API
   version; confirm cost-view permission separately from historical COGS evidence.
3. Approve exact active locations and physical on_hand interpretation; reconcile
   untracked/missing-location SKU exceptions without substituting numeric zero.
4. Approve shopMoney/tax/shipping/discount semantics and verify full/partial payment,
   order edit, multiple refund and failed/pending refund examples against account data.
5. Obtain actual older-order access and an independently reconciled history interval;
   confirm the configured client status list matches the adapter's numeric event codes.
6. Run checks, explicitly select Shopify, then perform manual imports and compare
   normalized facts, all five screens and scenario export readiness against references.
7. Complete browser/mobile checks and customer acceptance before production activation.
   OAuth rollout, automatic synchronization, webhooks, receipt support and broader
   catalog capacity are separate from this read adapter.

Final validation: `npm test -- --maxWorkers=2` — 117 files / 1148 tests passed;
`npm run build`, `npx tsc --noEmit` and `git diff --check` passed. The journal
content-hash follow-up was also verified by all six Shopify SQL pipeline tests.

## PR #91 review follow-up: constant-work journal budget

The previous writer recomputed `sum(octet_length(payload::text))` across every
stored page on each insertion. It now locks the tenant/source-scoped import run,
reads its durable byte/page totals and looks up the exact immutable journal key.
A duplicate is replayed without charging the budget, even at capacity. For a new
page, PostgreSQL computes `octet_length(incoming::jsonb::text)` once; insertion and
counter increment commit or roll back together. This preserves serialized JSONB
text semantics, including UTF-8 and JSONB spacing, rather than measuring compressed
storage with `pg_column_size`. The 128 MiB/10,000-page bounds remain unchanged.

The migration backfills totals using a single grouped pass of existing
`shopify-query` records. Empty and unrelated runs keep zero defaults. Existing pages
are neither deleted nor rewritten; existing over-limit runs may replay pages but
cannot add more. Counters account for immutable journal inserts, including old
credential revisions within the same run. Raw-page edits or deletion outside the
journal writer would require matching counter maintenance; no such runtime path is
introduced here.

Deployment requires pausing/draining connector workers, applying the migration and
deploying the new writer before resuming. Old application writers do not maintain
these counters, so they must not continue writing after the backfill. No migration
was applied to the configured development or production database during this review.

Isolated SQL tests execute the actual migration against pre-existing UTF-8 pages,
verify exact byte counts, duplicate retries, both limits, tenant/run isolation,
transaction rollback and competing puts. PGlite serializes its transactions; the
production run-row locking strategy is exercised through the SQL boundary, without
claiming a multi-process production load benchmark.

Review validation: 118 files / 1154 tests passed; production build,
`npx tsc --noEmit` and `git diff --check` passed. Migration execution and backfill
verification used isolated PGlite only; no live database schema/data was changed.
