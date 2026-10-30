# Cabinet-scoped Google Sheets connections

## Problem and change

Previously manual raw imports, legacy sync and the daily pipeline downloaded the
global `GOOGLE_DRIVE_FILE_ID` for any authenticated cabinet. Registering a demo
cabinet did not isolate its input workbook.

Settings now accepts a Google Sheets URL for the authenticated cabinet. The
binding is versioned in the existing `MerchandisingConfig` GENERAL records under
`settings:google-sheets`. No schema migration or database changes are required to
deploy the code. Saving a binding requires a same-tenant ADMIN, a tenant lock and
the expected revision; previous revisions remain available for audit.

Both raw import and legacy sync resolve the cabinet binding before downloading.
Cron resolves through the same raw import function; it no longer requires a
global workbook to run cabinet-specific connections. A raw import alone does
not authorize global-file inheritance. The global fallback applies only to an
already approved mapping for the exact tenant and file. Explicit bindings take
precedence and malformed bindings fail closed.

Data & Reports shows the next import URL and disables import until a binding is
available. If saved raw data came from a different spreadsheet, it is labelled
as the previous import. Saving does not select an MVP reporting source, approve
a mapping, delete history, or launch an import.

Authenticated Drive downloads inspect MIME type: native Sheets use Drive export
to XLSX, while uploaded Excel files retain media download. Public-link reads
retain the existing read-only path. Native Drive exports have Google's 10 MB
limit: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export

## Validation

- Full suite before the additional API cases: 180 files passed, 1,781 tests
  passed and one skipped. Includes isolated PostgreSQL fixtures reproducing the
  original plus accidental-demo source, revision conflicts and foreign actors.
- TypeScript passes.
- Production build via `next build --webpack` passes using dummy database URLs.
- Default Turbopack build could not finish in this execution environment because
  its PostCSS subprocess could not bind a service port (EPERM). The configured
  production build command was not changed.
- No production configuration, import, source selection or customer data was
  mutated during implementation.

## Release and recovery

1. Before deployment, confirm the real cabinet has its approved mapping for the
   global workbook. Otherwise save its exact original URL explicitly after
   deployment; legacy clients without approval now require an explicit binding.
2. Deploy the reviewed code to the intended Vercel project. Preserve global
   file ID and service-account credentials; do not replace global ID with demo.
3. In the demo cabinet, save the demo URL and verify Next import before running.
4. Confirm exact tenant/source/run identities before dealing with the accidental
   raw import. Do not delete the real workbook or another cabinet's records.
   The code intentionally does not perform an automatic cleanup.
5. Import the demo, review/approve mapping, select its source and explicitly
   refresh MVP reports. Supplier receipts/history support remains a separate
   task; this change does not claim to activate all five screens.

Rollback retains versioned bindings and raw history, but reverting to old code
restores the unsafe global-file behavior. Keep imports paused in unconfigured
demo cabinets during any rollback.
