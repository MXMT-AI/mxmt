# Google Sheets / SalesDrive reporting — step 6: offline acceptance

Step 5 is committed as `0d80344`. The owner explicitly confirmed that real business
rules and a SalesDrive test connection are not ready: validate offline and defer
activation. This document records the offline work, not live acceptance sign-off.

## Repeatable private-workbook check

Run:

```sh
npm run verify:reporting:offline -- /private/path/workbook.xlsx /private/path/report.json
```

The command reads an existing local workbook; it never downloads a new revision,
loads project .env files, calls CRM APIs, changes source selection or approves a
customer mapping. The supplied workbook is limited to 15 MiB. The suite uses
isolated in-memory PostgreSQL with production migrations and mocks the configured
SQL singleton. A fake transport exercises the actual SalesDrive adapter.

The real-workbook test is opt-in through this command. Normal `npm test` runs the
synthetic diagnostics and parity tests and skips the private workbook. No private
file, source rows, product/order identities, account credentials or benchmark sums
are embedded in repository fixtures. The report is written through savePrivate
with owner-only file permissions; public repository output is refused.

The report contains workbook/snapshot hashes, row/column counts, proposed field
keys, aggregate issue counts and identity compatibility. It contains no raw rows
or product/order values. It is always REVIEW_REQUIRED and activated=false. XXX is
used only as the diagnostic no-currency marker; statuses remain unapproved and
no signed financial revenue/cost may result. A separately labelled SKU-only
variant measures structural feasibility, without approving or saving that mapping.

## Evidence and interpretation

The available local Zavod snapshot parsed successfully and fits the input limits.
The offline check identified substantial incompatibility between order product IDs
and catalog IDs, despite many unique SKU matches. Header-based suggestions alone
are therefore insufficient for this workbook. The private report contains exact
counts and both diagnostic variants for owner review.

A SKU-only mapping is a candidate to investigate, not a validated business rule.
Ambiguous SKUs, duplicate order/product pairs, invalid source values and unmatched
products remain quarantined. The compiler never falls back from an explicit,
unmatched product ID to SKU silently. No source was activated to hide these issues.

Offline synthetic parity checks feed equivalent line totals through the Sheets
compiler and unit values through the actual SalesDrive adapter with fake transport.
The shared normalizer produces equal quantities, signed revenue/cost, currency,
event kind and payment date. This verifies format parity, not live SalesDrive
credentials, API permissions, tenant configuration or customer-history completeness.

The suite also exercises native Sheets approval/selection/projection, all five
screen reads, recalculation, rollback, remapping and existing SalesDrive import/
inventory and screen regressions.

## Required before live acceptance

1. Approve an identity contract for Zavod: exact product/order/line fields, whether
   a unique SKU is authoritative, and handling of ambiguous/missing identities.
2. Approve real status meanings, currency, net/unit/line amount semantics and event
   dates. A row update time is not a verified return date.
3. Confirm stock observation semantics, product classifications, ownership,
   supplier terms and history coverage. Unavailable evidence stays unknown.
4. Supply a separate read-only SalesDrive test connection through Settings, with
   agreed status/amount/date rules. Do not put credentials into chat or fixtures.
5. Rehearse the approved mapping and full workbook on an isolated database copy;
   measure actual import/projection/snapshot latency against deployment budgets.
6. Compare the agreed real benchmark cases across Overview, Sales, Stock,
   Repricing and Reordering, including drill-downs, returns and unavailable metrics.
7. Record owner acceptance. Explicitly approve live mapping, select the reporting
   source, then import/refresh. Deployment and live activation remain separate.

No production schema/data change, source activation, CRM write, commit or push is
part of this handoff. Steps 1–5 are implemented; step 6's offline portion is
complete once checks below pass. Live acceptance remains pending the evidence
and access listed above.

## Validation

- Private-workbook offline command: 6 files / 78 tests passed.
- Full offline suite: 159 files / 1,584 passed, with the private-workbook test
  skipped by default (it passed separately in the command above).
- TypeScript, whitespace checks and isolated production build passed. The build
  used synthetic JWT values and no production environment files.
- Private evidence was saved outside Git with mode 0600. The local snapshot was
  inspected; a fresh cloud download and live SalesDrive verification were not run.
