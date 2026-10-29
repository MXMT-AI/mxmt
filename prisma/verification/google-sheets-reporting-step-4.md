# Google Sheets reporting — step 4: application integration

Based on step 3 (`090e8be`) on `feat/google-sheets-reporting-source`.
This step connects the administrator's Data & Reports workflow to the native
Sheets projection and verifies all five MVP screens against actual synthetic
projected inputs. It does not approve a live Zavod mapping or activate a source.

## Application workflow

An administrator approves the mapping in Settings and explicitly selects the
Sheets source for reporting. The Sheets view in Data & Reports remains a view;
it never implicitly switches the tenant reporting source.

Import now runs independent requests:
1. Save the raw workbook through `/api/data/import` with `calculate:false`.
2. Read the selected reporting source, capture its current projection intent and
   submit it to the existing bounded Sheets projection endpoint.
3. Calculate the existing Data & Reports tabs through `/api/data/calculate`.

A failure of either reporting path cannot roll back the saved raw workbook or
prevent the other reporting path from being attempted. Messages distinguish MVP
projection problems from legacy tab calculation problems. The screen reloads
saved status/tables even after a partially successful action.

Recalculate follows the same independent MVP/legacy paths for administrators.
Analysts retain their existing legacy calculation permission; projection remains
an ADMIN operation. The separate `Refresh MVP reports` button works with a saved
import and does not fetch the spreadsheet or run legacy formulas. Successful
projection offers an Overview link; each MVP screen creates/reads its existing
consistent snapshot when opened. Preview calculators and external actions remain
subject to their existing evidence gates.

`GET /api/connectors/sheets/projection/:sourceId` returns only the current fenced
intent `{sourceId, importRunId, mappingId, selectionRevision}` to a signed ADMIN.
It rechecks actual tenant membership, mapping and selection. The client submits
exactly that intent; a different run after raw import is rejected. Selecting
SalesDrive or having no selected source skips Sheets projection. Neither client
path creates approvals or silently selects Google Sheets.

## Shared calculations and freshness

The existing recalculation consumer now additionally claims native selected Sheets
sources, locking the DataSource and rechecking live leases. Only the active import's
intent is consumed. Daily and Sales remain separate bounded phases using the same
engines as existing connectors. Final publication retains lease/state/tenant/source
fences for both native and remote sources; no fake connector row is introduced.

A changed Sheets projection resets its recalculation intent, clears old leases and
phase result IDs, and updates the requested timestamp. An identical replay does
not reset a completed intent.

Screen freshness now includes the selected Sheets raw import ID, checksum and
projection input hash. Replacing/removing a raw import or reprojection makes an
older immutable snapshot SOURCE_CHANGED instead of presenting it as current.
SalesDrive's source-state shape and calculation behavior remain unchanged.

The five-screen integration test uses mapping preview/approval, explicit source
selection and the real Sheets compiler/publication, then creates a shared screen
snapshot and reads Overview, Sales, Stock, Repricing and Reordering. It confirms
all five use the same native source/snapshot without a ConnectorConnection row.
Unconfirmed history remains unconfirmed rather than becoming a fabricated complete
coverage window. Existing financial/business formulas are reused.

## Scope boundaries

This is the manual administrator application path. Direct raw-import API calls and
scheduled legacy Sheets imports still save raw data only; they do not borrow an
administrator's identity to activate new projections. Such imports require an
explicit MVP refresh before becoming projection-ready. Automatic projection under
a service identity is not introduced by this step.

Detailed source-readiness/empty/error UX is step 5. Real Zavod and SalesDrive
end-to-end acceptance, agreed business evidence and production latency checks are
step 6. No live mapping, selection, schema or CRM action was changed here.

## Verification

Targeted tests cover native five-screen reads, shared recalculation phases, stale
snapshot detection, recalculation replay/reset, signed intent access, explicit
source selection, stale run rejection and mapping-required handling. Existing
remote recalculation regressions also pass.

The new button was visually inspected in local Chrome on Data & Reports, alongside
the real saved raw table. Import/projection buttons were not executed against the
customer database during this visual check. UI controls and styling reuse the
existing workspace patterns.

Final full offline suite: 157 files / 1,577 tests passed. TypeScript and the
isolated production build passed; the build used synthetic JWT values without
production environment files. Git whitespace checks passed. No commit or push
is part of this step's handoff.
