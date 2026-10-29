# #108 — Execution evidence and observed GMROI retrospectives

## Approved business contract

On 2026-10-29 the project owner explicitly approved the proposed rules in this
chat: ADMIN confirmation of actual execution with an evidence reference and exact
exported SKU subset; equal complete-day before/after windows excluding launch day;
saved gross profit including returns divided by average observed daily own-stock
cost; a disclosed daily-observation approximation, no annualization, currencies
separate, unavailable for missing evidence/zero denominator; distinct order sent,
accepted and verified received events; no causal uplift claim.

Policy version: **`retrospective-v1`**. These are the implementation rules approved
for this task. They do not certify customer results or replace the open customer
acceptance in #92. Future formula changes require a new version and evidence.

The general GMROI ratio (gross profit / average inventory at cost) was checked
against [Shopify's retail metrics definition](https://www.shopify.com/blog/retail-metrics)
on 2026-10-29. The sampling/ownership/window/annualization choices below are the
owner-approved project contract, not claims that this source specifies them.

## Workspace and dependency boundary

#54 remains uncommitted in the original checkout; it was not committed, stashed,
reset, copied into this branch or pushed. #108 is isolated at
`feat/108-retrospective-evidence-gmroi` in a managed worktree based on current main
`d3a04fc`. It consumes the already merged immutable #48 export and screen contracts,
so its confirmation/report APIs do not depend on #54 being merged first.
The #54 preparation endpoint retains its own preparation-only contract until a
separate integration change. External price writes and supplier deliveries remain
separate #109/#110, neither called nor implemented here.

## Confirmation API and authority

`POST /api/merchandising/retrospectives/executions` requires a signed
ADMIN/SUPER_ADMIN session and rechecks current database membership under the tenant
lock. It records the owner's evidence; it never applies a price or sends an order.
No raw provider request, recipient, remote endpoint or credential is accepted.

```json
{
  "requestKey": "11111111-1111-4111-8111-111111111111",
  "exportId": "22222222-2222-4222-8222-222222222222",
  "kind": "reprice",
  "event": "APPLIED",
  "occurredAt": "2026-10-25T09:00:00Z",
  "evidenceReference": "Reviewed execution report reference",
  "skuIds": ["canonical-sku-id"],
  "previousExecutionId": null,
  "receiptIds": []
}
```

Evidence references are bounded plain text, not fetched URLs or provider prompts;
use a reference identifier, not credentials or customer PII. `occurredAt` is a valid
UTC instant between export creation and confirmation time. The ADMIN is attesting
the actual external action. The receipt labels evidence as `OWNER_ATTESTATION`,
not independent transport verification. A differing real applied price/ordered
quantity requires a corrected audited scenario export; callers cannot override
frozen prices, quantities or outcomes on the confirmation endpoint.

At most 500 distinct canonical SKUs may be selected, all present in the tenant's
original export. Confirmation is available to tenant administrators independently
of whether they were the original export actor. Each selected row is frozen along
with original export parameters, receipt/file hashes, source/snapshot/calculation
provenance, policy version, confirmer and time. Immutable audit metadata is capped
at 512 KiB. Identical actor/request-key/payload replay returns the same receipt;
a conflicting replay is 409. Overlapping root confirmations for the same export
and event are rejected, while disjoint actually-applied subsets may be recorded
separately. Corrections/revocation are not silently implemented by overwriting a
confirmation; an explicit correction lifecycle is a future change.

Repricing supports `APPLIED` with no predecessor. Reordering uses this chain:

1. `SENT`: no predecessor, evidence reference, no receipt documents.
2. `ACCEPTED`: predecessor must be that export/subset's SENT confirmation.
3. `RECEIVED`: predecessor must be ACCEPTED; supply up to 25 verified receipt IDs.

Times must be ordered and each predecessor can have only one child confirmation.
Every selected SKU must be covered by a positive line in an actual posted external
supplier receipt from the same tenant/source and matching exported supplier, after
export and no later than the confirmed received event. All provided receipt IDs
must contribute valid lines; unverified, foreign, transfer/write-off, mismatched
supplier or missing-SKU documents are rejected. Successful/warning import provenance
is required. The RECEIVED event instant must equal the latest verified selected
receipt instant; a caller cannot move the comparison origin to an arbitrary later
date. Posting verification must already exist by confirmation time. Read at most 1,001 rows and reject above 1,000 receipt lines.

A RECEIVED event proves positive observed receipt lines, **not that all ordered
units arrived**. The receipt explicitly says
`POSITIVE_VERIFIED_LINES_NOT_FULL_ORDER_COMPLETION` and retains exact received
quantities/document keys. Partial receipt is distinguishable from original ordered
quantity. No lot allocation, order completion or supplier acknowledgement is
inferred from physical movement alone; SENT/ACCEPTED remain owner attestations.

## Report API and comparable periods

`POST /api/merchandising/retrospectives/report` requires ANALYST or above and
current same-tenant membership:

```json
{
  "executionId": "confirmed-execution-uuid",
  "beforeSnapshotId": "saved-before-period-snapshot",
  "afterSnapshotId": "saved-after-period-snapshot",
  "days": 3
}
```

Only a confirmed APPLIED repricing or RECEIVED reordering event can produce a
comparison. SENT/ACCEPTED returns explicit unavailable with GMROI null. The source
must still be selected at the original selection revision. The duration is 1–90
days. All channels are included consistently in both sales and physical stock.
The fixed cohort is the exact confirmed export subset; other exported/non-applied
SKUs cannot inflate results. It is descriptive SKU performance, not lot performance.

Use the source business timezone to derive the launch date. The before window is
the preceding N complete calendar dates. The after window is the following N full
dates; always exclude the launch date, including midnight events, rather than mix
partially exposed days. A group confirmation refers to when the whole selected
subset was applied/received; separately timed subsets need separate confirmations.

Both windows must be fully completed before computation, with an inclusive saved
sales period matching the derived dates and a stock as-of later than period end.
Saved snapshot creation/cutoff cannot be in the future. No caller may supply window
dates, profit, inventory values or computed results.

Historical before/after snapshots do not have to match today's import cursor:
that would make ordinary retrospectives impossible. Instead, shared publication
validation checks their tenant, source, calculation IDs/versions/input keys,
settings/config IDs, period, stock cutoff/as-of and row count. Both snapshots must
match the original export's source, selection revision, timezone, settings and
calculation versions. Changed settings/ownership/currency or missing cohort rows
are explicit conflicts or unavailable states; no version mixing occurs.

The immutable MVP publication-header validator is reused by #96 custom labels and
these historical reads. Live custom-label/source freshness checks remain in their
original caller; extracting the validator does not make those checks optional.

## Sales facts and observed inventory

Numerator: sum saved canonical grossProfit fields for merchandise in the confirmed
subset and window, with signed returns/corrections and no preorders. Revenue and
units use the same saved fields. No formula copy or new order-status interpretation
replaces the existing financial calculator. Complete sales history and known unit,
revenue, profit, currency and source identity are required. A complete empty sales
window is genuinely zero; missing quantities/profit are unavailable. Negative gross
profit remains negative, including return-dominated periods; it is not clamped to 0.
At most 100,000 current-period saved facts are allowed before aggregation.

Denominator: for each calendar day in the same window, sum the selected **own-stock**
SKUs' observed `quantity × costPrice`, then take the arithmetic mean of those daily
totals. Exactly one actual daily observation is required for each SKU/day. Verify
source, tenant, business timezone/date, raw record key, successful/warning import,
nonnegative quantity, matching currency and positive cost for nonzero stock.
Zero quantity contributes true zero cost even if unit cost is missing. Unknown cost
on positive stock or a missing date prevents full GMROI. No carried/interpolated
stock or inferred end-of-day balance fills a gap.

Own-stock eligibility is checked in the frozen origin and comparison snapshots;
unverified/consignment/service/gift-card identities are excluded with explicit
reasons. Settings and per-snapshot ownership must stay consistent; this does not
reconstruct undisclosed intraperiod ownership transfers. Such cases require corrected
evidence/manual review and remain part of customer acceptance.

Use historical observations strictly before each saved stock cutoff. Their actual
instants, document/import keys, quantities and costs are retained in the report.
This is a **daily-observation approximation**, not exact time-weighted continuous
inventory, not a closing 23:59 balance and not proof of intraday stock availability.
No inventory movement bridge is invented between samples. Daylight-saving days
still have one equal calendar-day sample, not artificial 24-hour weighting.

Compute separately for each currency using the shared Decimal helper:

`GMROI = saved gross profit for the window / mean(observed daily own-stock cost)`

Return a ratio (e.g. `0.75`), without multiplying by 100, annualizing or asserting a
performance threshold. A zero average denominator is unavailable, even with zero
sales/profit; unknown denominator is not a zero return. Known negative profit is a
valid negative ratio. Missing costs/stock and unknown ownership are explicit.

Approved worked examples for automated regression checks:

| Gross profit | Daily observed costs | Average | Result |
| --- | --- | --- | --- |
| 150 | 100, 300 | 200 | 0.75 |
| -50 | 100, 300 | 200 | -0.25 |
| 0 | 100, 300 | 200 | 0 |
| 1 | 0, 0 | 0 | unavailable: zero denominator |
| unknown | 100, 300 | 200 | unavailable: incomplete profit |
| 150 | 100, missing | unknown | unavailable: incomplete inventory |

## Audit, replay and interpretation

A completed calculation stores a tenant-scoped immutable RETROSPECTIVE_REPORT with
execution evidence, original export parameters/applied rows, both publication
versions, actual inventory samples, source fact fingerprints, currency results and
policy version. The full report is capped at 4 MiB. Its exact input/result hash
returns the same persisted report ID on replay. Later corrected raw observations
may produce a new report, but never overwrite an earlier stored report. MD5 fact
fingerprints identify saved scoped content; original exported file integrity uses
its existing SHA-256 receipts. There is no AI-generated number or provider call.

Before/after changes are absolute descriptive revenue/profit differences for the
same SKU cohort. `causalUplift` remains null, `lotAttribution` is false and no
seasonality/control-group correction or causal sales lift is claimed. An order
export, confirmation or report cannot dispatch an external action. Incomplete
currency blocks remain unavailable/partial, never a confidently fabricated zero.

No new tables, schema migration, cron, frontend screen, customer launch data or
production database operation is required. The APIs reuse existing authentication,
transaction, export, Decimal and saved-publication boundaries. A separately reviewed
UI can consume these contracts; this task does not silently activate legacy campaign
tracking or overwrite its insufficient-data semantics.

## Acceptance and verification limits

Offline tests use synthetic isolated PGlite databases with production migrations.
They do not connect to DATABASE_URL. Coverage includes exact subset confirmation,
owner/tenant roles, repeated/conflicting requests, export reproduction, event time,
received-document checks, separate order stages, full-day windows, signed returns,
missing/zero costs, ownership and currency mismatches, publication corruption,
source switching, immutable replay and approved Decimal examples. Route tests check
signed roles, no-store, query rejection and sanitized failures.

Real campaign execution references, business data reconciliation and customer-result
approval remain under #92. Source-specific price write-back and actual supplier
sending remain #109/#110. No external message/order or live price change was sent.
Validation on 2026-10-29:

- Full suite: 142 files / 1,426 tests passed (16 new #108 checks).
- `npx tsc --noEmit` — exit 0.
- Production build — exit 0 with synthetic build-only JWT access/refresh values.
  The isolated worktree has no production `.env`; the initial unconfigured build
  correctly refused missing JWT secrets. No real secrets or database access were used.
- Final 16 targeted #108 checks and TypeScript passed after enforcing the verified
  receipt timestamp at confirmation.
- `git diff --check` — exit 0.
- No frontend screen or browser verification applies to this backend-only change.
