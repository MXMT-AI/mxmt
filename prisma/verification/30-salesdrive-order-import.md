# SalesDrive order history and incremental ingestion (#30)

## Contract and implementation

The existing read-only connector, encrypted connection storage, tenant/RBAC,
`DataImportRun`, `DataSourceRecord`, `OrderLine`, `SyncCursor`, `ImportIssue` and
source-scoped `SkuAlias` are reused. Google Sheets and calculation activation are
unchanged. New tables provide durable jobs, order-level version guards (including
zero-line orders) and an account-wide rolling request budget.

Official [SalesDrive OpenAPI](https://api.salesdrive.me/swagger/openapi-uk.php)
rechecked October 24, 2026: SHA-256
`44a6c30a2aaa466cbf7cdf5cb0225a0ad3b1c7cabacaa5a907bad1114653110e`.
Only documented GET endpoints/filters are used: page/limit (100 maximum),
`filter[orderTime][from/to]`, `filter[updateAt][from/to]`, `filter[id][from/to]`,
`filter[statusId]=__ALL__` and `/api/statuses/`. No source sorting or snapshot
is invented. `sajt` metadata is retained as a dictionary with its verification
status; numeric channel codes are source facts, never global business constants.

A backfill fixes its end instant at enqueue and begins two calendar years earlier
in the source timezone. Dictionary stages and each order page run in separate
worker invocations. Incremental import requires a completed baseline cursor and
starts two hours before the previous successful window end. The overlap covers
normal Kyiv DST repetition and boundary precision; source timezone still needs
account verification. A watermark advances only after the final page transaction
marks the run `SUCCESS`/`WARNING`. A later historical replay cannot move it back.
Webhook jobs refetch exactly one order and never advance the bulk cursor.

`ConnectorSyncJob` stores page/window/policy, counters, attempts, next availability
and lease identity. PostgreSQL `SKIP LOCKED` claims one job, with a two-minute
lease. The worker performs at most one remote page per request. Raw payloads,
normalized current lines, version state, issues and checkpoint commit atomically
under a still-owned, unexpired lease and current connection revision. Database
work has a 45-second transaction deadline within the 60-second route budget.
Expired workers cannot commit or clear another worker's lease. Credential rotation
pauses the job; explicit resume preserves its checkpoint. Authentication failures
pause immediately; other errors back off exponentially with jitter, failing after
eight consecutive attempts. Rate limits remain retryable, using persisted delay
rather than sleeping in a function. Failed/paused runs are marked failed without
advancing the cursor and can be resumed. Job/state provenance is excluded from
legacy import pruning.

## Raw data, identity and financial safety

Original API response text is retained as `order-pages`, preserving numeric
literals and metadata for audit. Parsed order JSON is retained privately per
run/order/content hash, including
all original prices, discounts, costs, payments and statuses. Accepted relay events
are retained separately as `order-webhooks`. No raw payload or credentials leave
server storage in progress responses or errors. Production retention/access policy
for customer PII must be configured by the operator; this change adds no automatic
raw-data deletion.

Current order lines are replaced together, not appended per page/event. Native
line IDs are used when available; otherwise `position:N` is explicitly marked as
derived and diagnosed. Reordering/removing products therefore does not accumulate
duplicate lines. This is a current-state projection, not a fabricated partial-refund
ledger. Historical source versions remain in raw storage. Native event/partial
refund identity still needs E02 evidence before a financial event ledger can be
activated.

Order versions take precedence over source update timestamps. Replayed identical
payloads are no-ops; older versions are retained raw without replacing current
facts. Conflicting equal versions or incomparable updates are quarantined. Invalid
quantities/precision quarantine the whole order, preserving the previous good
projection. Approved policy or SKU alias changes allow a historical replay to
reproject unchanged source JSON. Existing source-scoped product/SKU aliases are
resolved; conflicting or absent aliases stay null with diagnostics.

JSON numeric tokens are parsed losslessly (safe integer IDs stay numbers; decimal
and large numeric tokens stay exact strings). The original response text remains
the authoritative JSON representation, including numeric types/formatting.
Source money and quantity strings are retained; financial arithmetic uses decimal
values, never binary float calculations. `sourceAmounts` retains unit price/cost,
discount/commission amount and their unit flags even when financial inclusion is
unknown. Net revenue and extended cost remain null until approved configuration
verifies their semantics. A net source price is not discounted a second time.
Commission flags do not imply ownership or a supplier commission rate.

Strict Temporal parsing rejects nonexistent/ambiguous local timestamps. Date-only
payment values carry `datePrecision.paidAt = "date"`; their persisted day boundary
must not be interpreted as an observed payment time. Missing payment dates stay
null. Returns never derive a return date from generic `updateAt`; `returnedAt`
remains null and is diagnosed. No fallback date or second financial event is invented.

## Approved source configuration

No customer channel or amount mapping is seeded or activated. Use an approved,
active `MerchandisingConfig` of type `SOURCE_MAPPING`, key
`salesdrive:<sourceId>`, with an approval timestamp. Its values are snapshotted at
enqueue. Example shape, **not evidence or an activation instruction**:

```json
{
  "statuses": { "5": "SALE", "59": "SALE", "60": "SALE", "7": "RETURN", "6": "REFUSAL", "33": "PREORDER" },
  "channels": { "38": "Customer-verified channel name" },
  "amounts": { "price": "gross_unit", "absoluteDiscount": "line", "currency": "UAH", "cost": "unit" }
}
```

Apply approved #27 decisions, then verify the IDs against actual account statuses.
Configure Zavod channel IDs 38/79/78/88/94/68 only after their customer-specific
names are verified. Omit `amounts` until gross/net and discount basis are verified;
`price` can be `gross_unit` or `net_unit`, `absoluteDiscount` can be `line` or
`unit`. Omit `cost` until the API cost is verified as per-unit. Unknown status,
channel, revenue, cost, date and SKU mappings stay explicit diagnostics. After
changing policy/aliases, rerun history to reproject previously unchanged orders.
No report calculation or new metric profile is activated by this ingestion.

## Shared request limits

All application-created connector transports (onboarding probes, backfill,
incremental and webhook refetch) reserve from the same PostgreSQL budget keyed by
canonical account hostname hash, including when tenants reference the same account.
Row locks serialize rolling reservations: 10/minute, 100/hour, 1,000/day. A failed
network request conservatively consumes its reservation. Local exhaustion defers
to the relevant window boundary. Remote 429 `Retry-After` (seconds or HTTP-date)
sets an account-wide cooldown; invalid values default to one minute. Remote delays
are bounded to one day. No request bypasses a known cooldown.

These are conservative specification limits, **not measured account quotas**.
E02 still requires account quota/scope/timezone verification, including other API
clients outside this application. Do not raise limits without that evidence.

## API and operations

- `GET /api/connectors/salesdrive/import`: authenticated tenant progress, counters,
  fixed error codes and deduplicated warning codes only.
- `POST` on the same route: ADMIN/SUPER_ADMIN actions `backfill`, `incremental`,
  `resume`, `step`. Caller-supplied tenant/source IDs are ignored. `step` performs
  one bounded page; it is a manual recovery aid, not a whole backfill request.
- `GET /api/cron/salesdrive-orders`: `Authorization: Bearer <CRON_SECRET>`, one
  available job step across all tenants. Overlapping scheduler calls are safe.
- Settings displays localized progress, warnings, retry time, recovery actions and
  read-only viewer state. Polling occurs only while work is pending/running/retrying.
  Counters count observations; duplicate/stale/quarantined counts explain replays.

Apply the migration on an isolated branch first, then the normal reviewed production
migration workflow. Neither production migration nor a live account import was run
while implementing this task. Configure `CONNECTOR_ENCRYPTION_KEY`, save the account,
verify its timezone/scopes, and configure `CRON_SECRET` before activation.

`vercel.json` adds a once-per-minute worker cron. This requires Vercel Pro/Enterprise;
[Vercel Hobby rejects subdaily cron expressions at deployment](https://vercel.com/docs/cron-jobs/usage-and-pricing).
Confirm the deployment plan before pushing/deploying. If the project uses Hobby,
remove that cron entry and configure an external scheduler to call the same protected
endpoint once per minute; the worker itself is hosting-independent. No hosting plan
was changed or purchased. An idle worker does not fetch SalesDrive. Automatic
recurring **enqueue** policy/tenant schedules remain #32; this cron drains queued
backfill/incremental/webhook jobs only.

## Webhook relay boundary

`POST /api/webhooks/salesdrive/<sourceId>` is exempt only from browser-cookie
middleware; the Node route requires a per-source bearer token derived by
`salesDriveWebhookToken(sourceId)` from server-only `SALESDRIVE_WEBHOOK_SECRET`
(minimum 32 bytes). Tokens never appear in URLs, Settings, progress or logs. Provision
the token through trusted operator tooling to the relay, not client JavaScript.
Requests are limited to 256 KiB, verify account identity and documented order event
shape, and enqueue an exact-ID **API refetch** rather than trusting event money.
Repeated event content maps to the same durable job. Another active source job
returns 503/Retry-After rather than acknowledging and dropping an event; the relay
must durably retry until accepted (including during a long backfill). Completed
replays return 202 without a new job or duplicate lines.

The public schema does not document a native authenticated webhook header or a
signature. This is **our authenticated relay contract**, not an assertion of native
SalesDrive HMAC support. Verify native header support or provision a trusted relay
before enabling delivery. Never expose an unauthenticated CRM callback as trusted
financial input. No customer webhook was registered in this change.

## Verification and remaining evidence

Automated tests replay the full migration history in isolated PostgreSQL/PGlite and
exercise real production SQL: raw/projection atomic rollback, cross-tenant FKs,
status/return updates, zero-line tombstones, replay/stale/conflict handling, mapping
reprojection, interrupted-page retries, credential pause/resume, stolen-lease fencing,
completed-run cursor gates, webhook deduplication, all quota windows and shared 429
cooldown. A 10,000-order fixture runs 100 pages plus two dictionary reads with a
virtual one-request-per-minute budget; it does not sleep or make real network calls.
API tests cover cookie/RBAC, spoofed tenant headers, body limits, safe errors, cron
secrets and per-source relay authorization.

Browser checks use the actual component with synthetic responses: English/light,
Ukrainian/dark, 390 px and 320 px layouts, warnings disclosure, resume, read-only
viewer and HTTP 503 handling. No customer data or production browser import was
used. Layout follows existing Settings tokens/components; UI skills and DRY applied.

The source does not promise snapshot-stable pagination. Fixed windows, overlap and
idempotent replays reduce drift but cannot prove an immutable historical snapshot.
Every bulk run records `SOURCE_PAGINATION_NOT_SNAPSHOT`. Before activation, compare
source order counts/IDs and monetary totals with an approved frozen customer export;
replay history after the source window settles if pages changed during ingestion.
E01 frozen benchmark and E02/E03 customer payloads, account quota/timezone, stable
line/refund identity, return dates and approved mappings remain explicit activation
gates from #27/#29. A completed ingestion job is not approval of financial reporting.

Final local checks (October 24, 2026):

- `npm test`: 34 files, 271 tests passed, including the 10,000-order scenario.
- `npx tsc --noEmit`: passed.
- `npx prisma validate`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Generated Prisma schema-diff SQL matches the migration; additional partial-index
  and state/mode constraints are preserved explicitly.
