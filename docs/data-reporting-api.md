# Data Import and Reporting API

All endpoints require the existing access-token authentication and derive
`tenantId` from the authenticated user. Tenant identifiers are never accepted
from request bodies or query strings.

## Pipeline actions

### `POST /api/data/import`

Role: `ADMIN`.

Downloads the configured Google workbook, performs the atomic raw and typed
import, then calculates all three reports by default.

Optional JSON body:

```json
{
  "calculate": true,
  "dateFrom": "2026-08-01",
  "dateTo": "2026-08-31",
  "asOfDate": "2026-08-27"
}
```

### `POST /api/data/calculate`

Role: `ANALYST` or higher.

Calculates reports for the active import or an explicitly selected historical
import. The body accepts optional `importRunId`, `dateFrom`, `dateTo`, and
`asOfDate` fields.

## Status and diagnostics

### `GET /api/data/status`

Returns source configuration, the active and latest import runs, the latest
calculation for the active import, issue counts, and available table keys.

### `GET /api/data/issues`

Query parameters: `importRunId`, `severity`, `code`, `page`, and `pageSize`.
The default import is the active import. Maximum page size is 200.

## Table data

### `GET /api/data/tables/{sheetKey}`

Allowed table keys:

- `product_yml`
- `zavod_api`
- `article_report`
- `by_brand`
- `by_category`

Query parameters: `page`, `pageSize`, `search`, `sort`, `direction`, optional
`importRunId`, and optional `calculationRunId`.

The response contains column metadata, rows, pagination, and import/calculation
context. Decimal values are serialized as strings so the client does not lose
precision. `ARTICLE REPORT` source-only columns use the `source_` prefix and
are hidden by default.

## User table preferences

### `GET /api/data/preferences/{sheetKey}`

Returns the current user's saved visible columns, page size, and sort.

### `PUT /api/data/preferences/{sheetKey}`

Accepts:

```json
{
  "visibleColumns": ["productId", "name", "salesUah"],
  "pageSize": 50,
  "sortColumn": "salesUah",
  "sortDirection": "desc"
}
```
