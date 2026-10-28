# #98 — Sourced external market-trend evidence

## Owner decision and delivery scope

On 2026-10-28 the owner chose **prepare the mechanism now; source selection and
activation later**. No supplier, license, subscription, actual source profile or
credentials are installed. Production has an empty server adapter registry.
The evidence API cannot accept a client transport URL or inject an adapter.
All examples and test observations are synthetic, not live market findings.

This task provides source-neutral policy, approval, retained evidence, bounded
lookups, source cost accounting and offline checks. Actual provider integration,
license/access/price approval and business relevance evaluation remain deferred.
They are required before registration of a live adapter. Applicable business
acceptance remains #92; this preparation does not approve customer thresholds.

## Versioned policy and ownership

- `POST /api/merchandising/market-sources/<profileId>` saves a draft with
  `{expectedRevision, policy}`; ADMIN/SUPER_ADMIN membership is required.
- `GET` on that path reads the signed tenant's latest policy for ANALYST or above.
- `POST .../<profileId>/approve` requires the current `configId` and a nonempty
  `approvalReference`, and rechecks rights, budget dates and optional mapping.
- A later draft immediately blocks lookups until its own approval. Neither saving
  nor approving registers a transport, pays a subscription or makes a source call.

The exact policy contract is `MarketPolicy` in `lib/market-evidence.ts`; a complete
synthetic policy is in `tests/fixtures/market-evidence.ts`. It records source name
and canonical HTTPS citation origin, adapter identifier, internal selected source,
ISO country and exact category mapping; optional physical attributes pin an
approved #97 dictionary revision, dimension and value. Country codes are exact
scope identifiers here; no geographic aggregation or translation is inferred.

The owner must explicitly record the license/access reference, ingest/retain/display
permissions, redistribution policy and rights dates; refresh/max-age/retention
hours; metric name, unit, currency and normalization **definition reference**;
source budget/account key, UTC period, fixed subscription exposure, maximum
per-request charge, total monetary cap and request cap; and a relevance rubric.
The metric definition must document the provider's sampling/aggregation and base
period. `relative_index` is bounded 0–100 and is not comparable across arbitrary
provider queries. No currency conversion or cross-scope normalization is inferred.

Budgets for the same tenant/account key and overlapping periods must be identical,
including pricing and caps. Profile revisions and different geographic/category
profiles sharing that key do not reset usage or duplicate subscription exposure
within the same budget. An owner must reuse the same key for a shared provider
account. Use a distinct period only for a genuinely new approved allowance.

## Lookup and evidence contract

`POST /api/merchandising/market-evidence` requires ANALYST or above, a signed
session, current database membership and the exact body:

```json
{
  "profileId": "market",
  "snapshotId": "saved-mvp-snapshot-id",
  "requestKey": "unique-lookup-key",
  "refresh": false,
  "geography": "UA",
  "categoryId": "category-id",
  "from": "2026-09-01",
  "to": "2026-09-30"
}
```

The source must match the selected internal source, current MVP snapshot,
publication versions/settings and exact requested period/category. Reuse of the
bounded #96 envelope validator avoids recalculating financial summaries. Scopes
above 5,000 saved SKU rows are rejected before external dispatch. Request period
is at most 366 inclusive dates. All API responses carrying evidence are no-store.

An available response separates `externalEvidence`, `internalSales` (a link to
the saved internal sales report) and `hypotheses` (empty). Its receipt pins source
URL/name, publication and retrieval times, cache expiry and hard retention,
geography/category/period, metric definition, policy revision/rights reference,
redistribution, optional attribute mapping and the versioned internal MVP envelope.
Observations and a descriptive endpoint change are retained together; nulls are
not imputed, an all-null series is unavailable, and `coverage: source_points_only`
does not claim daily completeness. No hypothesis text, causal conclusion or
sales-uplift estimate is generated. `forecastInput` is always false.

Missing configuration/approval/adapter/rights/data/quota, incompatible scope,
stale context or evidence, and failed upstream validation produce an explicit
`status: unavailable`, `reason` and `externalEvidence: null`. These business
states do not fabricate a trend. Authentication and malformed API requests retain
HTTP errors; unexpected storage faults return a sanitized 503.

## Adapter boundary, cache and source costs

`MarketSourceAdapter.read` is an injectable server contract for offline tests and
a future reviewed provider. No provider transport is implemented or registered.
A future adapter must use fixed trusted endpoints/credentials, enforce input and
response byte limits before parsing, honor the abort signal and use the approved
provider's maximum charge/call. It must return a bounded normalized observation,
not provider instructions or arbitrary prose. Citation URLs are identity only;
the framework never fetches them. Same-origin canonical HTTPS citations are
required; credentials, query strings and fragments are rejected.

Validation requires exact geography, external category/attribute, period and
metric definition; valid publication/point dates, unique dates, nonnegative
values, integer counts, index bounds and at most 366 points / 64 KiB normalized
JSON. Provider extra fields and instruction payloads are rejected. This framework
contains no LLM summary call; adding one later must use #93's independent AI
policy and budget, with evidence treated as data.

Tenant-locked reservation records a source request before dispatch. At most one
call is dispatched for an actor/context/request key. A fresh compatible cache is
used even with `refresh: true`; only stale/missing evidence may dispatch a new
call. `refresh: false` never dispatches. There are no automatic provider retries,
source polling jobs or background refreshes.

Independent `MARKET_REQUEST` receipts track count and actual reported request
charge, or reserve the full approved maximum when usage is unknown. Subscription
amount is **approved budget exposure**, not proof that a subscription was bought.
The cap includes fixed subscription exposure, settled requests and all in-flight
maximum charges. Invalid currency/usage and failed calls do not release unknown
charges. Reported overruns are recorded in full and make the lookup unavailable.
These rows never debit an AI token ledger or alter financial/classification data.
The timeout is at most 15 seconds; transport abort support is an adapter obligation.

Owner-only `POST /api/merchandising/market-sources/requests/<requestKey>/recover`
settles a STARTED request older than five minutes conservatively at its reserved
maximum. It never replays a provider call or restores quota. Investigate the
provider's billing separately; the recovery response does not prove cancellation.

## Retention and deployment

Apply `20261028230000_market_evidence_indexes` before release. It only adds
partial cache, quota and expiry indexes on existing audit rows; no new tables or
customer configurations are populated. Development checks execute migrations in
isolated PGlite databases. No live migration, source request or purchase was run.

Lookups purge expired normalized values for their tenant. The existing authenticated
04/05 UTC data-import cron also purges globally, before the Kyiv import-window or
Google Sheets configuration check; no additional Hobby cron is added. Unauthenticated
requests cannot purge. Cleanup failure returns a sanitized 500 for operational
alerting. Cleanup never fetches external data.

A record's read expiry is the earliest of refresh cadence, source publication
max-age, and hard retention minus a 24-hour cleanup margin. Hard retention is the
earlier of retrieval plus licensed retention or license end. Policies require at
least 48-hour retention; ingestion/display stops at least 24 hours before license
end. Expired values are replaced with `{purged: true}`; only the non-value receipt,
policy and usage metadata remain for audit. Purging is idempotent.

Before real activation, verify cron execution/alerting and that daily cleanup plus
the margin meets the actual license, including outages, backups and audit-metadata
retention. Shorter/stricter erasure requirements need a revised cleanup design.
The mechanism cannot promise timely erasure while the deployed scheduler is down.

## Business activation checklist (deferred)

1. Choose the actual source/API and demonstrate access with no credentials in chat
   or policy records; review allowed caching, retention, audit metadata and redistribution.
2. Approve price, hard call-cost bound, shared account quota key/period, update cadence,
   geography/category, metric definition/base period, and any real #97 mapping.
3. Implement/review the provider adapter and its transport, rate/size/timeout behavior;
   register it only after commercial and source approval.
4. Evaluate the explicit relevance rubric on retained real examples with a reviewer:
   correct source/date/scope, sufficient coverage, meaning of the normalized metric,
   freshness, whether the observation is actionable, and any limitations. Record
   acceptance or rejection; correlation remains distinct from causation.
5. Verify production retention operations and business acceptance under #92 before
   presenting a live trend to users. Source selection/activation is not approved here.

## Verification

- Targeted offline tests cover policy/DTO validation, signed API roles, tenant isolation,
  exact scope/current context, shared immutable quotas, reservation/idempotency,
  stale/missing/hostile/wrongly mapped data, provider failure/timeout, incurred costs,
  conservative recovery, cache reuse and physical retention cleanup.
- `npm test -- --maxWorkers=2` — 136 files / 1,370 tests passed, including 34 new
  market-evidence checks.
- `npx tsc --noEmit` and `npm run build` — exit 0.
- `git diff --check` — exit 0. No real provider relevance evaluation was run.
