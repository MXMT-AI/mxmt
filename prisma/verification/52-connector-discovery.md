# Additional connector discovery and implementation plan (#52)

Baseline: `db78d90` (`main`, merged #80). Discovery: October 27, 2026.
Parent: [#52](https://github.com/MXMT-AI/mxmt/issues/52), v2 / after MVP.
Authority: [approved D01–D22](../../docs/mvp-business-decisions.md),
[existing connector contract](29-connector-onboarding.md) and
[MVP acceptance gates](51-mvp-acceptance-rollout.md).

Status: **Discovery and a shared credential-isolation prerequisite prepared.
The four provider adapters and their activation are not implemented by this change.**
The #51 preparation PR has merged, but customer acceptance/live operational gates
remain open. V2 development can proceed at the owner's request; these integrations
do not establish or block MVP acceptance. No credentials, customer connections,
production imports or deployments were created.

## Findings that determine the implementation split

The existing contract lists the four provider names, but that is not evidence of
working adapters. Source discovery identified these SalesDrive-specific boundaries:

| Boundary | Current implementation | Required shared work |
| --- | --- | --- |
| Source storage | `DataSourceKind` has GOOGLE_SHEETS, SALESDRIVE and YML | Add actual provider kinds with a forward migration; preserve legacy constraints/rows. Do not store another provider as SALESDRIVE/YML. |
| Credentials | AES-GCM AAD was fixed to tenant + SalesDrive | This change adds an explicit provider argument with the SalesDrive default; old envelopes remain readable. New provider services must supply their own provider. |
| Connection/API/UI | `service.ts`, Settings cards and `/api/connectors/salesdrive/*` accept SalesDrive fields | Add provider-specific validated configurations behind shared auth/encryption/check boundaries; reuse UI components rather than generic unvalidated JSON editors. |
| Source selection | Sales/daily calculations and navigation select the SalesDrive connection directly | Add explicit tenant-owned source selection and source-bound settings/snapshots. Never combine two connectors' orders or select an arbitrary row. |
| Pagination | `PageRequest.page` and `ConnectorPage.nextPage` are numeric | Define versioned provider-neutral continuation/checkpoint semantics for page, offset and GraphQL cursors. Old consumers must not interpret an ignored cursor as completed history. |
| Worker | Jobs, source mappings, scheduler and runtime loader assume SalesDrive | Reuse durable cycles/leases/raw storage/recalculation; dispatch by validated source/provider and capabilities. Keep old SalesDrive job/checkpoint behavior. |
| Throttling | Fixed SalesDrive account windows | Add provider-scoped quota policies and Shopify cost feedback. Never use one global KeyCRM host as every tenant's quota identity or expose raw keys in budget IDs. |
| Stock/receipts | Catalog is a bounded complete YML observation; receipt posting uses account mappings | Support independently paginated product/stock reads with a complete-observation barrier; missing receipt support stays unavailable, not empty proven history. |
| Financial events | Current source order projection is interpreted using approved mappings | Establish partial refunds/payment/currency identity before publishing new sources. No copied status IDs, inferred returns or revised metrics/classification. |

Recommended activation model for the first v2 iteration: one explicitly selected
merchandising source per tenant. Preserve all old snapshots and source histories.
Saving/checking a second connector must not switch the source or merge duplicate
orders from an upstream shop and its CRM. A source change invalidates current
scenario inputs and requires a new frozen snapshot. Multi-source consolidation,
entity reconciliation and FX are separate decisions, not implicit in #52.
This recommendation must be settled in the common foundation implementation;
no active configuration is changed by this discovery.

## Provider discovery

### KeyCRM

Primary source: [official OpenAPI YAML](https://docs.keycrm.app/api.yaml), loaded
from the official documentation application's configured `./api.yaml` URL.
OpenAPI 3.0.0, API spec version 1.2.0, SHA-256 of downloaded bytes:
`e8f48d5a6c39c23deb712be8854891937b912487878393910c9d58650b13e12e`.

- Fixed HTTPS API origin `https://openapi.keycrm.app/v1`; Bearer API key in headers.
  Use server-only encrypted credentials and a non-secret logical account identity.
  Verify issued-key permissions; read-only adapter methods do not prove the key
  itself has no write authority.
- Orders: `/order`, explicit `include=products.offer,status,payments` as required
  by the selected fields; dictionaries `/order/status` and `/order/source`.
  Preserve order-product row IDs separately from product/offer IDs and source UUIDs.
- Products/variants/stock: `/products`, `/offers`, `/offers/stocks` (not their PUT
  operations). Join through documented variant/product identity; verify warehouse
  inclusion and reserved-versus-physical stock before choosing the stock measure.
- Page numbers and `limit` <=50; UTC filters include `created_between` and
  `updated_between`. Keep fixed bounds/overlap and source pagination warnings.
  Do not fetch returned `next_page_url` blindly or forward keys to another origin.
- Current schema states **20 requests/minute/key**. Some other official help pages
  still state 60; use 20 until the actual account policy is verified. Persist quota
  across checks and imports; honor 429/retry metadata and reserve routine headroom.
- No two-year history guarantee or supplier-receipt API is established by this
  discovery. Probe the requested history range and record earliest proven coverage.
  Unsupported receipts cannot establish first-arrival dates or complete STR history.
- Confirm currency, discounts versus line net totals, `purchased_price` units,
  partial/multiple payments, true payment dates, returns/refunds and service/gift-card
  markers using account fixtures. `payment_status=paid` is not itself a payment date.

### Horoshop

Primary sources: official [authentication](https://horoshop.notion.site/1b6cc289707981b4bc0fc160b2b5fdf4),
[orders](https://horoshop.notion.site/1b6cc28970798113b9b3fbd6fe844076),
[catalog](https://horoshop.notion.site/1b6cc289707981e782b6e7c57c2fa526).

- HTTPS JSON POST `/api/auth/` with an integration login/password returns a
  600-second token. Send tokens in subsequent JSON bodies, never URLs. These are
  read operations over POST; do not expose a universal arbitrary API function call.
  Keep token refresh tenant/connection-revision scoped and redact response tokens.
- Store-specific origin must be verified/allowlisted. Custom shop domains need
  SSRF/private-network and redirect protection; a caller-supplied HTTPS string alone
  is insufficient. Do not probe the user's production site during discovery.
- Orders: `/api/orders/get/`, `from`/`to`, `ids`, `offset`+`limit`; dictionary
  `/api/orders/get_available_statuses/`. Published date bounds do not establish an
  update-time filter. Incremental capability remains unverified; use a proven
  rescan/refetch strategy until provider/account evidence supports update filtering.
- Catalog: `/api/catalog/export/`, offset/limit with maximum 500, article/modification
  identity and optional warehouse `residues`. Validate completeness independently
  from requested limit and observation consistency. Presence labels do not prove
  a numeric stock quantity. Missing warehouse stock/cost remains unknown.
- API version, account access, effective timezone, history depth, quota and error/
  pagination response envelopes require account evidence. No authoritative numeric
  request budget was established here; do not copy a third-party quota or token TTL.
- Confirm paid-date/partial payments, discount semantics, currency, returns, barcode
  and modification IDs. A paid flag or generic updated date is not a verified event.
  Supplier receipts and historical stock are unsupported until independently proven.

### Shopify

Primary sources: [GraphQL orders](https://shopify.dev/docs/api/admin-graphql/latest/queries/orders),
[order history](https://shopify.dev/docs/api/admin-graphql/latest/queries/order),
[scopes](https://shopify.dev/docs/api/usage/access-scopes),
[limits](https://shopify.dev/docs/api/usage/limits),
[refunds](https://shopify.dev/docs/api/admin-graphql/latest/objects/Refund).

- Use the versioned GraphQL Admin API, with a pinned supported version (2026-10
  at discovery), verified shop identity and server-side access token. Fixed
  `*.myshopify.com` shop origin; never forward a token to arbitrary custom domains.
  Record returned API version and granted scopes; no access token in query URLs.
- Obtain the appropriate read scopes for orders/products/inventory/locations and
  authorized cost data. Default order access is the most recent 60 days; older
  history requires approved `read_all_orders` alongside the relevant order read
  permission. Permission approval, successful empty data and complete history are
  different outcomes. Do not request write scopes just to implement read methods.
- Cursor pagination must cover nested line items, refund lines, variants and
  inventory levels too. A full first 250 rows is not the complete order/catalog.
  Persist opaque cursor state with its shop/query/filter/version/revision context;
  reject a cursor reused with another source or changed query.
- Query-cost throttling depends on app/shop/plan and reported cost/throttle state;
  handle GraphQL errors/THROTTLED even on HTTP 200. Persist safe retry timing and
  never silently publish partial data after GraphQL errors or truncated subqueries.
- Use stable global order, line, variant, location and refund IDs. Choose physical
  `on_hand` versus sellable `available` and the warehouse population explicitly.
  Current inventory item unit cost is not historical sale COGS or a supplier receipt.
- Specify shopMoney/presentmentMoney, tax/shipping/discount inclusion and partial
  payment/refund rules before normalization. Separate multiple refund events by
  stable refund and line IDs; do not count a current net order plus its refunds
  twice. Refund `createdAt` alone does not prove successful money movement.

### CSV

CSV is an owner-supplied input contract, not a remote API. Define the versioned
schema and mapping preview before implementing activation. Recommended first
provider slice because it can be verified without remote account access.

- ADMIN uploads bounded UTF-8 CSV (optional BOM) with an explicit delimiter and
  versioned column mapping. Specify quoting, embedded newlines, escaped quotes,
  decimal units, date format/timezone and empty versus explicit zero. Preserve
  leading-zero SKUs/barcodes and exact money strings. Never evaluate spreadsheet
  formulas or coerce locale decimals/dates without the selected mapping.
- Separate orders/order lines, products, dated stock observations, supplier receipts
  and optional dictionaries. Stable external order/line/product/event/document IDs
  are required where applicable; filename, row position and upload time are not IDs.
- Freeze exact uploaded bytes/hash and source/schema/mapping revision. Repeated
  upload must not duplicate facts. Changed versions, removed lines and failed pages
  follow the existing raw/projection/atomic import contracts and diagnostics.
- A catalog/stock file must explicitly declare whether its population is complete
  or partial. Do not clear omitted stock or advance complete historical coverage
  from an incomplete upload. Reject duplicate/ambiguous IDs and partial validation
  failures before activation; retain safe diagnostics with original row references.
- Partition uploads/jobs/checkpoints/previews/downloads by signed tenant and source;
  file metadata cannot override identity. Validate RBAC, body/row/field/byte limits,
  dry-run versus activation, cancellation/retry, expiration/retention and audit.
- CSV receipt/status/ownership rules still require explicit owner mapping. An
  upload is not permission to infer cost, supplier, commission or historical scope.

## Ordered implementation and acceptance

1. Common source/runtime/checkpoint foundation: source selection, schema, provider
   configuration, quota/continuation support and compatibility tests.
2. CSV vertical slice (recommended), with secure dry-run/activation and comparison
   fixtures through the same metrics/screens/CSV exports.
3. KeyCRM, then Horoshop and Shopify; reorder by the owner's first real client need.
   Provider-specific account evidence may proceed while the common layer is built.
4. Per provider, run onboarding checks, contract fixtures, tenant/source isolation,
   overlap/replay/idempotency, history coverage and quota/recovery checks. Reconcile
   the same approved facts through unchanged financial and classification engines.
5. Activate one selected source only after its evidence/permissions/mapping and UAT
   gates pass. Retain the old source and immutable reports for rollback/reconciliation.

The parent remains open until **all four** adapters satisfy their acceptance cases.
The implementation sub-issues below are separate reviewable deliveries, not a new
stack or four independent import pipelines. Estimates must be refined after account
schemas/history/volume are known; the parent's 8 SP is not a proven total budget.

## Shared prerequisite implemented here

`encryptCredentials` / `decryptCredentials` accept an optional explicit provider
and bind it into AES-GCM authenticated data. SalesDrive remains the default, using
the exact old `connector:v1:<tenant>:salesdrive` context and v1 envelope. New provider
configuration code must pass its own provider explicitly. Unknown runtime providers
fail with the existing sanitized storage error. No stored credentials are rewritten.

Tests independently construct an old-format envelope, verify it remains readable,
and exercise cross-tenant/cross-provider rejection, randomized nonces and tampering.
These tests prove credential isolation, not provider authentication or onboarding.

## Handoff inputs

For each first test account, the owner/operator must provide through the protected
setup workflow: account identity/domain, approved access scopes, timezone/currency,
warehouse population, status/channel/date/discount/payment/refund/receipt mappings,
requested history and expected volumes, plus restricted redacted source/expected
comparison fixtures. Enter keys/passwords/tokens in Settings when that provider's
secure form exists, not in chat or GitHub. No live access is needed for the discovery
or synthetic contract implementation; live acceptance requires actual evidence.

## Implementation sub-issues

- [[v2 26.1] Generalize connector source selection, runtime, and checkpoints](https://github.com/MXMT-AI/mxmt/issues/81)
- [[v2 26.2] Implement CSV connector and onboarding](https://github.com/MXMT-AI/mxmt/issues/82)
- [[v2 26.3] Implement KeyCRM connector and onboarding](https://github.com/MXMT-AI/mxmt/issues/83)
- [[v2 26.4] Implement Horoshop connector and onboarding](https://github.com/MXMT-AI/mxmt/issues/84)
- [[v2 26.5] Implement Shopify connector and onboarding](https://github.com/MXMT-AI/mxmt/issues/85)

## Validation and board state

- Focused secrets/connector/onboarding regression: 75 tests passed across 3 files.
- Full `npm test -- --maxWorkers=2`: 976 tests passed across 89 files.
- `npm run build`, `npx tsc --noEmit` and `git diff --check`: passed.
- All five sub-issues are linked to #52 and added to the existing MXMT board in
  Backlog, using the existing `backend` and `enhancement` labels. Parent #52 stays open.
- No provider adapter/live account acceptance is asserted by these results.
