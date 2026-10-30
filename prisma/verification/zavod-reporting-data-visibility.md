# Zavod missing-report-data diagnosis — 2026-10-30

## Confirmed causes

Production's mapping revision 2 had UAH and approved order statuses, but left
`defaultProductKind=UNKNOWN` and `stockObservation=unverified`. Unknown product
types are deliberately excluded from headline revenue; an unverified stock
timestamp deliberately creates no InventorySnapshot. These safeguards are not
removed. The empty views were not proof that Zavod contained no sales or stock.

The owner subsequently approved, for the test Zavod account:

- services category `Послуги` → SERVICE;
- gift-card category `Подарункові сертифікати` → GIFT_CARD;
- other actual merchandise categories → MERCHANDISE;
- `Різне` → UNKNOWN/manual review;
- Stock Qty represents physical stock observed during the current import.

No ownership, consignment commission, receipt baseline, transit quantity, supplier
terms or history completeness was approved by these confirmations.

Two implementation defects obscured diagnosis and prevented a fresh observation:

1. Data Quality joined ConnectorConnection and InventorySnapshot for every SKU.
   Sheets has no remote CRM connection and may have no verified stock yet, so the
   page misleadingly rendered an empty catalogue and no affected stock.
2. A fresh workbook download with unchanged cells reused an arbitrarily old
   active import. It could never supply a new dated stock observation even with
   an approved import-observation policy.

## Changes

- Use the actual selected DataSource for quality, movements and row exceptions.
  Include catalogue identities even without inventory; keep missing quantity,
  value, stock timestamp and product-age evidence explicitly unavailable.
- If stock is absent, price currency can label catalogue diagnostics; an existing
  stock observation's unknown currency is never filled from a separate price.
- Replace the empty affected-stock assurance with evidence guidance and remove
  SalesDrive-specific links from shared source-quality corrections.
- Reuse an identical active raw import only on the same Kyiv business day and
  pipeline version. A new day stores a new immutable observed import even if
  cells are unchanged. This never fabricates observations on unobserved days and
  does not authorize stock projection without the approved mapping policy.

## Local verification

An isolated native PostgreSQL replay of the saved real workbook (4,599 raw product
rows / 22,185 order rows) with the approved category and observation policies
published 3,978 accepted products and 3,978 dated stock observations. All five
screen services completed; the year-to-date overview contained nonzero UAH
revenue and units, and stock contained known quantities. Projection took about
4.1 seconds. This saved observation differs from the active production import;
its totals are diagnostic evidence, not final production financial acceptance.

Profit, LY ratios, velocity/classification and action candidates remain limited
where ownership, history or supplier evidence is missing. Those rules were not
bypassed to populate screens.

Regression tests cover Sheets with no CRM connection or verified inventory,
retained movement diagnostics, selected-source and tenant isolation, price versus
stock currency, next-day unchanged imports, same-day deduplication and Kyiv/UTC
day boundaries. Existing SalesDrive diagnostic tests remain in coverage.
Full regression: 170 files passed, 1,694 tests passed, one skipped. Final targeted
regression: 27 tests passed. TypeScript and production build passed with local
fixture JWT secrets; no production credentials were used for the build.

## Production continuation

Code changes and the newly approved source policies have not been deployed/applied
by this verification. Browser tooling became unavailable with the explicit
message `Local browser use is disabled in Work settings`; no alternate path was
used to bypass that setting.

After browser access is restored and the code is deployed: review/approve a new
mapping revision with the owner-approved category and stock-observation rules,
download a fresh workbook observation, run MVP projection, and create a fresh
report snapshot with stale detail filters cleared. Verify nonzero known sales and
stock separately from still-unavailable profit/classification/action metrics.
Do not timestamp the old September import as a current observation.

Real workbook rows and local test results stay outside Git in private temporary
artifacts. No source spreadsheet, credentials, permissions, production schema,
CRM prices or supplier deliveries were changed by this code fix.
