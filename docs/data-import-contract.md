# Data Import and Reporting Contract

Status: approved for implementation

Timezone: `Europe/Kyiv`

Source workbook: `1MzALTBxYTNx9zxIaQX0TEm3uAOntw6vAAzVnZx6wnGE`

Calculation specification: `Техническое задание_ расчёт полей ARTICLE REPORT.docx`

## 1. Purpose

This document is the implementation contract for importing the ZAVOD Google
workbook and calculating the `ARTICLE REPORT`, `BY BRAND`, and `BY CATEGORY`
reports inside MXMT.

The system has two distinct data layers:

1. **Raw source layer** — an auditable copy of every source column and row from
   the five allowed worksheets.
2. **Calculated reporting layer** — typed, reproducible results calculated by
   MXMT from `Product YML 2.0` and `ZAVOD_API`.

Existing MXMT tables such as `Sku`, `SalesRecord`, `InventorySnapshot`, and
`CatalogItem` remain in place. This feature is delivered with additive database
migrations; the existing database must not be dropped.

## 2. Allowed worksheets

Only the following worksheets may be imported by this feature:

| Stable key | Source worksheet | Header row | Current observed size | Role |
| --- | --- | ---: | ---: | --- |
| `product_yml` | `Product YML 2.0` | 1 | 14 columns, about 4,050 data rows | Product source |
| `zavod_api` | `ZAVOD_API` | 1 | 30 columns, about 22,185 data rows | Transaction source |
| `article_report_source` | `ARTICLE REPORT` | 5 | 50 columns, about 4,050 populated IDs | Reconciliation source |
| `by_brand_source` | `BY BRAND` | 1 | Currently empty | Reconciliation source |
| `by_category_source` | `BY CATEGORY` | 1 | Currently empty | Reconciliation source |

All other workbook worksheets are ignored. A new or renamed worksheet must not
be imported automatically until this contract and the allowlist are updated.

The raw snapshot preserves source row numbers, blank values, original display
headers, and values that are not part of the calculated reporting model.
Completely blank physical rows caused by worksheet formatting remain in raw
snapshots but do not create typed products, transactions, or data issues.

## 3. Relevant source fields

### 3.1 Product YML 2.0

All 14 columns are stored in the raw layer:

`№`, `ID`, `Name`, `Price`, `Old Price`, `Vendor Price`, `Stock Qty`, `Status`,
`Category`, `Vendor`, `Vendor Code`, `Barcode`, `Article`, `Stock Amount`.

The typed product projection uses:

| Source field | Typed meaning | Contract |
| --- | --- | --- |
| `ID` | Canonical product ID | Required, trimmed text, unique per import |
| `Article` | Alternate product code | Optional, not guaranteed to be unique |
| `Vendor Code` | Alternate product code | Optional |
| `Name` | Product name | Required for report output |
| `Vendor` | Brand | Optional; blank values form an unassigned group |
| `Category` | Category | Optional; blank values form an unassigned group |
| `Price` | Current retail price | Decimal |
| `Old Price` | Previous/list price | Nullable decimal |
| `Vendor Price` | Current cost price | Decimal |
| `Stock Qty` | Current stock units | Decimal |
| `Status` | Product source status | Preserved without changing its meaning |
| `Stock Amount` | Source stock valuation | Preserved for reconciliation |

### 3.2 ZAVOD_API

All 30 columns are stored in the raw layer. The calculation engine uses:

| Source field | Typed meaning |
| --- | --- |
| `id` | Source record identifier; currently repeats across product lines of one order |
| `orderId` | Source order identifier |
| `orderTime` | Order creation date/time |
| `paymentDate` | Contractual sales date |
| `statusId` | Transaction status |
| `product.amount` | Quantity |
| `product.sku` | Primary product matching value |
| `product.parameter` | Fallback product matching value |
| `product.productId` | Source-system internal numeric product ID; not the MXMT canonical ID |
| `ProductPaymentAmount` | Sales amount in UAH |
| `ProductcostPriceAmount` | Cost amount in UAH |
| `product.manufacturer` | Source manufacturer, retained for diagnostics |
| `sajt` | Opaque source site/channel code used by Channel Analytics; displayed as `Site <code>` until a business-name mapping is configured |

### 3.3 ARTICLE REPORT source

The imported source worksheet is used for shadow comparison during rollout. It
is not the authority for calculated values after this feature is enabled.

The calculated tab exposes the fields defined in sections 7 and 8. Source-only
columns without an approved formula remain available as read-only passthrough
columns and are labelled as source values in the API metadata.

The following existing fields do not yet have approved MXMT formulas and must
not be silently recalculated:

- monthly columns `1` through `12`;
- `Last Delivery Date`;
- `Last Sales Date`;
- `Weeks in store`;
- `ROS`;
- order and price-scenario fields from `Order units (Заявки)` onward, except
  fields explicitly defined by this contract.

## 4. Canonical product identity and sale matching

The canonical report key is `Product YML 2.0.ID`. It is stored as text even
when it contains only digits. Numeric-looking IDs must never be discarded or
converted to floating-point numbers.

Every sale line is resolved in this order:

1. exact trimmed `ZAVOD_API.product.sku` to `Product YML.ID`;
2. case-insensitive `product.sku` to `Product YML.ID`, only when unique;
3. exact `product.parameter` to `Product YML.ID`;
4. exact `product.barcode`, then `product.sku`, to a unique
   `Product YML.Barcode`;
5. exact `product.sku` to a unique `Product YML.Article`;
6. exact `product.parameter` to a unique `Product YML.Article` or
   `Product YML.Vendor Code`;
7. a unique whitespace-compacted identifier match.

An ambiguous fallback does not stop resolution while a stronger exact or
otherwise unique candidate remains. For example, a shared article in
`product.sku` is disambiguated by an exact `product.parameter` product ID.

`ZAVOD_API.product.productId` is not compared directly with `Product YML.ID`,
because the observed values belong to different identifier systems. It may be
used as an import-local alias when another sale row establishes one unique
mapping to a canonical product.

If a fallback matches more than one product, the sale line is marked
`AMBIGUOUS_PRODUCT_MATCH` and excluded from calculations. If nothing matches,
it is marked `UNMATCHED_PRODUCT`. Import issues retain the source worksheet,
row number, attempted values, and source import ID.

Resolver normalization trims surrounding whitespace. Its final compact
fallback removes internal whitespace and compares case-insensitively, but does
not remove punctuation or leading zeroes.

## 5. Transaction inclusion rules

The following business rules are approved:

| `statusId` | Meaning | Calculation treatment |
| ---: | --- | --- |
| `5` | Sale | Included as a positive financial fact |
| `7` | Return | Included as a negative financial fact |
| `6` | Rejection | Excluded |
| any other value | Non-final/other status | Excluded |

`paymentDate` is the contractual sales date. When it is missing on a final
sale, `orderTime` is used as an inferred date; when it is missing on a return,
`updateAt` is used so the return is assigned to the date it was recorded rather
than the original order date. An `INFERRED_PAYMENT_DATE` informational issue is
stored for either fallback. A row without a valid explicit or inferred date
does not enter sales, return, period, or rolling-14-day metrics,
even if `orderTime` is present.

For a sale, quantity and amounts are normalized to positive absolute values.
For a return, quantity and amounts are normalized to negative absolute values.
This rule prevents a source sign convention from applying the return sign
twice.

Duplicate source rows are detected inside one source import. When `id` is
unique at line level it is the preferred identity. The observed ZAVOD export
uses the same `id` for multiple product lines of one order; in that layout a
deterministic hash of the full raw row is used so legitimate multi-product
orders are not discarded as duplicates. For a repeated identity, the first row
is included and only subsequent identical copies are excluded with a
`DUPLICATE_SALE_LINE` warning.

## 6. Time and report period rules

- Business timezone: `Europe/Kyiv`.
- `Date From` and `Date To` are local calendar dates, not UTC instants.
- The selected range is inclusive at both ends.
- `Date From` must not be after `Date To`.
- The default report period is the current calendar month in Kyiv.
- A calculation records an immutable `asOfDate` in Kyiv for reproducibility.
- `AVG Sales Last 2 week` uses the 14 completed local calendar days ending on
  `asOfDate - 1 day`; `asOfDate` itself is excluded.
- The rolling 14-day window is independent of the selected `Date From` and
  `Date To`, as required by the calculation specification.

## 7. ARTICLE REPORT row set and base fields

There is one calculated row for every valid unique `Product YML.ID` in the
active source import, including products with no sales.

Base fields are mapped as follows:

| ARTICLE REPORT field | Source or rule |
| --- | --- |
| `ID` | `Product YML.ID` |
| `Article` | `Product YML.Article` |
| `Name` | `Product YML.Name` |
| `Brand` | `Product YML.Vendor` |
| `Category` | `Product YML.Category` |
| `Cost Price` | `Product YML.Vendor Price` |
| `Retail Price` | `Product YML.Price` |
| `Stock units` | `Product YML.Stock Qty` |

Blank brands and categories remain `null` in stored results. In grouped report
UI they are displayed as `Без бренда` and `Без категории` respectively.

## 8. ARTICLE REPORT formulas

All formulas operate on full-precision decimal values. A division whose
denominator is zero or null returns `null`.

| Field | Formula |
| --- | --- |
| `RRP` | `Old Price` when present; otherwise `Retail Price` |
| `Discount` | `Retail Price / RRP - 1` |
| `GM%` | `1 - Cost Price / Retail Price` |
| `Sales, units` | Net sum of normalized transaction quantity for the product and selected period |
| `Sales, UAH` | Net sum of normalized `ProductPaymentAmount` for the product and selected period |
| `Cost of Sales, UAH` | Net sum of normalized `ProductcostPriceAmount` for the product and selected period |
| `GP UAH` | `Sales, UAH - Cost of Sales, UAH` |
| `Sales GM%` | `1 - Cost of Sales, UAH / Sales, UAH` |
| `Stock UAH` | `Cost Price * Stock units` |
| `STR%` | `Sales, units / (Sales, units + Stock units)` |
| `AVG Sales Last 2 week` | Net sales units in the rolling 14-day window divided by `2` |
| `WOH` | `Stock units / AVG Sales Last 2 week` |

Returns may make net sales, STR, margin, or related values negative. The engine
does not clamp valid calculated values to zero. A negative or otherwise unusual
result is exposed and may also generate a non-blocking data-quality warning.

## 9. BY BRAND formulas

`BY BRAND` groups the calculated ARTICLE REPORT rows by the exact `Brand`
value. It does not recalculate source transactions independently.

| Field | Formula per brand |
| --- | --- |
| `Brand` | Group key |
| `Sales, UAH` | `SUM(ARTICLE REPORT.Sales, UAH)` |
| `Sales, units` | `SUM(ARTICLE REPORT.Sales, units)` |
| `Cost of Sales, UAH` | `SUM(ARTICLE REPORT.Cost of Sales, UAH)` |
| `GP UAH` | `SUM(ARTICLE REPORT.GP UAH)` |
| `Stock units` | `SUM(ARTICLE REPORT.Stock units)` |
| `Stock UAH` | `SUM(ARTICLE REPORT.Stock UAH)` |
| `STR% units` | `SUM(Sales, units) / (SUM(Sales, units) + SUM(Stock units))` |
| `% Sales` | `Brand Sales, UAH / Sales, UAH across all brands` |
| `WOH` | `SUM(Stock units) / SUM(ARTICLE REPORT.AVG Sales Last 2 week)` |

The engine must not average item-level STR or WOH values.

## 10. BY CATEGORY formulas

`BY CATEGORY` uses the same fields, null behavior, and aggregate formulas as
`BY BRAND`, replacing the group key `Brand` with `Category`.

## 11. Precision and presentation

Calculations and stored report results use decimal types. Values are not
rounded between calculation stages.

Default UI/export formatting:

| Value type | Display |
| --- | --- |
| UAH amount and unit price | 2 decimal places |
| Quantity | Up to 4 decimal places, without unnecessary trailing zeroes |
| Percentage/ratio | Percentage with 2 decimal places |
| WOH | 2 decimal places |
| Date | Local calendar date |
| Null | `—` in UI, empty cell in export |

Formatting does not change the stored decimal value.

## 12. Blocking validation and non-blocking issues

An import cannot become active when any of these conditions is true:

- `Product YML 2.0` or `ZAVOD_API` is missing;
- a required header is missing;
- `Product YML.ID` is blank or duplicated;
- the workbook exceeds configured size or row limits;
- raw staging or typed projection is incomplete;
- another active import holds the tenant/source import lock.

The following conditions produce visible issues but do not necessarily block
activation:

- unmatched or ambiguous sale line;
- missing optional brand, category, article, or vendor code;
- invalid transaction date on a non-final status;
- negative calculated metric caused by net returns;
- material row-count change relative to the previous successful import;
- mismatch between MXMT shadow calculations and the source ARTICLE REPORT.

No row may be silently discarded. Every excluded final transaction must have a
machine-readable reason and source-row reference.

## 13. Calculation cache identity

A calculated result is immutable and identified by:

```text
tenantId + sourceImportId + dateFrom + dateTo + asOfDate + calculationVersion
```

Changing formulas increments `calculationVersion`. Activating a new source
import makes calculations from the previous source import historical rather
than current.

Current implementation version: `2` (`ARTICLE REPORT`, `BY BRAND`, and
`BY CATEGORY` are persisted as one complete calculation result).

## 14. Reference examples

### 14.1 Product formulas

Given:

```text
Retail Price = 80
Old Price = 100
Cost Price = 50
Stock units = 10
```

Expected:

```text
RRP = 100
Discount = -20.00%
GM% = 37.50%
Stock UAH = 500.00
```

If `Old Price` is blank, `RRP = 80` and `Discount = 0.00%`.

### 14.2 Sales and returns

For the selected period, given two completed sales with quantities `2` and `1`
and one return with quantity `1`:

```text
sale amounts = 160 + 80
return amount = 80
sale costs = 100 + 50
return cost = 50
```

Expected:

```text
Sales, units = 2
Sales, UAH = 160
Cost of Sales, UAH = 100
GP UAH = 60
Sales GM% = 37.50%
STR% with Stock units 10 = 16.67%
```

### 14.3 Rolling velocity and WOH

Given net rolling-14-day sales of `6` units and stock of `10`:

```text
AVG Sales Last 2 week = 6 / 2 = 3
WOH = 10 / 3 = 3.333333...
Displayed WOH = 3.33
```

### 14.4 Weighted brand aggregation

Given one brand with:

```text
Product A: Sales units 2, Stock units 10, AVG last 2 weeks 3
Product B: Sales units 3, Stock units 5, AVG last 2 weeks 2
```

Expected:

```text
Brand Sales units = 5
Brand Stock units = 15
Brand STR = 5 / (5 + 15) = 25.00%
Brand WOH = 15 / (3 + 2) = 3.00
```

## 15. Reconciliation and acceptance criteria

Before production activation, a shadow calculation must satisfy:

1. every active `Product YML.ID` has exactly one calculated ARTICLE REPORT row;
2. every included sale/return line resolves to exactly one product;
3. excluded final transactions are listed as import issues;
4. ARTICLE REPORT totals equal the corresponding sums of included normalized
   sale lines for the selected period;
5. BY BRAND and BY CATEGORY totals reconcile to ARTICLE REPORT totals;
6. `% Sales` across all non-null groups is approximately 100%, subject to the
   zero-total rule and display rounding;
7. results are identical when the same calculation is repeated with the same
   cache identity;
8. a failed import or calculation never replaces the last successful visible
   snapshot;
9. tenant data is isolated in imports, issues, calculations, preferences, and
   APIs;
10. observed differences from the source ARTICLE REPORT are reported by field,
    product ID, and amount rather than overwritten silently.

## 16. Approved decisions

The following decisions were approved before implementation:

- use `paymentDate` as the sales date, with `orderTime` fallback for sales and
  `updateAt` fallback for returns when it is missing;
- include status `5` as sales, subtract status `7` as returns, and ignore status
  `6` plus all other non-final statuses;
- calculate `Stock UAH` as `Vendor Price * Stock Qty`;
- calculate BY CATEGORY using the same metrics as BY BRAND;
- use the current Kyiv calendar month as the default report period;
- preserve the existing database and deliver the feature through additive
  migrations;
- implement, verify, commit, and push each project step separately.
