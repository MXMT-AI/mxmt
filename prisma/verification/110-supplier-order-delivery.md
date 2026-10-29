# #110 — Supplier order delivery preparation

## Approved scope

The owner approved code and fake-transport checks, with live delivery deferred:
ADMIN preview → separate approve → separate send for **one supplier/currency
group**, approval valid for 15 minutes, recipient selected only from a verified
tenant catalog, no automatic resend after uncertainty, and separately approved
cancellation. No real delivery channel, recipient, account credential, provider
cost allowance or canary has been approved.

Branch: `feat/110-supplier-order-delivery`, based on main after merged PR #112.
No schema migration, scheduler, UI, provider credential or production transport
is introduced. The separate uncommitted #54 checkout is untouched.

## Exact export and recipient contracts

Reuse the existing audited SCENARIO_EXPORT_V1 reordering export. Select one original
file ID and its supplier/currency rows and totals; verify UTF-8 byte length, row
count and SHA-256 before approval and dispatch. Never regenerate CSV, recompute
prices/quantities, infer a supplier from a brand name, or accept caller-supplied
attachments, monetary totals, message text, provider endpoints or destinations.

The bounded preview includes the original file metadata/hash, actual SKU quantities,
MOQ, lead/cover days, verified in-transit basis, unit costs, purchase amounts and
group totals. It pins source/snapshot/selection/connection identity, original export
rows, current verified supplier terms, latest approved recipient revision, fixed
message text and server access-policy hash. Supplier terms saved in the calculation
must still equal the current verified supplier defaults; approving a new catalog
revision cannot legitimize a stale export. Explicit scenario overrides remain
visible in the exact audited rows. Groups are limited to 500 rows / 4 MiB UTF-8
attachments, with bounded 512 KiB operation metadata.

Recipients use inactive GENERAL configuration revisions, not source credentials:
`{version:1, supplierId, channelId, destinationId, label, currencies,
verificationReference, consentReference, validUntil}`.
The destination is an opaque identifier in an approved provider account, never a
guessed email or a URL accepted by the send endpoint. Mapping that identifier to a
verified real contact is a deferred onboarding/activation prerequisite. Saving
reference text does not verify it automatically: a separate owner approval attests
verification and consent, freezes supplier terms and stamps the revision.

A new draft immediately invalidates the previous revision for new sends. Expired
recipients, missing terms, wrong supplier/channel/currency, source changes, rotated
connection revisions, changed exported bytes/rows or expired action approval block
dispatch. Catalog edits have optimistic expectedRevision checks and tenant audit.

## APIs and lifecycle

All routes require a signed ADMIN/SUPER_ADMIN session; the store rechecks actual
tenant membership under the existing tenant transaction lock. Query overrides and
extra JSON keys are rejected. Responses are private/no-store. Credentials, customer
PII and raw provider response bodies are excluded from operation evidence.

Catalog:
- GET/POST `/api/merchandising/supplier-recipients/<recipientId>`: read latest
  revision or save `{expectedRevision, recipient}` as an inactive draft.
- POST `.../<recipientId>/approve`: `{configId, reference}`; approve that exact
  latest, unexpired tenant revision. This sends nothing.

Delivery under `/api/merchandising/supplier-delivery`:
- POST `/preview`: `{exportId, fileId, recipientId}`, no transport call.
- POST `/approve`: `{operationId, previewHash, reference}`, no delivery.
  A draft expires after 15 minutes; approval is valid for 15 minutes.
- POST `/send`: `{operationId, previewHash}`, only an explicitly approved,
  unchanged operation may claim a single dispatch attempt.
- POST `/reconcile`: `{operationId}`, explicit terminal-attempt lookup.
- GET `/<operationId>`: actor-owned stored audit; no lookup or send.
- POST `/cancellation/preview`: `{operationId, reason}`.
- POST `/cancellation/approve`: `{operationId, cancellationHash, reference}`.
- POST `/cancellation/execute`: `{operationId, cancellationHash}`.
- POST `/receipt`: `{operationId, executionId}`, link existing #108 verified
  RECEIVED evidence for the exact source/export/supplier/currency/SKU group.

DRAFT → APPROVED → DISPATCHING precedes one external send. Normalized proof then
produces SENT or ACKNOWLEDGED; a terminal fenced NOT_SENT produces FAILED.
Exceptions, timeouts, malformed evidence and generic HTTP success produce
DELIVERY_UNKNOWN. SENT/ACKNOWLEDGED never imply goods received. RECEIVED requires
#108's positive posted supplier-receipt evidence for every selected SKU. Its
coverage remains explicitly `POSITIVE_VERIFIED_LINES_NOT_FULL_ORDER_COMPLETION`;
a partial positive receipt is not a claim that all ordered quantities arrived.

No network request runs inside a database transaction. Tenant serialization claims
the group and persists its attempt ID/quota reservation before network access.
Repeated or concurrent send returns stored state; a competing operation cannot
send a dispatched/unknown group. Other supplier/currency groups remain independent,
so one group's unknown outcome never replays a successful group's delivery.

## Provider contract, quotas and recovery

Production routes inject neither transport nor access policy. Preview/approve/send,
recovery and cancellation return SUPPLIER_DELIVERY_DISABLED before provider access.
Read/catalog and verified receipt linking perform database work only.

A future server-injected provider must prove idempotent dispatch, honor approval
deadlines, return normalized evidence tied to the original destination and payload
hash, and support terminal lookup by durable attempt ID. NOT_SENT must fence late
delivery of that attempt; momentary absence from an inbox/cache is insufficient.
CANCELLED must prove business withdrawal/cancellation, not acceptance of a
cancellation request. Evidence for another delivery ID is rejected.

Each send, lookup and cancellation reserves an attempt against an explicit approved
tenant/account/window quota before calling the provider. Failures and uncertain
calls consume allowance. Audits retain operation/actual actor, destination, file
and payload hashes, attempt IDs, normalized outcomes, delivery IDs and original/current
access-policy references. Each settled attempt retains its own normalized evidence;
a later lookup does not erase the previous attempt proof. Shared reservation,
settlement and bounded-timeout infrastructure is reused by #109.

Call-count quotas are not monetary invoices. Pricing, recipient consent, handling
of supplier commercial terms and a real cost budget require separate approval.
Do not rotate quota keys/windows to evade an account's shared provider allowance.
Calls time out locally after at most 8 seconds; abort never proves non-delivery.

After an unknown or interrupted dispatch, wait at least 30 seconds and explicitly
reconcile the original attempt. DB failure after delivery leaves DISPATCHING;
replaying send does not retry. UNKNOWN retains group exclusion. Terminal proven
NOT_SENT allows a **new** preview/approval; the failed attempt is never replayed.
Known SENT/ACKNOWLEDGED cannot regress to NOT_SENT/UNKNOWN on inconsistent evidence.

Recovery targets the frozen original account/channel/source/destination, with a
current approved server policy; it does not require the old financial snapshot or
recipient revision to remain current. The same rule permits a separately approved
cancellation after normal data refresh. Cancellation pins the current policy as
well as the original delivery ID/payload and expires after 15 minutes. It cannot
reroute, change quantities, or serve as a new order. An uncertain cancellation has
its own attempt/lookup and never triggers an automatic second cancellation. A DB
rollback cannot unsend an order. Root CANCELLED requires confirmed provider proof.

Operations remain owned by their original actor. If that actor is unavailable,
another ADMIN cannot impersonate them, change actorId or clear exclusions. Before
live activation, separately approve and implement an operator-only incident
recovery procedure with a reviewer, exact tenant/account/attempt IDs, original
pre-state hash, durable terminal proof and an audit attributed to the actual
recovery ADMIN/operator. Preserve original approval/actor/payload and all
reservations; never resend or unlock on presumed worker death. No privileged
recovery updater or ADMIN bypass is shipped. This is an additional activation gate.

## Deferred live acceptance

Before registering a transport, approve and verify:
1. Delivery channel/provider/account and least-privilege secret onboarding.
2. Real supplier contact identity and consent, opaque destination mapping, terms,
   currency, attachment schema and message wording, including cancellation meaning.
3. Durable idempotency, late-call fencing, deadline enforcement, terminal lookup
   and proof that an acknowledged cancellation means actual withdrawal.
4. Account rate/cost allowances, data handling/retention and incident observability.
5. Operator-only recovery for an unavailable original actor, tested without bypassing
   original actor/approval identity or erasing unknown attempts.
6. A tiny explicitly approved supplier canary, operator, expected acknowledgement
   and cancellation/receipt acceptance runbook. No supplier may be contacted under
   the code-preparation approval alone.

## Verification

Tests use isolated PGlite with production migrations, synthetic recipient catalogs
and an in-memory provider; no supplier message or provider connection occurs.
Coverage includes tenant/role boundaries, forged recipients, exact export bytes,
expiry and stale terms/configuration, concurrent claims, partial supplier groups,
quotas, timeout after delivery, settlement failure, original-account recovery,
separate cancellation/timeout recovery and verified #108 receipt linking.
Backend-only change; UI/browser and real-account/canary checks are deferred.

Validation on 2026-10-29:
- `npm test -- --maxWorkers=2` — 147 files / 1,484 tests passed (26 new #110 checks).
- `./node_modules/.bin/tsc --noEmit` — exit 0.
- `npm run build` — exit 0 using synthetic build-only JWT values, no production env.
- `git diff --check` and whitespace checks for all new files — passed.
- No live provider calls, supplier contact, database migration or canary performed.
