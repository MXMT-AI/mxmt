# Zavod report readiness and receipt activation plan

## Implemented

- All five screens reuse one explanation panel driven by aggregate diagnostics
  from their pinned screen snapshot. Counts explicitly cover the whole source,
  independent of display filters. No live settings replace frozen evidence.
- Distinguish missing dated stock, receipt history, velocity exposure, ownership
  and product type. Link to Data Quality and merchandising settings.
- Explain the separate unverified currency/stock group in Overview and Stock.
  Historical source identities remain visible; they are not deleted or turned
  into zero stock merely because they are absent from the latest catalogue.
- Empty eligible repricing results no longer present zero cash benefits as
  calculated outcomes. Selection counts remain visible.
- A local receipt preview checks source columns, missing SKU/supplier, numeric
  quantity/price and repeated document/product identities. It never posts a
  receipt, confirms a currency or certifies historical coverage.

## Receipt evidence inspected

The live spreadsheet metadata and bounded header/sample read confirmed the
`Надходження товарів` tab. File timezone is `Europe/Bucharest`; the application's
approved report timezone remains `Europe/Kyiv`. Date-only receipt dates must not
be silently converted to invented UTC timestamps.

The separately saved workbook (not a new live download) contains 8,759 populated
receipt rows across 311 documents: type 1 has 7,781 rows and type 2 has 978 rows.
There are 25 missing SKUs, 8,742 missing counterparty IDs, 101 nonpositive/invalid
quantities, 978 nonpositive/invalid prices and 74 repeated document/product keys.
These are preview findings, not classifications of legitimate returns/transfers.
The live sample showed a later document than some saved rows; these counts must
not be presented as a fresh full live-file audit.

Run against a frozen local file using Node 24:

```sh
node scripts/preview-zavod-receipts.mjs /path/to/zavod.xlsx
```

### Proposed mapping — awaiting owner approval

| Source column | Proposed meaning | Required confirmation |
| --- | --- | --- |
| ID документа | External receipt document ID | ID stability and cancellation/version semantics |
| Дата | Actual receipt date, retaining date-only precision | Does it mean physical acceptance? |
| Тип | Movement discriminator | Type 1 proposed supplier receipt; type 2 remains unknown |
| Позиція: Кількість | Line units | Treatment of nonpositive movements |
| Позиція: Ціна | Unit procurement cost | UAH, tax basis, unit versus line semantics |
| Товар: Артикул (SKU) | Matching candidate | Unique source alias only; ambiguous matches quarantined |
| Товар: ID | Source product identity | Do receipt and catalogue IDs share an identity space? |
| Контрагент: ID | Supplier evidence | Mostly missing; manufacturer/vendor is not a substitute |
| ID складу / ID складу-джерела | Warehouse/movement evidence | Distinguish receipts from internal transfers |

No stable line ID is present in the inspected headers. Document+product+SKU is
not unique. Before importing: establish a provider line ID or approve an explicit
versioned snapshot-line identity with duplicate handling; do not select the first
row, silently aggregate duplicates, or use the overall document total per line.
Do not infer posted status from mere row existence. Owner confirmation of what
this export represents is required before `postingVerifiedAt` can be populated.

### Activation sequence

1. Obtain the outstanding movement/date/currency/price and identity decisions.
2. Capture receipt data as an immutable import resource with checksum and schema
   provenance; the current five-sheet raw import does not include this tab.
3. Extend the explicit versioned mapping preview/approval contract and expose
   receipt counts, rejected rows, movement exclusions and dates before approval.
4. Import through the shared receipt storage with exact source/tenant aliases,
   date precision, posting evidence and atomic publication. Retain raw evidence.
5. Prove replay, update/cancellation handling, ambiguous line identity isolation,
   no invented supplier, and no cross-source/tenant matches on an isolated DB.
6. Certify history bounds only if the source owner confirms the export is complete;
   earliest observed receipt is not proof of complete earlier history.
7. Recalculate all five screens and scenario previews against one new snapshot.

## Ownership approval

Prepare the test tenant's brand roster privately for the owner. Each brand/SKU
needs OWN, CONSIGNMENT or an explicit per-SKU mixed policy. Consignment additionally
needs the store's revenue share and applicable currency/terms. No ownership or
commission is inferred from vendor price, brand name or a default margin target.
Unknown ownership remains unknown until approved. Apply approved settings through
the existing audited settings API, then calculate a new snapshot.

## Scope and rollout

Validation: 175 test files passed; 1,729 tests passed, one skipped. TypeScript and
production build passed with fixture JWT secrets. Targeted coverage verifies
source-wide frozen diagnostics across filters/screens, localized links and empty
states, unavailable cash totals, receipt ambiguity and the unapproved-preview
boundary. Visual browser checks and production deployment remain pending.

This PR improves explanations and provides a repeatable read-only receipt preview.
It does not activate receipt import or change ownership/business rules. Those
changes depend on the concrete owner decisions above. No production mutation,
financial export, price write or supplier delivery is part of this change.
Final production recalculation and business acceptance follow activation, not
merely merge of this UI/preview preparation.
