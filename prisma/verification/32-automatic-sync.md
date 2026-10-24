# SalesDrive automatic sync, webhooks and manual refresh (#32)

## Decisions and boundary

Extends #30/#31 and the approved #27 D21 observation-time policy. Existing
Google Sheets import/report formulas and the 07:00 Kyiv cron entries remain
unchanged. This document supersedes #30/#31's one-unfinished-job admission rule:
multiple jobs may queue; only one leased writer per tenant/source can run.

The owner explicitly approved keeping SalesDrive financial formulas in #35–#37.
Every completed import atomically records an idempotent `ConnectorRecalculation`
intent in `WAITING_ENGINE`. This is not a completed financial calculation and does
not run the incompatible Sheets calculator. `inputProvenance` records the source
run, catalog run and orders watermark. These are ingestion boundaries, not a frozen
financial result; the new engine must resolve/version inputs before calculating.

## Schedule and Hobby deployment

Official hosting constraints: [Vercel cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing)
and [cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
Hobby cron runs at most daily with hourly precision. Do not add minute/hourly
expressions to `vercel.json` or silently replace existing Sheets jobs.

Invoke `GET /api/cron/salesdrive-sync` once per minute from a trusted external
scheduler with `Authorization: Bearer <CRON_SECRET>`. Each invocation:

1. Visits at most 25 connections, rotating by `lastScheduledAt`.
2. Persists one orders intent per two-hour UTC slot. Incremental reads overlap the
   successful watermark by two hours. Before the baseline finishes, live reads
   start two hours before the intent time; they do not claim historical coverage.
3. Persists one stock intent per Kyiv date at/after 03:00. Repeated autumn hours
   share a date key; a nonexistent spring 03:00 is caught after the clock jumps.
   Delayed ticks catch up only the current day, never fabricate earlier stock.
4. Dispatches one durable intent and processes one remote page/catalog observation.

Orders use fixed request windows. Stock retains the actual feed observation
instant and configured source timezone/business date, even when queued work starts
later than 03:00. Receipt/catalog stages and initial history can delay observation;
that delay is visible. This is not a historical 23:59 stock API.

For an existing trusted always-on Node host, an optional runner is included:

```sh
node scripts/salesdrive-sync-worker.mjs --help
# Configure SALESDRIVE_SYNC_ORIGIN and CRON_SECRET in that host's secret environment.
node scripts/salesdrive-sync-worker.mjs
# Or call --once from a host scheduler every minute.
```

The runner uses a plain HTTPS origin, a header secret, no redirects, a 55-second
timeout and sequential ticks. It logs status only. Do not put secrets in URLs or
commit environment values. The route has a 60-second budget, remote reads retain
the adapter's timeout, and database import transactions retain their 45-second
budget. Multiple trusted worker instances are safe but share provider budgets.
The 25-connection scheduler batch and one-step worker are bounded; monitor lag and
increase invocation capacity within account limits when tenant volume requires it.

No external scheduler was provisioned, secret deployed or live job invoked while
implementing this task. `lastTickAt` stays empty until the external tick is connected.

## Durable jobs, overlap and backfill

`ConnectorSyncCycle` persists the schedule/manual intent before job dispatch.
Stable per-cycle job keys recover a crash after creating only one of its jobs.
Schedule slots deduplicate per tenant/source. Manual retries join an unfinished
manual cycle; a completed cycle permits a new refresh even before the next poll.
Dispatch errors retain the intent with a sanitized code and exponential delay,
allowing other cycles to proceed. The current connection must still match its
expected source before any job is queued.

Job claims lock the current connection row with `SKIP LOCKED`. A partial unique
index permits one `RUNNING` job per source. An unexpired lease blocks another
writer across order/inventory workers; expired work is reclaimed first. Lease
tokens, expiry and connection revision are checked again before committing pages.
Workers yield after each page. Routine jobs precede backfill, and jobs of the same
priority rotate by their last update. Paused/failed history remains recoverable
without blocking newer live jobs or hiding its own progress.

Backfill transport uses 80% of each shared account request window. The remaining
headroom is available to routine work, not an extra quota. Provider 429 blocks
remain account-wide. Existing limits, reservations and Retry-After behavior apply
to connection checks, webhooks, orders, receipts and YML. At 200 queued/running/retry
jobs a source stops accepting more jobs; dispatch/delivery retries remain durable.
No worker sleeps inside a request or recursively drains history.

## Webhooks

Provider reference: [SalesDrive webhooks](https://salesdrive.ua/knowledge/webhook/).
Documented events include `new_order` and `status_change` with account identity and
order ID. Published documentation does not establish a native signature or
configurable Authorization header. The existing receiver therefore remains a
trusted relay endpoint, not an anonymous native webhook or a fabricated signature
check. Do not configure an unauthenticated direct provider delivery to this route.

The trusted relay must authenticate incoming provider delivery using independently
verified account capabilities/controls, durably store/retry it, and forward to
`POST /api/webhooks/salesdrive/<sourceId>` with the existing source-scoped HMAC-derived
bearer token. Never put that token in a URL. Missing relay secret disables access.
Token setup/relay deployment remains an activation prerequisite; no native webhook
or relay was registered during this task.

The receiver validates account, event and lossless scalar order ID, stores the
payload and enqueues a refetch before acknowledging `202`. An identical event
returns the same job. Distinct events queue behind an active writer instead of
being dropped as busy. Capacity/storage errors return retryable `503`, not a false
acknowledgment. Source versions and order identities prevent duplicate facts on
refetch/replay. Only verified API reads populate order data.

## Manual refresh, visibility and recalculation

`/api/connectors/salesdrive/sync` reuses the existing JWT/RBAC and bounded action
handler. Authenticated readers can inspect progress. ADMIN/SUPER_ADMIN may request
`refresh`, `step`, `resume` or `resumeBackfill`; tenant identity always comes from the signed session.

Refresh queues both current orders and inventory and returns a cycle ID. Completion
means both named jobs reached `COMPLETE`; queued/running/failed imports cannot
produce a successful cycle result. The displayed manual cycle remains traceable
when newer automatic cycles arrive. Resume targets only failed/paused jobs of that
cycle. A separate historical-resume action targets backfill even when newer routine jobs exist.
Individual import controls remain available for history and diagnostics.

The reused Settings card shows cycle ID/completion time, scheduler heartbeat,
last successful imports, watermark lag, pending counts, sanitized error guidance,
and separate historical import progress. Imported data and financial readiness are
separate: `WAITING_ENGINE` is explicitly shown, per the approved #35–#37 split.
Read failures do not replace cached progress with a false successful result.

Catalog activation remains atomic after whole-feed validation. Failed pages and
malformed feeds preserve checkpoints/previous catalog. Receipt quarantine from
CodeRabbit review of #31 is carried in this branch: invalid document lines retain
raw evidence and a warning while unrelated receipts/catalog work continues.

## Verification and release

Tests replay migrations and production SQL in isolated PostgreSQL/PGlite. They
cover schedule idempotency, DST, manual completion IDs, dispatch recovery, source
leases, live-before-baseline import, webhook queueing/deduplication, backfill quota
headroom, per-cycle recovery, recalculation intents and tenant isolation. Existing
10,000-order/catalog, rollback, budget, JWT and provider contract tests remain.
API tests cover forged identity, reader/write RBAC, no-store, inherited action names,
secret-only cron access and sanitized failure responses.

Apply the versioned migration in an isolated environment first. Drain/stop old
workers during rollout: old code assumes one unfinished source job. Rollback of
the old unique index is unsafe once multiple unfinished jobs exist; use a reviewed
forward fix/restore rather than dropping queued work. No production schema/data
was modified. The existing customer evidence gates E01–E03 still apply before
financial activation.

Local validation (2026-10-24):

- `npm test`: 38 files, 318 tests passed.
- Focused final sync/recovery API and SQL checks: 15 tests passed.
- `npx prisma validate`, `npx tsc --noEmit`, `git diff --check`: passed.
- `npm run build`: passed.
- Migration matches generated Prisma SQL plus explicit queue/check constraints.
- Actual component/synthetic browser checks: Ukrainian light, English dark,
  320 px, read-only permissions, queued refresh, cycle resume and independent
  backfill recovery control. No live customer account or production worker used.
