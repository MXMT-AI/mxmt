# KeyCRM connector and onboarding (#83)

Baseline: `f29fb70` (main after merged #88).
Branch: `feat/83-keycrm-connector`; parent #52, runtime foundation #81.

## Official contract and verified implementation boundary

Primary source: [official KeyCRM OpenAPI](https://docs.keycrm.app/api.yaml),
retrieved October 27, 2026. Version 1.2.0. SHA-256 of exact downloaded bytes:
`e8f48d5a6c39c23deb712be8854891937b912487878393910c9d58650b13e12e`.
This matches discovery #52 and issue #83. The schema is evidence about endpoints,
not evidence about an individual customer's permissions, semantics or history.

The registered adapter performs only fixed-origin HTTPS GET requests to
`https://openapi.keycrm.app/v1`. The bearer key travels only in Authorization.
Redirects are rejected, requests time out after 8 seconds, responses are bounded
at 4 MiB, UTF-8 decoding is fatal and JSON numbers pass through the existing
lossless decoder before ID/money validation. Remote error text/customer data is
never returned as an error. There is no write method, remote URL configuration,
thumbnail download, callback URL or arbitrary next-page URL following.

Supported reads:

- `/order` with `include=products.offer,status,payments`, stable ID sort, numeric
  pages and explicit `filter[created_between]` / `filter[updated_between]` bounds.
  Source UTC second filters round outward to avoid losing fractional boundaries.
  The durable worker retains its original requested window and overlap.
- `/order/{id}` for a bounded numeric webhook order ID, with the same includes.
- `/order/status` and `/order/source`, with bounded complete dictionary pagination.
- `/products`, `/offers` and `/offers/stocks`, including documented product/offer
  ID filters and `filter[details]=true` for warehouse detail.

Every remote page is limited to 50 or less. Response current_page/per_page/total,
row count and duplicate IDs are validated. Remote pagination URLs are metadata
only; the next numeric request is built locally. Full dictionary reads cap at 500 entries;
common catalog staging/continuation limits remain in force. Source pagination is
not a frozen API snapshot, and the existing warning remains visible.

## Credentials, source identity, settings and quotas

Settings uses the existing controls/theme, signed connection API, provider-bound
encryption and source picker. Public connection projections contain account label,
revision and sanitized checks, never key/config ciphertext. The key field is cleared
after save and must be re-entered for updates. Viewer UI has no credential form.
All configuration/check writes require the signed ADMIN session (SUPER_ADMIN also
qualifies); forged identity headers and body identity overrides are rejected.

A stable non-secret logical account ID identifies the DataSource inside the tenant.
It is not an API hostname or a secret. Account identity and business timezone should
remain stable; changing timezone on the same source is rejected. Changing the
logical account creates a different source and requires explicit source selection.
Saving/checking a connection never changes the tenant's selected reporting source.

The existing request budget is reused with **20 requests per minute per key**, as
specified by the current OpenAPI. An SHA-256 key fingerprint namespaces the budget
separately from source labels: the same key shares quota across tenant/account-label
variations, while independent keys do not share the fixed API hostname's budget.
No plaintext key becomes a budget ID. Existing backfill headroom, persistent 429
Retry-After handling and worker yields apply to checks and imports alike. No sleeps
or process-local credential/quota cache are introduced. A rotated key gets its own
key quota; facts/checkpoints remain bound to the existing source/revision guards.

The provider registration adds an optional versioned source-mapping hook to the
shared save boundary. It writes approved status/channel/amount policy and actor
audit in the same tenant-locked transaction as encrypted configuration. Changing
mapping values requires a higher mapping revision. Source timezone conflicts,
foreign actor FKs or mapping conflicts roll back the credential update as well.
A tenant-row update coordinates mapping publication with financial-action locks.
SalesDrive and CSV paths do not acquire this hook or change their contracts.

## Financial facts and approval gates

Owner-confirmed evidence has a bounded reference, source currency and independent
flags. A first metadata-only save/check may omit evidence, leaving amounts, cost,
payment dates and active stock capabilities unverified. A successful API read
alone never establishes financial mappings.

- With explicit net-unit-price confirmation, `price_sold` maps to net unit price;
  source/order discounts must already be reflected in that field according to
  approved account fixtures. They are never subtracted a second time. Otherwise
  unit price remains null. Revenue, discounts and commissions are not inferred
  from grand_total or a status name.
- With explicit unit-purchase-cost confirmation, `purchased_price` supplies order
  unit cost; missing values remain null. The existing normalizer decides cost
  coverage. Catalog purchase price alone does not establish procurement evidence.
- With explicit full-payment-date confirmation, paid/overpaid orders require paid
  payments with positive exact amounts and valid payment_date values whose sum
  covers positive grand_total. The latest such payment_date is the fully-paid
  event instant. Partial/insufficient payments and missing payment dates leave
  paidAt null. Payment created_at is never substituted for the payment date.
- Order and source timestamps are interpreted as UTC, not the business timezone.
  The source timezone is used by unchanged reporting/day-boundary calculations.
- Stable order-product native IDs are required. They are distinct from offer IDs
  and parent product IDs. Missing/duplicate native line identity fails visibly;
  no row-position fallback is manufactured. The inline 1.2.0 order-product schema
  does not enumerate this native line ID: the actual account fixture must prove
  that a stable `id` is returned. Missing ID fails closed rather than using SKU,
  offer ID or array index as a substitute. Offer ID is the financial/catalog
  product identity; SKU/barcode strings retain leading zeros.
- For replay hashes, products and payments have deterministic content ordering.
  Exact raw response pages are retained separately. Reordered lines at an unchanged
  version replay without a false conflict. A newer full order replaces its line
  set atomically, including deletions; stale/conflicting versions retain existing
  facts through the shared version guard.

Refund event identity/date/amount semantics are not established by this OpenAPI
slice. Onboarding deliberately does not offer a RETURN mapping; arbitrary status
names, negative payments or order updated_at cannot invent a refund event. Receipt
reads are unsupported (capability false), never an empty verified history. A future
account-approved refund/receipt implementation needs explicit evidence and tests.
No ownership, supplier terms, commission, service/gift-card classification or FX is
inferred. New catalog products remain subject to the existing product-kind and
ownership approval in Settings/Data Quality before financial/classification use.

History proof is optional, explicit and tied to an approved UTC interval/reference.
Without it, successful/empty order pages do not certify the requested two years.
The worker records the requested window and unverified diagnostics. With proof,
backfill page coverage is bounded to that approved interval and intersected with
the request by #81. Updated-at scans do not extend creation-history completeness.
Automatic sync remains disabled for this provider until an operational acceptance
step explicitly enables a reviewed policy; manual durable refresh works after
check/source selection. No scheduler or production connection was activated here.

## Catalog and physical stock

Each catalog page reads at most 50 offers, then the corresponding bounded products
and stocks using documented filters. Missing/unexpected/duplicate associations or
an incomplete join reject the page. The common catalog worker now honors the
registered catalog page size instead of always requesting 100; legacy default
bindings stay at 100 for adapters without a page-size capability.

The canonical per-SKU identity is the offer ID. Base product metadata is joined by
product_id; `/products` alone is a parent-product read for diagnostics, not a stock
identity. Actual product currency must agree with approved source currency. Titles
are bounded text, not IDs. Retail price is exact; unknown catalog purchase-cost
provenance remains unknown until the existing receipt/sale-cost rules establish it.

Stock activation requires explicit physical-quantity confirmation. `quantity` is
used as the approved physical measure; reserve/in_reserve is retained in raw data
and is not subtracted. Empty warehouse selection uses the approved aggregate of
all warehouses. Selected warehouse IDs sum only their explicit quantities, and a
missing/duplicate selected warehouse or unknown quantity fails the check/import
rather than becoming zero. In-transit quantities are unavailable. Account acceptance
must also reconcile the API's offer/archive population and warehouse scope; API
pagination totals prove only the returned scope, not access to every account record.
Do not confirm stock evidence while that population remains unresolved.

Pages retain one observation identity across the staged run and actual product/
stock observation times. They become active only after the complete assembled
population passes shared atomic catalog validation. A failed page does not publish
partial active stock. This barrier does not claim the live remote API is immutable.
The #81/#82 source selection, tenant isolation, independent source observations,
stale-scenario fences and immutable historical exports continue to apply.

## Onboarding and read scopes

The form supports metadata-only save → independent read checks → owner mapping
approval with a revision/reference → save/check again → explicit KeyCRM selection
→ manual sync. Dictionary reads expose actual source status/channel IDs; no account
status is copied from SalesDrive. Unmapped status meanings remain unverified.

Checks probe at most one page for each dictionary and mark partial results
CHECK_FIRST_PAGE_ONLY when additional pages exist. A check stays at six bounded
requests instead of draining the account quota on a large dictionary. Full durable
dictionary imports paginate separately within their explicit 500-entry limit.
Checks expose separate orders, statuses, channels, products, offers and stock codes;
receipts explicitly reports NOT_CONFIGURED. Check success means these GETs worked.
It does **not** prove the issued key lacks write permissions. The UI instructs the
administrator to verify actual issued-key scopes in KeyCRM and highlights unresolved
history, supplier receipt, refund and ownership requirements. Real keys belong in
Settings, never chat/tickets or fixture files.

## Verification and rollout

Synthetic fixtures use only invented keys/accounts/products/orders. They are not
redacted customer fixtures or customer approval. Account-approved fixture approval
and production rollout remain explicit later gates. No credentials, live account
access, real imports, database migration or production deployment was performed.
No schema migration or new dependency is needed for #83.

Tests cover fixed origin/headers/redirect denial, includes and bounded filters,
lossless decimals/IDs, native identities, multi/partial payments, unknown costs,
bounded history evidence, warehouse joins, incomplete populations, provider errors,
malformed/oversized/invalid UTF-8 responses, timeout, pagination rejection, signed
RBAC, provider/tenant decryption isolation, mapping revisions/audit, stale/reordered/
deleted order lines, same-key quota isolation and persistent 429 feedback. Durable
fixtures run through unchanged financial/daily calculations and all five screens.
Existing source/continuation/catalog/financial/export regression suites are retained.

Local browser verification uses the real component/theme with synthetic responses:
explicit evidence checkbox, save/check separation, cleared password field, independent
scope results, unsupported receipts and a 390px layout without horizontal overflow.
This is separate from signed API/isolated database tests and is not a real-account
staging acceptance or a full visual comparison with the original project reference.

Local validation passed:

- Full `npm test -- --maxWorkers=2`: 1070 tests across 107 files.
- Focused KeyCRM contract, pipeline, API and UI regressions: 21 tests across 4 files.
- `npm run build` (production build, including Prisma client generation).
- `npx tsc --noEmit` and `git diff --check`.
- Synthetic local browser: evidence confirmation, save/check, cleared password,
  independent scopes, unsupported receipts and 390px no-horizontal-overflow layout.

No real-account acceptance, key permission proof, customer fixture approval or
production sync was performed. Real-account acceptance and production rollout
remain separate from implementation review.
