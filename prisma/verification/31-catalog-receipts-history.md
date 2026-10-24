# SalesDrive catalogue, receipts and observed stock history (#31)

## Source and authority

Apply approved decisions D08/D17/D21/D22 from #27. Customer-specific E02/E03
verification remains required before financial activation. This change does not
activate a reporting/calculation profile or reconstruct historical stock.

The [official YML guide](https://salesdrive.ua/knowledge/api/get-products-from-yml/)
describes a current, automatically refreshed export. The
[export currency documentation](https://salesdrive.ua/blog/product-export-xml-yml-rounding-currency/)
confirms that export prices can be converted into a different currency. Never
assume feed and receipt currencies are interchangeable. Native field population,
posting statuses and supplier/product identity still require customer samples.

The [official OpenAPI](https://api.salesdrive.me/swagger/openapi-uk.php), verified
October 24, 2026, identifies `/api/arrival-product/list/`, account-level arrivals
read permissions, `filter[updatedAt][from/to]` and document types 1–4. Preserve
supplier receipt, transfer, write-off and inventory adjustment separately.
The audited schema SHA-256 remains
`44a6c30a2aaa466cbf7cdf5cb0225a0ad3b1c7cabacaa5a907bad1114653110e`.

## Mapping and data safety

| Input | Stored facts |
| --- | --- |
| YML `offer/@id` | Source product alias and raw offer identity |
| `vendorCode` (fallback `article`) | Article/source SKU and canonical SKU alias |
| `name_ua` / `name` | Product name; source ID is a display fallback |
| `price`, `oldprice` | Decimal retail/reference prices and changes |
| `quantity_in_stock`, `offer/@available` | Exact observed quantity and separate availability metadata; availability does not imply zero stock or retirement |
| `categoryId`, category dictionary | Namespaced canonical category and source metadata; category seasons remain unverified |
| `vendor`, `barcode` | Vendor/brand and barcode facts; no inferred ownership, supplier terms or commission |
| Optional `vendorprice` | Retained source fact, not the procurement-cost fallback |
| Receipt `id`, `date`, `updatedAt`, `type`, `status.id` | Current movement, source date precision, stale-version guard and raw provenance |
| `counterparty.id/title` | Source counterparty fields; a canonical supplier association needs an approved tenant mapping |
| `documentItems[].product.id/parameter/sku`, `count`, `price` | Explicit identity candidates, source SKU, exact quantity and unit-cost facts |

Safe integer JSON IDs remain numbers; larger integer/decimal tokens remain exact
strings using the existing lossless parser. Raw API pages and receipt documents
remain private. Original XML is retained for each observation, even when its
content is unchanged. Response bounds and DTD/entity rejection from #29 remain.
Duplicate product IDs/articles, conflicting canonical identities, malformed XML
or unsupported numeric precision block the entire catalogue activation.

Existing source product/SKU aliases and exact canonical SKUs are reused. Missing
articles use a namespaced, explicitly derived identity; no real article is
invented. Existing brand ownership/terms are preserved. A new vendor brand has
unknown ownership and explicit `UNKNOWN` base currency: feed currency is not
proof of a supplier's or brand's base currency. Supplier terms remain unverified.
Conflicting receipt aliases remain unresolved rather than selecting one.

Canonical `Sku.priceRetail/pricePurchase` and legacy integer `qtyOnHand` become
nullable so unknown prices/quantities do not require zero placeholders. New
snapshot `quantity`, prices and values use Decimal. Integer compatibility fields
are populated only when exactly representable; existing legacy values are not
rewritten by the migration. Legacy Float prices remain compatibility fields;
new financial consumers must use Decimal snapshot/history facts.

## Verified receipt and cost policy

Only an approved active `SOURCE_MAPPING` row with key `salesdrive:<sourceId>` can
verify posting and purchase-cost semantics. Extend its values with the following
shape after E02 verification (example only, not an account default):

```json
{
  "receipts": {
    "postedStatuses": ["2"],
    "suppliers": { "42": "tenant-owned-canonical-supplier-id" },
    "productIdField": "parameter",
    "currency": "UAH",
    "unitCostVerified": true
  }
}
```

`productIdField` is `id` or `parameter`; the source SKU remains an independent
identity candidate. Status `2`, counterparty `42`, the currency and identity field
above must be replaced with verified customer values. Canonical supplier IDs are
looked up inside the authenticated tenant; foreign IDs cannot verify posting.
Configuration approval does not itself prove document status or price semantics.

Only type-1 external receipts with a mapped supplier, approved posting status and
usable receipt date establish `firstReceiptAt`. Internal movements never establish
or reset this cohort. Replaying/revoking posting recomputes the first receipt from
current verified external documents, including previously linked SKUs.
Date-only receipt values retain day precision; their UTC boundary is not an
observed arrival time. Interpret cohort calendar dates in the source timezone.

Unit purchase cost must be separately verified, positive and currency-compatible.
Zero cost remains unavailable without a future explicit exception policy. The cost
for a current stock observation uses:

1. The latest verified external receipt purchase price at/before the observation.
2. Otherwise, the latest paid SALE's source `costPrice`, only when #30's approved
   per-unit cost mapping produced a verified cost amount and currencies agree.
3. Otherwise null, with a data-quality diagnostic; never the optional YML cost,
   zero, an exchange-rate guess or an internal movement price.

Tied latest receipts/sales with conflicting costs cannot establish one latest unit
price. No document-ID ordering or weighted-cost rule is invented. Date-only
receipt ties therefore require equal verified prices. Cost provenance includes
receipt/order identities, raw record keys, input run IDs and source dates.

Negative stock/movement quantities remain explicit data-quality exceptions. They
do not establish purchase cohorts/cost. Negative stock has null inventory values,
not a fabricated zero or a negative capital total. Quantity remains the source
fact for subsequent validation/classification work.

## Queue, checkpoints and atomic activation

Reuse #30's PostgreSQL jobs, shared account request budget, expiring/fenced leases,
retry/backoff, credential-change pause/resume, import runs, raw records and issues.
Shared lifecycle and API/RBAC handlers now serve both resources. Existing jobs get
`resource=orders`; the new resource is `inventory`, mode `REFRESH`. Workers and
progress queries filter their resource. One source admission lock prevents
simultaneous unfinished imports; recover a failed job before starting another.

An inventory job reads receipts in bounded pages of 25, then fetches one complete
YML observation. Initial receipt import reads the available history; subsequent
imports use the successful `updatedAt` cursor with a two-hour overlap and a fixed
upper bound. A changed approved receipt-policy hash forces full receipt replay so
old unverified records are not skipped. Policy values are frozen in the job.
Unconfigured receipt access is diagnosed and cannot advance a receipts cursor.
Invalid receipt quantities, costs, precision overflow or duplicate line identities
quarantine the whole document: its raw record is retained, no receipt lines are
partially replaced, and `INVALID_RECEIPT_LINE` is exposed for review. Other receipts
and the current catalog observation continue. A previously accepted version remains
unchanged. Correct the document in SalesDrive and update its source timestamp so
the next incremental import can process it; unrelated storage failures still retry
the page without advancing its checkpoint.

Products and quantities must belong to the same observation. Parse/validate the
entire feed, then use transaction-local staging and set-based catalogue writes.
Metadata, aliases, daily snapshots, price events, active catalogue pointer, run
status and final checkpoint commit atomically. A late failure or lost lease rolls
back the complete activation. Receipt pages already imported remain valid
independent movements; a broken feed cannot replace the last active catalogue or
its stock snapshots. Older observations cannot overwrite newer catalogue facts.
The 45-second transaction deadline remains inside the 60-second worker budget.

One snapshot exists per tenant/SKU/source-business date. A later same-day pull
updates that row to the newer actual observation with its provenance. No previous
23:59 or backdated stock is manufactured. Missing quantity/price is null; omitted
SKUs are unobserved, not assumed out of stock. Known fractional quantities remain
exact. Monetary value overflow stays null with a per-snapshot diagnostic.

`price_history` changes only when retail price, old price, derived unit cost or
currency changes. Changes to unknown prices are retained; repeated equal prices
and retries add no history event. Initial completely unknown prices add no event.
Feed observation time is recorded; an effective price-change time is not invented.

## Operations on Vercel Hobby

- `GET /api/connectors/salesdrive/inventory`: authenticated tenant progress,
  warnings and coverage (first/last observation, recorded days, missing days).
- `POST` there: ADMIN/SUPER_ADMIN actions `start`, `resume`, `step`.
- `GET /api/cron/salesdrive-inventory`: `Authorization: Bearer <CRON_SECRET>`;
  processes one receipt page or one atomic catalogue observation. `processed`
  means an attempt was made, not that the import completed; inspect persisted
  progress for errors, retry time and completion.
- Settings reuses the existing localized import card, polling and recovery
  controls. Viewers can inspect progress/coverage without import write access.

Hobby keeps its two existing daily Sheets cron slots. No subdaily Vercel schedule
is added. After deployment/configuration, a trusted external scheduler must call
this protected worker once per minute (in addition to the orders worker if used).
Use its secret storage for the bearer header; never put credentials in a URL.
Manual Settings steps remain available until that scheduler is configured.
Recurring automatic enqueue/03:00 Kyiv policy remains #32; this worker drains
explicitly queued jobs. No external scheduler was provisioned in this task.

Apply the versioned migration on an isolated database first, using the normal
reviewed deployment workflow. Do not run the pre-use #28 rollback against this
populated extension. After activation, use a verified restore/forward-fix plan;
reinstating NOT NULL would fail on legitimate unknown values introduced here.
No production migration, customer import, webhook registration or hosting change
was performed during implementation.

## Verification and activation gates

Real PostgreSQL/PGlite tests replay every migration and execute production SQL.
Coverage includes repeat imports, status/type separation, posting revocation,
first-receipt recomputation, receipt-to-sale cost fallback, unknown/negative stock,
price changes and null transitions, source-timezone business dates, stale
observations, tenant/source isolation, late transaction rollback, resource-specific
queue claims, failed YML recovery and policy-change replay. A 10,000-product feed
activates in one transaction without per-product remote requests. API tests cover
JWT/RBAC, forged identity fields, sanitized errors and cron authorization. Existing
order-import tests continue to exercise the extracted shared lifecycle.

Browser checks use the actual component with synthetic responses, not production:
English/light and Ukrainian/dark, 390/320 px, keyboard disclosure, empty/viewer
state, recovery and source-busy error handling. UI follows existing Settings
reference tokens and layout, using the requested UI/React skills and DRY.

E02/E03 remain open: validate actual YML/currencies, account scope/quota/timezone,
receipt posting and product/counterparty mappings before financial activation.
The source does not promise stable snapshot pagination for receipts: reconcile
with a frozen export before accepting the baseline. Historical inventory before
recorded observations remains unavailable; missing days are reported explicitly.

Final local validation (2026-10-24):

- `npm test`: 36 files, 299 tests passed.
- `npx tsc --noEmit`: passed.
- `npx prisma validate`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Migration SQL matches the generated Prisma schema diff before appended checks.
- Browser source-busy message, responsive/read-only and recovery states passed
  using synthetic fixtures; no live customer account was exercised.
