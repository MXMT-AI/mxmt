# Scenario CSV exports and action history (#48)

Baseline: `a30856e` (merged #47). Branch: `feat/48-scenario-csv-exports`.
Authority: approved MVP decisions D09, D19 and D20, and the versioned calculators
from #44 and #46. No migration is required; exports reuse `MerchandisingAction`.

## CSV and scenario contract

Repricing columns, in order:
`sku;barcode;brand;category;name;old_price;new_price;discount_pct;promo_days;reason`.
The export contains the full final selected set, independently of table pagination.
Prices, effective discount percentage and duration come from the server calculation;
manual prices and cost-floor/liquidation decisions remain represented in the audit.
The existing calculator permits only eligible own-stock UAH rows.

Reordering columns, in order:
`supplier;sku;barcode;name;qty;unit_cost;sum`.
Only positive export-eligible recommendations enter files. Off-season and zero rows
are excluded. Unknown transit, invalid costs or unresolved purchase terms continue
to block the affected scope. Supplier identity is tenant-scoped; files are grouped
by stable supplier ID **and currency**, preserving the calculator's currency boundary.
The workspace supports exporting the entire ready scenario or one explicitly chosen
ready supplier/currency group. An unresolved group cannot be silently omitted from
an entire-scenario export. Each file has a separate native download link.

Files use UTF-8 BOM, semicolons, CRLF record endings and quoted fields with doubled
embedded quotes. Text formula initiators, including invisible/full-width prefixes,
are neutralized with an apostrophe. Trusted numeric cells accept only plain decimals;
negative numeric values are preserved. Leading-zero identifiers retain their bytes.
The protection covers the generated file, not transformations made by external
spreadsheet software after import or resave. Format/security references:
[CSV quoting](https://www.rfc-editor.org/rfc/rfc4180) and
[OWASP CSV injection](https://owasp.org/www-community/attacks/CSV_Injection).

## API, authorization and atomic history

- `POST /api/merchandising/exports`: ANALYST or higher; accepts only an export UUID,
  kind (`reprice`/`reorder`), expected preview identity, the existing scenario intent,
  and an optional reorder supplier/currency target. Body limit: 4 MiB.
- `GET /api/merchandising/exports?kind=…`: VIEWER or higher; returns the latest ten
  tenant-owned receipts, without CSV bodies or complete audited rows.
- `GET /api/merchandising/exports/{exportId}?fileId=…`: ANALYST or higher; private,
  non-cacheable UTF-8 attachment with the original stored bytes and byte length.

The signed session supplies tenant and actor; payload fields cannot override them.
Generation recalculates the complete scenario from frozen inputs in a repeatable-read
transaction and rejects a mismatched preview. It never joins mutable current values
into the accepted file. One transaction publishes the files plus `reprice`/`reorder`
action, parameters/filters, selected rows, totals, actor, time, snapshot/input-set IDs,
calculation version and file hashes. No CRM prices or supplier orders are changed.

The tenant-scoped `export:<UUID>` idempotency key and unique constraint prevent duplicate
actions. The same actor and normalized request replay the same receipt and bytes;
page changes do not change export intent. A conflicting actor/request returns 409.
The browser retains an uncertain attempt's ID for retry, locks concurrent submissions,
and starts a new ID only after a successful generation or changed scenario identity.
File downloads and history reads never create actions. History records successful
**file generation**, not a claim that the user saved a file to disk.

Individual files and their combined content are limited to 4 MiB; receipt metadata
to 256 KiB and the stored audit payload to 16 MiB. These limits fail before publishing
an action, keeping downloads and ten-entry history responses bounded. File links in
the UI are paged ten at a time. VIEWER users retain previews/history but have disabled
export controls and no download links. Shared components and server calculators are
reused; no browser-side financial or CSV calculator was added.

## Validation

Automated checks cover BOM/escaping/localized multiline text, formula prefixes,
column order, effective selected prices, off-season/zero exclusions, supplier/currency
scope, UTF-8 size limits, whole-scenario exports across pages, immutable byte replay,
conflicting actor/intent, concurrent retries, atomic failure, tenant isolation,
signed-session roles, request/query bounds, response headers and localized history.
Integration tests use migrated PGlite with synthetic data, not the customer benchmark.

Browser checks used a temporary local fixture with the real editors, shell, export
hook and server calculators/export store backed by isolated PGlite. Repricing prepared
and downloaded ten selected rows; downloaded bytes had BOM `EF BB BF` and the approved
header. Reordering's supplier export downloaded two rows (39 and 5 units, 390 and 50
UAH), matching the 44-unit/440-UAH preview while omitting the zero recommendation.
The journal showed action kind, actor and timestamp, and retained working download
links. Keyboard focus reached a history download link. A VIEWER fixture disabled both
global and supplier exports. Desktop viewport: 1280 × 720. Mobile viewport and external
Excel/CRM import acceptance were not rerun for this task. The existing workspace layout
was retained; no new reference layout was introduced. Temporary routes/servers were
removed/stopped before production validation. Production data and infrastructure were
not changed.

Final checks: `npm test -- --maxWorkers=1` passed **936 tests across 81 files**;
`npm run build`, `npx tsc --noEmit` and `git diff --check` passed. An earlier parallel
rerun hit two database setup-hook timeouts; the final serial run completed with no
failures or skipped tests. The initial parallel run before the final size-bound test
also passed (935 tests).
