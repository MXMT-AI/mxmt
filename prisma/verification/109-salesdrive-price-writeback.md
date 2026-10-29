# #109 — SalesDrive price write-back preparation

## Source audit (2026-10-29)

The official [SalesDrive API documentation](https://api.salesdrive.me/api/docs/)
and its downloadable [OpenAPI](https://api.salesdrive.me/swagger/openapi-uk.php)
were inspected. The downloaded YAML SHA-256 is
`44a6c30a2aaa466cbf7cdf5cb0225a0ad3b1c7cabacaa5a907bad1114653110e`.
The schema is YAML despite the PHP URL; the web parser could not open the schema,
so its exact public bytes were downloaded and inspected without account credentials.

- Mutation is POST `/product-handler/`, action `update`, product `id` and numeric
  `costPerItem`, with `currency`. `price` in `dontUpdateFields` protects the price;
  it is not the field to send for a new numeric price.
- This endpoint supports adding/updating/deleting products, not a documented
  existing-only price update. The documented maximum is 100 products per request.
- The documented response is an aggregate `status` / `message`; it provides no
  promised per-item revision, conditional compare-and-set or idempotency token.
  A generic HTTP 200 is not proof every row changed or that no concurrent edit was lost.
- The YML export is automatically refreshed, not documented as a synchronous
  authoritative per-product read. Configured export currency/discount conversion
  cannot be assumed to equal native base price or the writable price field.
- `X-Api-Key` is the documented authentication header. Existing order/receipt
  read credentials do not establish product-write permission. Account-specific
  price semantics, access/rate/cost limits and canary remain unapproved.

The existing SalesDrive read connector retains `writes: false`. No HTTP mutation
adapter, new credentials or source activation is registered by source inspection.
`lib/salesdrive-price-contract.ts` records this audit and can serialize an exact,
bounded decimal token offline. Such a payload is not a complete safe integration:
existing-only atomic preconditions and verified read-back remain required.

## Owner-approved implementation boundary

On 2026-10-29 the owner explicitly approved: ADMIN preview, a separate approval and
separate execute; at most 20 prices; approval valid for 15 minutes; no automatic
retry of an uncertain write; restoration requires its own preview/approval. Code
and fake-transport verification proceed now, while live activation is deferred.
Account permissions, limits/costs, native currency/discount semantics and a real
canary are **not** approved by that decision.

Branch: `feat/109-salesdrive-price-writeback`, based on main after merged PR #111.
The uncommitted #54 checkout remains separate. No new database schema, scheduler,
UI or live credential is added. The SalesDrive read connector remains read-only.

## Transport contract and why live execution is disabled

`PriceTransport` is server-injected for offline verification. Production routes
provide **no transport or access policy**, so even signed ADMIN intent returns
`PRICE_WRITEBACK_DISABLED` before any source request. Browser fields cannot inject
an adapter, credential, endpoint, policy or fabricated remote price.

A future transport must supply capabilities the audited public schema does not
currently establish:

1. An authoritative native, non-converted, undiscounted UAH base-price read for
   each exact source product ID, with genuine remote version and observation time.
2. Atomic **existing-only** compare-and-set of version, expected old price and
   approval deadline, returning the applied version. No upsert, name/stock changes,
   currency conversion or silent discount manipulation is permitted.
3. Terminal attempt lookup by reserved attempt ID. `NOT_APPLIED` must be a durable
   terminal result that fences a late call with that same ID, not a momentary
   absence in a cache. `APPLIED` must be proof about that attempt, not an inference
   from matching current price. Otherwise return UNKNOWN and retain the lock.

A simple preflight GET followed by unconditional POST cannot satisfy this contract;
it has a race with another merchant/system. Current public SalesDrive documentation
also does not establish safe terminal lookup or update-only semantics. Do not
register a concrete HTTP write adapter or substitute YML/feed hashes for atomic
remote preconditions until a separately verified provider/account contract solves
these gaps. An approved exclusive-write process would need its own reviewed design;
this implementation does not assume one.

The offline `salesDrivePriceBody` serializer sends only ID, exact validated numeric
`costPerItem`, UAH and documented `dontUpdateFields` guards. It never sends delete,
stock, cost, names, arbitrary fields or secrets. This is a prepared payload contract,
not permission to call the upsert-capable endpoint. It is deliberately not wired
into a live fetch.

## APIs and lifecycle

All endpoints derive identity from the signed session, require ADMIN/SUPER_ADMIN
and recheck current tenant membership under the existing tenant transaction lock.
JSON bodies use exact keys; query overrides are rejected. Returned data is private,
no-store. Runtime access policy and credentials are never accepted from a client.

- `POST /api/merchandising/price-writeback/preview`:
  `{exportId, skuIds, compensatesId: null}`. Reuse exact final prices from the
  immutable repricing export, at most 20 distinct selected SKUs. Require own-stock,
  UAH and positive values exactly representable at two decimal places; trailing
  database zeroes are normalized without rounding. Unchanged prices are rejected.
- Validate selected SalesDrive source, financial snapshot freshness, source state,
  selection and connection revision. Pin a unique one-to-one canonical SKU/source
  product mapping; duplicate/missing/changed aliases cannot select a product by name.
- Read authoritative remote prices. Missing products, ambiguous scope, active/unknown
  discounts, converted currencies, stale/future observations and extra/hostile
  fields fail. Each old price must still equal the original exported price.
  Persist DRAFT with exact old/new values, product/version IDs, source/config/mapping
  and policy hashes, original export receipt and actor.
- `POST .../approve`: `{operationId, previewHash, reference}`. Pin the exact preview
  hash, approving actor/time and 15-minute expiry. It performs **no write** and
  cannot renew an expired preview silently. A draft also expires after 15 minutes.
- `POST .../execute`: `{operationId, previewHash}`. Revalidate actor, source/settings,
  mapping, credential revision, policy and approval before dispatch. Re-read remote
  versions/prices, then atomically claim each item in the database before its one
  compare-and-set attempt. A conflicting operation cannot write a product with an
  unresolved DISPATCHING/UNKNOWN attempt in the same account.
- Repeated execute returns the stored non-APPROVED operation and never redispatches.
  Concurrent duplicate calls observe PREFLIGHT/DISPATCHING instead of duplicating
  a write. No network request runs inside a database transaction.
- After APPLIED acknowledgement, read back the **same applied version and price**.
  A later merchant edit, even with the same numeric price, cannot be appropriated
  as this operation's success or used as an automatic compensation baseline.
- Item states distinguish PENDING, DISPATCHING, SUCCEEDED, CONFLICT, FAILED, UNKNOWN
  and terminal reconciled outcomes. Operation states include DRAFT, APPROVED,
  PREFLIGHT, DISPATCHING, SUCCEEDED, PARTIAL, FAILED, UNKNOWN and RECONCILED.
  Explicit proven rejection/conflict differs from transport uncertainty.
- `GET .../<operationId>` reads the actor-owned bounded audit record without any
  transport or automatic retry. Another tenant/admin actor cannot obtain it by ID.

Every read/write reserves an account-quota attempt **before** network access.
A server-only `PriceAccessPolicy` pins source/connection revision, explicit
access/cost approval and canary references, account quota key, UTC reset window
and approved maximum read/write calls. Windows normalize to canonical UTC instants;
profiles/repeated operations share usage within the same tenant/account/window.
Original and reconciliation access-policy references/limits are frozen with
their audit records, not retained as an unresolvable hash alone.
Failed and unknown attempts still consume allowance; nothing is claimed free.

This request-count ledger is not an invoice or a monetary billing calculation.
Actual vendor pricing, paid allowances, account limits and any monetary budget
must be independently approved before activation; no dollar estimate is invented.
Policy renewal/keys must reflect genuine approved account allowances, not a way
to evade a shared provider quota. Production has no such policy installed.

Network calls are bounded to eight seconds each and never automatically retried.
Execution stops dispatching additional items when the conservative 40-second
request budget cannot cover the next write/read-back pair. Undispatched rows are
FAILED with an explicit reason; already completed writes are preserved. A hosting
interruption cannot roll back a remote write; persisted attempts drive recovery.

## Unknown outcomes, recovery and compensation

`POST .../reconcile`: `{operationId}` is an explicit read/recovery operation.
Wait at least 30 seconds after an uncertain attempt before reconciliation. It reads
current values **and terminal status of the reserved attempt**; matching/unchanged
current price alone never clears UNKNOWN or authorizes a retry. Unknown outcomes
retain product exclusion. Proven terminal APPLIED/NOT_APPLIED resolves the old
attempt without issuing another write; if a merchant's price now differs, retain
that observation and do not overwrite it.

Reconciliation targets the original account and frozen product IDs. It remains
possible after later imports, source-selection changes, mapping updates or approved
credential rotation, while verifying the same account/source and current approved
connection revision. Requiring the old financial cursor here would strand unknown
writes after a normal sync. The reconciler records the actor/time/access-policy
hash it used; it does not reuse that exception to authorize a new write.

A crashed PREFLIGHT or partially persisted batch can close undispatched rows with
explicit failure after the recovery wait. A DB failure after remote success leaves
the DISPATCHING reservation intact; execute replay cannot repeat it. Terminal
attempt evidence is required to resolve that reserved write. Future transports
must fence delayed/cancelled attempt IDs as described above.

For compensation, preview with `compensatesId: <original-operation-id>` and the
explicit successful SKU subset. If the original snapshot is stale, also provide
`currentSnapshotId` for a fresh same-account financial snapshot. Recheck current
own-stock merchandise/UAH identity and known unit cost; restoration below current
cost is blocked and requires a separate reviewed liquidation scenario. Only known SUCCEEDED items from an APPLY operation
with SUCCEEDED/PARTIAL state are eligible; ambiguous reconciled/unknown operations
require separate manual review/new evidence. The new preview reverses original
approved prices, requires the current remote version to equal the original write's
verified applied/read-back version and then needs **its own** approval/execute.
A later merchant edit or same-price new revision is a conflict. There is no
automatic rollback, reverse-write retry, deletion or compensation of compensation.

## Activation prerequisites (deferred)

- Verify exact native base-price, discount/currency and source-product semantics
  with sanitized real account examples, including variant identity and missing-ID
  behavior. Confirm that the target price is the intended customer-facing value.
- Approve a dedicated product-write credential and least permissions through a
  separately reviewed secret onboarding path. Do not reuse order/receipt keys
  merely because they work for read imports; do not put credentials in chat/audit.
- Resolve existing-only atomic concurrency, applied-version read-back and terminal
  attempt lookup/fencing with the provider/account. The prepared serializer alone
  is insufficient; unsupported semantics must keep execution disabled.
- Approve account-specific call/cost limits, reset policy, approved deployment
  identity and observability/recovery runbook. Test partial and unknown outcomes.
- Explicitly approve a tiny real-account canary, chosen SKUs/values/expiry, operator
  and compensating procedure before a live adapter is registered. This task and
  the parent's implementation request do not authorize that canary.

## Verification

Offline tests use isolated PGlite databases with production migrations and an
in-memory atomic existing-only transport. They never connect to production or
send a SalesDrive mutation. Cases cover exact decimals/field protection, disabled
production routes, signed owner/tenant boundaries, source mapping/credential changes,
remote price/version conflicts, missing/discounted/converted evidence, expiry and
preview hashes, duplicate/concurrent execution, unresolved product locks, partial
success, shared quotas, timeout after remote success, database settlement failure,
terminal recovery, read-back races and separate approved compensation.

No new tables, live migration, provider key, source write, cron or supplier message
is introduced.

Validation on 2026-10-29:

- `npm test -- --maxWorkers=2` — 145 files / 1,456 tests passed, including 30 new
  price-contract, lifecycle and production-disabled API checks.
- `npx tsc --noEmit` — exit 0.
- Production build — exit 0 with synthetic build-only JWT access/refresh values;
  no production `.env`, provider key or database connection was used.
- `git diff --check` — exit 0.
- Backend-only work; no UI/browser or real-account/canary verification was performed.
