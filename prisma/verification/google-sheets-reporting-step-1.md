# Google Sheets and SalesDrive reporting — step 1

## Approved direction

The owner requested step-by-step implementation of a shared path for Google Sheets
(Zavod) and SalesDrive to power Overview, Sales, Stock, Repricing and Reordering.
Use existing calculators, components and import/provenance infrastructure. One
explicitly selected reporting source per tenant; no implicit source aggregation.

Implementation sequence:
1. Define a shared reporting-source contract — implemented in this branch.
2. Add Google Sheets mapping preview and validation — next.
3. Project Google Sheets imports into shared merchandising facts — pending.
4. Enable all five MVP screens for the selected reporting source — pending real-data integration.
5. Show actionable source readiness and data-quality states — pending screen UX; settings gates prepared.
6. Validate Zavod and SalesDrive end-to-end reporting — pending real-data acceptance.

Branch: feat/google-sheets-reporting-source, based on main 075b718.
No commit/push or live configuration/activation is part of this handoff.

## Contract and source identity

`ReportingSourceProvider` distinguishes Sheets reporting from remote connector
registration. Existing `SourceProvider`/adapter registrations remain unchanged;
Sheets is not registered as an empty SalesDrive/CSV connector. Existing Sheets
DataSource IDs, tenant, file ID, timezone, raw imports and report provenance are
retained. No duplicate DataSource, fabricated credential or ConnectorConnection
is created. The list API exposes only safe source choices, not file contents/keys.

`GET /api/connectors/source` adds the tenant's existing Sheets choices to the same
response used by Settings. A shared typed contract gives each choice `selectable`
and `readiness`: CONNECTION_CHECK_REQUIRED, MAPPING_REQUIRED, IMPORT_REQUIRED or
READY. A checked remote connector without a completed successful/warning order
import is import-required; access approval alone is not imported data.

Saving/importing a Sheets file never changes source selection. The existing
SalesDrive default remains exact when no explicit selection exists; a Sheets-only
tenant has no implicitly selected merchandising source. The resolver obtains the
selected native Sheets or connector identity in one SQL query. Navigation channels
use that exact tenant/source rather than requiring a remote connection row.

## Selection and approval gates

The existing ADMIN selection endpoint is reused. Its store also checks actual
same-tenant ADMIN/SUPER_ADMIN membership under the tenant lock, so a direct call
cannot bypass role checks. Optimistic selection revisions and source-change audit
remain shared. Switching away and back increments the revision; old scenario
preconditions continue to fail, and no import or calculation is started by selection.

Sheets selection requires an active approved SOURCE_MAPPING at `sheets:<sourceId>`
with approver/reference and versioned envelope `{sheets:{version:1,fileId}}` for the
exact DataSource file. Step 2 will implement full field/policy validation and its
owner approval flow; reference strings or existing raw data do not create approval.
This branch exposes no new mapping-write or projection-activation endpoint.

A successful legacy raw import alone never makes merchandising facts ready.
The active same-tenant/same-source SUCCESS/WARNING import must carry a server-written
`stats.merchandisingProjection` manifest with version 1 and exact sourceId,
importRunId and approved mappingId. Step 3 will write this only after completed
projection. Replacing the active import, changing/deactivating mapping or changing
the file removes readiness. The manifest identifies projection publication; it is
not a completeness claim for every metric, prior-year window or recommendation.

New financial/daily calculations reject Sheets before mapping/projected facts are
ready with SHEETS_MAPPING_REQUIRED/SHEETS_IMPORT_REQUIRED. They cannot silently
substitute the old Sheets calculator or consume unmatched legacy rows. Existing
raw Sheets reporting stays independent. Runtime/provider workers are not activated.

## UI and reuse

Settings reuses ConnectorSourceCard, shared Field/control styles, localization,
keyboard focus, signed API and existing optimistic activation action. Sheets is
labelled Google Sheets and blocked choices explain mapping approval instead of a
misleading access error. Import-required choices can be selected after approval,
because source selection must precede importing into the shared model.

The Google Sheets/SalesDrive tabs in Data & Reports still select a view; they do
not change tenant-wide financial source. Step 5 must clarify that distinction in
the reporting hub and screen empty states. No unseen visual reference or new design
system is introduced.

## Verification

- Full offline suite: 151 files / 1,525 tests passed.
- The final additional synthetic parity regression also passed; all 9 targeted
  Sheets-source tests passed after it was added.
- TypeScript passed; production build passed in a separate temporary source copy
  with synthetic JWT values and no production environment. The existing local dev
  server was not stopped for the build.
- Cases cover tenant/role isolation, no implicit activation, mapping approval/file
  identity, stale selection revisions, exact audit count, raw-import rejection,
  projection/mapping identity gates, remote readiness and Sheets/SalesDrive parity
  for identical synthetic projected financial/daily/navigation facts.
- No production query/mutation, real-sheet import, source activation, new migration,
  provider call or customer-data acceptance was performed by step 1.

This is the source-contract foundation. It does not yet populate the five screens
from the actual Zavod workbook; steps 2–4 provide that integration.
