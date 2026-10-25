# Stage 1: Zavod reconciliation and threshold acceptance (#38)

Branch: `feat/38-zavod-benchmark-reconciliation`.
Status: **Preparation implemented; customer reconciliation and acceptance BLOCKED**.
The owner identified `GOOGLE_DRIVE_FILE_ID` as the Zavod source. Its configured
workbook has now been downloaded, frozen with SHA-256 and audited. Customer
benchmark/scope confirmation and Sasha/Olia sign-off remain pending. Do not close #38 or mark Stage 1/final UI acceptance complete on the basis of
synthetic tests or a reference-only report.

## Authority and observed reference discrepancies

The [specification](https://claude.ai/artifact/NKECTQztioMNUsgsRjMhwq#artboard-4a9b5111b2ae)
was reread on October 25, 2026. Section 11 is now visible: Stage 1 requires
September 2026 revenue, GP and cost-valued stock within ±1%. Section 12 assigns
classification thresholds to Sasha and Olia. This updates the current evidence
state; it does not rewrite #27's historical observation that section 11 was absent.
The owner's D01–D22 policy approval remains distinct from customer data acceptance.

`38-zavod-reference.json` versions public reference observations only. It is
explicitly PROVISIONAL, with no confirmed stock date, channel IDs or legacy rule
version. Values are not fabricated source records or an approved fixture.

| Observation | Arithmetic | Status / investigation |
| --- | --- | --- |
| Four channels vs headline | 1,156,811 vs 1,156,812 UAH; difference 1 UAH | Exact amounts, scope and presentation rounding need source evidence. Never add 1 UAH to a row to force a match. |
| Old dead vs alternative dead | 7.34m vs 6.29m UAH; difference 1.05m UAH | Definitions, populations, snapshot and valuation must be compared. Cause is not yet established. |
| Old dead SKU counts | 1,013 vs 874; difference 139 | Requires both actual SKU sets; the difference alone does not prove which rows/rules changed. |
| Old three classes vs stock | 11.24m vs approximately 11.25m UAH | Both values are rounded; service/new/off-season exclusions and observation date must be checked. |

Do not turn a plausible explanation into a verified cause. The private report
bridges population changes and shared-SKU valuation differences when both source
classifications become available. New statuses are never required to match the
old dead/risk/healthy totals. The old Sheets classifier is not a substitute for
Sasha's undocumented historical method.

## Offline tool and private storage

Run on Node 20 with the existing project dependencies; no added runtime package,
network call, database connection, customer import, migration or configuration
activation is performed. Financial comparisons reuse the same 48-digit Decimal
helper as the production engines; no binary-float financial arithmetic is added.

```sh
npm run reconcile:zavod -- --template .local/reconciliation/zavod-september-2026
npm run reconcile:zavod -- .local/reconciliation/zavod-september-2026/manifest.json
npm run reconcile:zavod -- --reference-only
npm run audit:zavod -- .local/reconciliation/zavod-september-2026/source-workbook.xlsx
```

The template is unverified and contains empty approvals. It never overwrites an
existing template. Private reports use file mode 0600 and atomic replacement.
`.local/reconciliation/` is ignored by Git. Outputs elsewhere inside this repository
are refused, including tracked verification directories; an external private
directory is also supported. Do not add exports, approval records or generated
customer reports to Git. Only the public reference, tooling, synthetic contract
tests and this runbook belong in the repository.

`audit:zavod` reads source values, cached formulas and Excel calendar dates without
recalculating or exporting a workbook. It retains numeric serials so incorrectly
date-formatted price cells do not turn amounts into Date objects. It emits a
private `workbook-audit.json`; candidate discount/unit-cost calculations are not
accepted GP or proof of supplier ownership. Its exit 2 denotes unresolved source
reconciliation. Financial results and source XLSX data remain private.

CLI stdout contains status/counts only, not financial values, records or error
messages. Exit 0 means the supplied evidence contract and numeric checks pass;
exit 2 means BLOCKED/FAIL; exit 1 means invalid input/output location. Detailed
findings remain in the private `reconciliation-report.json` (or `--out` path).
The command checks recorded evidence and hash bindings; it does **not** authenticate
signatories, inspect the source archive's accounting meaning, or independently
prove that a published result was calculated from that archive. The reviewer must
verify those facts against the linked restricted evidence before recording approval.

## Required versioned package

The private manifest contains `schemaVersion: 1`, stable `fixtureId`, positive
`revision`, `origin`, `scope`, `artifacts`, `discrepancyExplanation` and `approvals`.
Scope identifies source ID, UAH, Europe/Kyiv and the explicitly approved stock date.
Revision changes whenever evidence, accounting scope or settings change.
`origin: VERIFIED_CUSTOMER` records verified customer origin; do not set it for
synthetic data merely to exercise a passing result.

Each artifact entry has a relative/absolute local `path` and a SHA-256 of its exact
bytes. Obtain hashes locally (for example `shasum -a 256 <private-file>`). Keep the
original bytes after approval. The CLI hashes the bytes it parses, checks the
manifest hashes and does not substitute missing artifacts with customer data.
JSON artifacts are bounded to 64 MiB; the source archive is streamed and bounded
to 512 MiB. These are offline evidence limits, not import-engine limits.

| Artifact | Contents / requirements |
| --- | --- |
| `reference` | Private confirmed copy of the public reference: confirmed exact targets, actual channel IDs, approved stock date and source-backed rounding/scope corrections; `authority: CONFIRMED`. Retain the public original for comparison. |
| `source` | Restricted frozen archive covering September 2026/2025 orders, relevant status/date/discount/ownership mappings, historical receipts/exposure and the actual stock observation. Include source/export times, filters, timezone, units and currency. No API keys or secrets. |
| `sales` | Complete frozen #35 publication: version 1, calculationRunId, summary, channels, period/history, issues and provenance. Obtain the complete saved publication via the existing `readPublishedSalesReport` service or an authorized read-only snapshot export. `/api/data/sales?calculationRunId=<id>` deliberately returns a summary and paginated view, so its response alone is not this full artifact. |
| `daily` | Frozen #37 version-2 result plus **all** its rows, retrieved with the same calculationId across pages. Include rowCount, summary, provenance, source observations and classifications. Incomplete pages or duplicate SKU IDs are blocked. |
| `settings` | Actual client-settings snapshot `{id, revision, values}` consumed by both calculations. Preserve its immutable config ID. Different settings IDs require recalculation and a new evidence revision, not an inferred settings merge. |
| `legacy` | `{ruleVersion, asOf, currency, valuation: "COST", rows}`. Rows: `{skuId, classification, stockCostValue}`. Historical rule/source definition must accompany the evidence. |
| `alternative` | Same shape for the 6.29m/874-SKU example. Preserve its actual population/rule and explain any differing observation/valuation scope. |

Do not pass a CSV formatted for display as an exact frozen financial result.
The production financial calculation stores the complete summary/channels in
`ReportCalculationRun.financialResult`; daily rows/manifest use `SkuDaily` and
its saved config ID. Retrieve approved snapshots through existing authenticated
services or an authorized read-only export. Never request credentials in GitHub.
The tool does not download or activate a customer connector on its own.

## Comparison and acceptance

Money targets use inclusive ±1% of the confirmed target, before rounding. Orders
and unit counts are exact. Display margin is derived from the ratio input and
rounded to one percentage decimal (45.4%), not compared as a 45.4 ratio. Missing
GP, partial covered GP, incomplete current/LY history or unknown stock cost remain
blocked even if a visible covered amount happens to match the target.

Financial periods are pinned to September 2026 and September 2025. Source,
currency, timezone, settings ID and formula versions must agree. Stock uses its
confirmed observation date; a current October pull cannot stand in for September.
Row sums must match the saved stock summary. Mixed stock currencies require scope
review; no FX is invented. Channel IDs/population must match, and actual channel
amounts must sum exactly to the actual headline independently of benchmark tolerance.

The report contains per-metric expected/actual/delta/relative delta, coverage
blockers, saved calculation IDs, threshold values and diagnostic codes/counts.
`numericStatus` distinguishes mismatched amounts from missing evidence; overall
`status` remains BLOCKED while evidence/approvals are incomplete. Classification
comparison reports old→new counts/values, missing populations and alternative-dead
value components (only-old minus only-alternative plus shared-SKU valuation change).
`discrepancyExplanation` requires an evidence reference and established cause.

After reviewing a complete report, record approvals in the **private manifest**:
`{kind, role, actor, evidenceRef, approvedAt, fingerprint}`. The fingerprint is in
the generated report and binds fixture ID/revision, scope, explanation and every
actual artifact hash. Approval fields are excluded from the fingerprint to avoid
a circular signature. Any input/scope/revision change invalidates old sign-offs.
Required records: SOURCE_DATA/OWNER, BENCHMARKS/OWNER, THRESHOLDS/SASHA,
THRESHOLDS/OLIA and CLASSIFICATION_REVIEW/SASHA. Do not fabricate these records or
assume the #27 owner policy decision is a Sasha/Olia acceptance signature.

Default approved business settings remain 90 dead days, 12/26 WOH weeks, six-week
quarantine, 45% margin, three-month turnover, lead/cover 30/60 days and MOQ 1.
The report shows the actual saved settings; customer-specific changes need a new
approved settings version and reconciliation, not edits to calculation formulas.

## Current handoff

Section 11/public reference review and configured source acquisition: complete.
The source workbook, download provenance, source audit and historical-import
comparison are retained only in the ignored private directory. Source identity
and bytes are established; an accounting scope or benchmark approval is not inferred.

The current workbook has raw price/quantity/discount fields instead of the legacy
net amount headers. Its ARTICLE REPORT contains formulas still pointing to the
previous column layout, a different control period and bounded subtotal ranges.
These are evidence issues in the source; this task does not rewrite the shared
Google workbook or silently relax the established importer contract.

The private audit separates sale lines, distinct orders and units; compares the
approved sale statuses with explicitly excluded refusals; retains zero-cost and
return-date gaps; and compares current catalog stock independently of the cached
ARTICLE REPORT subtotals. An earlier retained Sheets import was inspected in a
READ ONLY transaction. It has a different period/population and cannot substitute
for a confirmed month-end stock observation. The configured database does not yet
have the new source-kind/financial-result columns; no production migration or
write was performed to bypass this prerequisite.

Confirmed snapshot/channel mapping, verified discount/ownership/service/return
semantics, old/alternative SKU sets and Sasha/Olia acceptance remain pending.
Current runs return BLOCKED as intended. Keep #38 In Progress and final UI
acceptance gated.

Validation: `npm test -- --maxWorkers=2`, `npx tsc --noEmit`, `npm run build` and
`git diff --check`. Tests use synthetic contract aggregates and test approval
records; they provide no customer numerical acceptance evidence.
