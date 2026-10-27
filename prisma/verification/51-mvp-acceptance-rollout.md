# MVP acceptance and production rollout (#51)

Baseline: `5d18e59` (`main`, merged #79). Prepared October 27, 2026.
Authority: [approved D01–D22 decisions](../../docs/mvp-business-decisions.md),
[Stage 1 evidence contract](38-zavod-reconciliation.md), issues #26 and #51.

Owner confirmed on October 27 that the approved benchmark package and UAT sign-offs
are not yet available: current scope is checks and the acceptance handoff package.

**Release status: NOT READY — customer reconciliation, UAT and live operations
verification remain open.** Automated synthetic verification is separate from
customer acceptance. This task does not authorize a production deployment.
Do not close #38 or #51 on the strength of passing tests or a merged preparation PR.
V2 features do not block MVP.

## Five readiness criteria

| Criterion | Repeatable technical evidence | Required live/customer evidence | Current status |
| --- | --- | --- | --- |
| Daily Zavod sync | Scheduler/worker integration, account budgets, recovery, DST and webhook tests; bounded external minute worker | Authorized Zavod connection/mappings, running external worker, completed daily observation with actual timestamp, monitored watermark/queue | Local contracts pass; live proof pending |
| September 2026 revenue/GP/stock within inclusive ±1% | Existing private `reconcile:zavod` tool checks exact frozen versions, scope, coverage and approvals | Confirmed source/channel/stock scope, complete sales/daily/settings artifacts, old and alternative SKU populations, verified discrepancy explanation and #38 approvals | BLOCKED |
| Clickable KPI/detail equality | New incremental-sync journey plus existing Overview/Sales/Stock drill-down tests; one snapshot/settings/version per comparison | Sasha/Olia review of actual filters, KPI links, currencies, partial history and customer figures | Synthetic proof passes; UAT pending |
| Repricing and supplier Reordering CSV | Actual calculators and stored BOM/semicolon CSV files, retry-safe audit/downloads, RBAC and foreign-tenant denial | Customer-selected scenarios, exact prices/quantities, supplier/currency files, history and final download acceptance | Synthetic proof passes; UAT pending |
| Configuration-only Bimba onboarding | #50 mono profile/primary brand/settings and two-tenant tests; no client-specific code | Bimba account, independently approved mappings/terms, secure credentials, imports and owner acceptance | Code prepared; live connection deferred by owner |

## Reproduce local verification

Use the lockfile and the repository's pinned toolchain (currently Prisma 5).
Do not apply newer Prisma migration commands or upgrade the stack as part of rollout.

```sh
npm ci
npx prisma validate
npm run test:mvp
npm test -- --maxWorkers=2
npm run build
npx tsc --noEmit
git diff --check
```

`test:mvp` selects the existing ingestion, financial/daily/classification, screen,
scenario, Data Quality, product normalization, isolation, scheduler and reconciliation suites plus the new acceptance
journey. It uses synthetic fixtures and in-memory PostgreSQL/PGlite, not `.env`
database credentials, external CRM accounts or production migrations.
`npm ci` is the clean checkout installation step; a local run with already
installed lockfile dependencies must not be described as a new clean installation.

The journey in `tests/lib/mvp-acceptance.test.ts` reuses the two-tenant #50 baseline,
checks the actual SalesDrive adapter with synthetic HTTP responses, then exercises
the production manual order cycle and incremental worker. It drains the daily/sales
consumer, freezes a new screen snapshot, checks the exact revenue change and
unchanged old snapshot, follows Sales/Stock drill-down URLs, and exports both
scenarios with idempotent history and foreign-tenant download denial. This is a
service integration test, not a browser E2E run or proof of live account provisioning.
Initial history/catalog/receipt imports, budgets/429, replay, webhook delivery,
leases, empty history, incomplete coverage and authentication are covered by the
selected existing suites; their setup is not duplicated into a second pipeline.

Compare **identical populations**, not merely the same currency and snapshot:
Repricing defaults to stocked DEAD candidates; Reordering defaults to the shortage
union. Compare those with the matching Stock classification/SKU set. A whole-stock
headline is not expected to equal a candidate-only action table. Channels affect
sales, while shared stock remains all-channel. Keep missing costs/history/transit
unknown; never force a comparison by filling them with zero or rounding first.

## Queue interleaving defect found during acceptance

The full orders/receipts cycle exposed the legacy unique index
`DataImportRun_sourceId_running_key`: an order page yielded its connector lease
while retaining a `RUNNING` import run. The scheduler then correctly selected the
receipt job, but its run update collided with that index. This was reproducible
with both configured scopes and a receipt stage; catalog-only smoke tests missed it.

Both connector workers now persist unfinished yielded runs as `PENDING`, while
`ConnectorSyncJob` retains durable progress/lease/retry state. Terminal import
outcomes are unchanged; completed inputs alone publish recalculation intents.
An older retained RUNNING run returns to PENDING when its next page is processed;
other resource pages can already proceed because they no longer persist RUNNING
between leases. No jobs/checkpoints are deleted and the legacy Sheets uniqueness
constraint remains unchanged. Other tenants/sources and terminal runs are untouched.
No migration is added. Stop old workers before deployment as already required.

The empty-catalog/receipt acceptance case verifies the complete manual cycle and
both recalculation phases, PENDING on yield, retained pre-upgrade RUNNING recovery,
no retries/errors, unavailable history/availability and blocked empty exports.

## Private Zavod reconciliation handoff

The existing configured source workbook is the Zavod source identified by the
owner. Do not upload its contents or generated reports to GitHub.

```sh
npm run reconcile:zavod -- .local/reconciliation/zavod-september-2026/manifest.json --out .local/reconciliation/zavod-september-2026/51-readiness-report.json
```

Latest execution: exit **2**, `status=BLOCKED`, `numericStatus=BLOCKED`, 26 blockers.
The report is private and ignored. The public specification URL was inaccessible
to the web reader during #51; use the retained #27/#38 decisions and evidence
contract, and recheck the source specification with reviewers during UAT.

Resolve the underlying evidence, not the report output:

1. Owner confirms exact September 2026/2025 periods, channel identities/exclusions,
   UAH accounting scope and a genuine dated stock observation. Current stock is
   not a historical month-end observation.
2. Supply complete frozen sales, daily rows and consumed settings; bind immutable
   source/config/calculation IDs and file SHA-256 values under #38's contract.
   Partial GP or incomplete history cannot satisfy a numerical tolerance.
3. Supply both historical classifier SKU sets and rule definitions. Review the
   old→new transition and separately explain the alternative dead-stock example
   from actual populations/valuation. No explanation is inferred from rounded totals.
4. Record SOURCE_DATA/OWNER, BENCHMARKS/OWNER, THRESHOLDS/SASHA,
   THRESHOLDS/OLIA and CLASSIFICATION_REVIEW/SASHA approvals against the current
   report fingerprint. Policy approval in #27 is not these approvals.
5. Rerun until evidence, numeric checks and approvals pass. Retain restricted
   evidence links and reviewer identity; a handwritten PASS is not a replacement.

## UAT session and sign-off

Run on an isolated preview/staging environment with approved data and real signed
sessions. Use a separate viewer and a second tenant. Never paste API keys into
chat, tickets, screenshots or acceptance records. Preserve the existing navigation,
shared components and styling; assess the five workspaces against the source
reference, including empty/loading/error states, UA/EN, desktop/mobile, keyboard
focus, labels, reduced motion and readable partial-data warnings.

| UAT case | Review and record | Reviewer/result |
| --- | --- | --- |
| U01 Connect and refresh | ADMIN stores credentials in Settings, checks scopes/dictionaries, starts refresh; viewer cannot write. Import completion and financial completion are distinct. | Owner + Sasha/Olia — PENDING |
| U02 Synchronization | Initial history, incremental change, replay and failed-job recovery; duplicate deliveries do not duplicate totals. Show actual observation/watermark and incomplete history. | Operator + Sasha/Olia — PENDING |
| U03 Overview → Sales | Fix date/channel/currency/snapshot; follow revenue/GP/order/category links. Verify identical underlying totals, LY scope and known/unavailable values. | Sasha/Olia — PENDING |
| U04 Overview → Stock | Follow dead/risk/availability/category SKU details; compare candidate sets and valuations with frozen versions; channel changes leave stock unchanged. | Sasha/Olia — PENDING |
| U05 Repricing | Select scope, sliders and manual prices; validate cost protection/liquidation, invalid input and reset rules. Download BOM/semicolon CSV and reconcile selected eligible rows. | Sasha/Olia — PENDING |
| U06 Reordering | Confirm transit, supplier terms, MOQ/lead/cover overrides; unknown transit blocks export. Download separate supplier/currency files, positive quantities only; match preview and history. | Sasha/Olia — PENDING |
| U07 Isolation | Viewer/analyst permissions; second tenant cannot access snapshots, scenario inputs, exports, history or job recovery, even with forged identity headers. | Owner/operator — PENDING |
| U08 Bimba | Follow #50 checklist using configuration only; category/SKU views, independent settings and supplier exports; verify Zavod remains unchanged. | Bimba owner — PENDING (connection deferred) |
| U09 Resilience and UI | Failed provider read, exhausted budget, partial/empty history, stale snapshot refresh, old links, UA/EN and narrow-screen keyboard flows. | Sasha/Olia — PENDING |

For each result, keep a restricted record of case ID, tester, UTC timestamp,
release SHA/deployment/environment, tenant/source (no secrets), screen snapshot,
settings and sales/daily calculation IDs, selected filters, evidence link, outcome
and defect/waiver reference. Record fixes and retest results on the same release.
Sasha and Olia each sign the final UAT record; owner records the go/no-go and any
explicitly accepted residual issue. A new data/config/release revision requires
review of the affected evidence, not reuse of a stale signature.

## Ordered release checklist

All environment mutations below are **operator steps pending execution and
explicit deployment authorization**. No production/staging database or external
scheduler was changed by this task.

| Step | Action and exit criterion | Evidence/status |
| --- | --- | --- |
| R01 Freeze candidate | Record release SHA, PR, lockfile and test/build logs; compare to the deployed SHA. Check actual Vercel deployment state rather than assuming a merge deployed successfully. | PENDING |
| R02 Inventory environment | Record Vercel project/production branch/domain, Neon project/branch/database, runtime versions, existing migrations, request limits, backup/restore retention and named operator. | PENDING |
| R03 Isolate rehearsal | Create a Neon staging branch from an authorized restore point, record its identity, and bind a preview only to its own pooled `DATABASE_URL` and direct `DIRECT_URL`. Disable external writers/cron/relay for the rehearsal. | PENDING |
| R04 Migrate staging | Inspect `_prisma_migrations` with the pinned Prisma CLI and rehearse `npm run db:migrate:deploy` on that branch. Validate preservation of legacy counts/totals, tenant/source FKs, queue indexes, active config uniqueness and fresh publication/export flow. No `db push`/reset or edited migration history. | PENDING |
| R05 Approve data/UAT | Finish #38, all UAT cases above and owner go/no-go. Bimba's deferred live setup remains explicit and cannot be reported as completed. Record any agreed change in release scope before activation. | PENDING |
| R06 Prepare operations | Set and verify environment secrets, worker target, queue capacity, alert owner and webhook relay controls; test recovery/replay on staging. Back up the connector encryption key securely. | PENDING |
| R07 Quiesce and migrate | Pause affected external worker/relay and Vercel crons; stop new manual writes; let leases settle. Capture restore point, actual migration history and baseline financial/count evidence. Apply reviewed pending migrations with direct credentials, then verify status. | PENDING |
| R08 Deploy candidate | With explicit authorization, promote/deploy the tested commit against the matching schema. Smoke auth, Settings, all five screens, both CSVs/history and foreign-tenant denial. Old additive schema stays available for application rollback. | PENDING |
| R09 Activate canary | Approve account-specific mappings/terms; run one authorized client cycle, verify imports and calculations separately, then enable the external minute worker/relay. Observe a complete daily stock cycle and two-hour order cadence. Expand only after reconciliation and operational checks pass. | PENDING |
| R10 Close release | Store deployment/schema/worker IDs, observed timings, errors/latency/lag, recovery proof and customer sign-offs. Close #51 only when the five readiness criteria and checklist have evidence. | PENDING |

Repository migration head: `20261025040000_overview_supporting_facts` (16 migration
directories through this baseline). This is not a claim that production is at that
head. #38's earlier database observation was missing new merchandising columns;
recheck the actual target and replay **all** pending migrations in order, including
any earlier marketing migration. This task introduces no new migration.

### Queue, cron and secrets

- Keep the existing two daily Sheets UTC slots (`04`/`05`) in `vercel.json`.
  They serve the 07:00 Kyiv window; they do not run the SalesDrive minute worker.
- On the agreed Vercel Hobby plan, use a trusted external minute scheduler for
  `GET /api/cron/salesdrive-sync`, with `Authorization: Bearer <CRON_SECRET>`.
  Configure `SALESDRIVE_SYNC_ORIGIN` and `CRON_SECRET` in the external host's secret
  environment. Use the existing `scripts/salesdrive-sync-worker.mjs`; never place
  tokens in URLs, command history or logs. Preview must not target production.
- Each tick rotates up to 25 connections, dispatches durable work and runs one
  bounded job page or recalculation phase. One leased writer per tenant/source;
  retain the 200-job admission guard, account-wide budget, Retry-After and retry
  delays. Do not add an unbounded loop inside a Vercel request.
- Orders have two-hour UTC intent slots with a two-hour overlap; stock is due
  at/after 03:00 Kyiv once per business date, including DST changes. Record actual
  observation time and backlog delay; missed historical stock is not recreated.
- Vercel secrets: pooled `DATABASE_URL`, direct `DIRECT_URL`, auth secrets,
  `CRON_SECRET`, stable `CONNECTOR_ENCRYPTION_KEY`, and `SALESDRIVE_WEBHOOK_SECRET`
  only if an authenticated relay is deployed. Maintain existing Sheets/provider
  settings. Check names against `.env.example`; store CRM credentials in Settings.
- Native unauthenticated SalesDrive delivery is not accepted. Verify relay ingress
  authentication/account binding independently, persist/retry delivery, and forward
  with the existing per-source header token. Do not fabricate a native signature.

### Monitoring, recovery and replay

Use Settings Data Quality/sync progress, sanitized structured `connector.sync.step`
and `connector.recalculation.failed` logs, external worker `salesdrive-sync-tick`,
Vercel runtime logs and tenant/source-scoped queue observations. Install and test
alerts with a named recipient before activation; the following are proposed
operational starting points, not claims that alerting is configured:

| Signal | Investigate / response |
| --- | --- |
| No tick for >5 minutes or repeated non-2xx | Check worker health, origin, auth and route logs. Restart external runner after diagnosis; do not rotate secrets blindly. |
| Orders watermark >2 hours old | Check provider budgets and queue lag; UI already labels stale data at this threshold. Expose incomplete baseline separately. |
| No successful inventory observation for today's Kyiv date after the agreed grace window | Inspect inventory/receipt stages and queue. Capture real observation time; never backdate a new feed pull. Owner/operator must agree grace window before go-live. |
| Growing queue / repeated 429 / dispatch failure | Inspect sanitized code, due time and oldest intent; respect shared account quota and Retry-After. Plan capacity before reaching the 200-job source guard. |
| FAILED/PAUSED import or expired lease | Use existing Settings resume/backfill controls for the affected client/cycle. Preserve checkpoint/raw evidence and source versions; never delete cursors or falsify job completion. |
| Failed/stalled recalculation | Inspect saved phase, retry time and error code. The consumer retries the retained phase; verify published daily/sales IDs and changed settings before refreshing the screen snapshot. |
| Spike in 5xx, input-limit errors or empty/partial financial coverage | Retain old snapshots, stop affected activation and inspect request IDs/source/mapping versions. Bound input errors remain visible; do not bypass limits or suppress missing-data warnings. |
| KPI/export discrepancy | Freeze snapshot/inputSet/preview/export/action IDs. Compare identical filters/version and exact saved CSV bytes; fix forward and regenerate a new scenario rather than editing audited files. |

Replaying the same source version or a lost export response must preserve
idempotency. Resume the retained import/cycle through existing services; redeliver
relay events using their original identity. Genuine corrected source/config data
creates a new version and fresh calculations. After a fix, verify no duplicate
order facts, history/action rows or files and rerun affected reconciliation/UAT.

For an incident: pause the external runner, relay and relevant Vercel crons, record
in-flight jobs/leases, retain evidence and use the existing incident template.
Prefer application rollback with the additive schema retained when compatible;
then run auth/five-screen/export smoke tests. Vercel rollback does not update cron
schedules automatically: inspect and explicitly disable/update them. Never deploy
old one-job queue assumptions over active multi-job queues. Use a reviewed forward
fix when incompatible. A database restore requires explicit approval, a tested
restore point/isolated branch, reconciliation of writes after the restore point,
and a controlled application/database switch. Do not drop live tables or rewrite
migration history to simulate rollback.

## Validation record

- `npx prisma validate`: passed; schema unchanged.
- `npm run build`: passed on the final worker change.
- `npx tsc --noEmit` and `git diff --check`: passed.
- Focused `npm run test:mvp`: 836 tests passed across 61 files.
- Full regression: `npm test -- --maxWorkers=2` — 969 tests passed across 88 files, including both new acceptance journeys.
- Existing private reconciliation CLI: exit 2, BLOCKED, 26 unresolved evidence/approval checks.
- Clean `npm ci` installation was not repeated; checks used installed lockfile dependencies.

Live daily
sync, staging migration/restore rehearsal, browser UAT on customer data, production
monitoring and deployment remain **NOT RUN / PENDING**. The #50 browser evidence is
historical evidence for that task, not a new #51 browser run.

## Operations references

Checked for this rollout plan; use the repository's installed Prisma version for
commands rather than migrating to a new documentation/toolchain generation:

- [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing): Hobby daily/hourly precision explains the external minute runner.
- [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs): secret headers, logs and explicit cron handling after rollback.
- [Neon branching](https://neon.com/docs/introduction/branching): isolated rehearsal and retained restore evidence.
- [Prisma CLI migrate deploy](https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-deploy): use the pinned Prisma 5 migration workflow already defined in this repository.
