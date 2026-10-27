# Second-client monobrand onboarding (#50)

Baseline: `e5b0e79` (merged #49). Branch: `feat/50-monobrand-onboarding`.
Scope agreed for this task: prepare reusable code, verification and handoff; the
owner will create/connect the live Bimba account later. No live client, credentials,
production configuration, import or deployment was created by this task.

## Reused onboarding and policy contracts

Registration continues to create a separate tenant and its ADMIN through the
existing `/register` flow. Credentials, connector settings, source mappings, roles,
commercial terms, categories and client plans retain their existing tenant boundaries.
There is no Bimba/Zavod special case in application logic and no schema migration.

The issue's logical `config_type=monobrand` maps to the existing approved client
profile: `profileMode: MONOBRAND` plus a tenant-owned `monoBrandId`, in a versioned
GENERAL client configuration. It remains independent of the legacy
SEASONAL/CARRYOVER/HYBRID onboarding business model. Supplier terms, seasons, ownership,
commission, monthly plans, channels and sale-status confirmation use the existing
Settings editors and connector contract; customer values are not copied from Zavod.

An ADMIN can now create a missing primary brand from the client Settings form before
any credentials or catalog import exist. The existing Settings API accepts
`{action: "createBrand", name}` and derives tenant/actor exclusively from the signed
session. Creation uses normalized identity, serializes within the tenant, reuses one
unambiguous existing brand on retry and records an audited new brand atomically.
Ownership starts UNKNOWN and no supplier, commission or purchase terms are guessed.
The creator selects the returned brand locally; saving/activating the client profile
remains a separate explicit action. Enter in the creation input creates the brand
without accidentally submitting the enclosing profile form.

## Five screens and actions without the brand level

Presentation uses the profile from the frozen screen context. Monobrand requests
normalize legacy brand filters/grouping to category/SKU navigation and reset stale
brand-level pagination. The server applies the same rule; a handcrafted old URL does
not reintroduce the hidden brand filter. Multibrand clients retain their existing
behavior.

- Overview: contributors and the stock bottleneck use categories, with category/SKU
  drill-downs. Ownership gaps remain visible without a redundant brand-group count.
- Sales: retain the existing monobrand category/SKU tables, comparisons and channels.
- Stock: retain quality, category structure and SKU actions; omit the redundant K4
  brand table and avoid its query for monobrand snapshots.
- Repricing: hide the brand selector and brand name within product cells. Ignore
  legacy brand filters in the validated scenario while retaining other parameters,
  manual edits, selection, eligibility and server-owned totals.
- Reordering: hide the brand selector and replace Specific brand with All products.
  The additive `all` request mode uses the same eligibility, velocity, quantity and
  supplier/currency calculations as the complete filtered assortment. Unknown transit,
  off-season rows, ownership and purchase-term protections remain unchanged. Legacy
  monobrand brand-mode links normalize to all-products mode; multibrand UI remains
  shortage/specific-brand by default.

Canonical brand facts are retained for policies and audit provenance. The approved
D09 CSV schema still contains its brand field; hiding the UI brand hierarchy does
not create a second, incompatible export schema. Existing export authorization,
preview verification, frozen rows, idempotency, history and download scoping are reused.

## Owner and operator handoff for live activation

1. The owner registers a separate Bimba account through `/register`, or signs into
   its existing tenant. Do not reuse the Zavod tenant or another client's owner token.
2. In Settings → Merchandising → Client, choose Monobrand. Select the primary brand
   or create it using Brand not in the catalog yet, then save the profile.
3. Configure the brand/SKU ownership and commission, suppliers and verified delivery
   terms, category seasons, plan amounts/currency and client thresholds using the
   existing editors. Unverified source-specific facts must remain unknown.
4. In Settings → General → SalesDrive, the owner enters that account's hostname,
   read credentials and YML link, then checks access and its status/channel dictionary.
   Credentials belong in Settings/approved secret storage, not chat, issues or git.
5. Confirm the account-specific sale statuses, channel/project exclusions and approved
   source mapping using the existing [connector onboarding contract](29-connector-onboarding.md).
   Source amount units, return/preorder semantics, receipts and supplier-ID mappings
   require explicit evidence/approval and the existing versioned SOURCE_MAPPING
   activation workflow. Prefilled unverified status suggestions are not Bimba approval.
   This is configuration work, not an application-code fork; it was not activated here.
6. Run the initial history/catalog import and verify Data Quality, transit, freshness,
   backfill and background recalculation. Refresh screen snapshots after configuration
   changes, then reconcile all five screens and both CSV types with the owner's data.
7. Enable the existing external scheduler/webhook setup for that source as described
   in [sync verification](32-automatic-sync.md). Confirm recovery controls and that the
   other client's settings, source progress, files and calculations remain unchanged.

Live credentials, field-mapping evidence, real import reconciliation and owner
acceptance remain pending. The synthetic Bimba fixtures below are not real client data
and do not satisfy or replace the separate Zavod benchmark sign-off in #38.

## Verification

New migrated PGlite fixtures create two isolated synthetic clients. The monobrand
client uses its own source, account metadata, settings revisions, brand ownership,
plan and thresholds. Tests cover normalized pre-import brand creation, retries,
UNKNOWN defaults and rollback for a foreign actor; independent client settings;
all five screen read models and legacy brand links; full monobrand repricing and
reordering exports; cross-client input/snapshot/file denial; isolated history;
sync intent/progress, job claiming/resume and distinct channel/status/season edits.

Authenticated API integration tests exercise the actual five-screen, export/history/
download and import-progress handlers with signed sessions, forged identity headers
and two real synthetic database scopes. Viewer roles cannot create exports or resume
jobs. Another tenant cannot read the monobrand snapshot or generated file, create an
export from its input set, see its history or resume its job. Existing API tests also
cover ADMIN-only brand creation bound to the signed actor/tenant. Localized rendering
checks verify hidden brand selectors/names and the all-products control in both locales.

Browser checks used the actual shared shell, five workspaces, Settings editor, server
calculators and export store with an isolated fixture. Verified category contributors/
bottlenecks in Overview, category tables in Sales, category-to-SKU Stock detail, no K4
brand table, no brand selector/row name in Repricing/Reordering, all-products ordering,
and successful native downloads of both CSVs. Downloaded BOM bytes were EF BB BF;
repricing had two selected rows and the approved D09 header; reordering had one positive
UAH row, with zero recommendations omitted. Created and selected a new primary brand
through Settings using Enter, then saved the profile explicitly. At 390 × 844 the
Settings viewport/document widths were both 390 px; desktop used 1280 × 720.
Temporary fixture routes/servers were removed/stopped and the viewport override reset.
Remote account access, import activation and source credentials were not used.

Final checks: the full suite passed **966 tests across 87 files**, with no skipped
tests. The focused localized monobrand UI suite also passed after the final copy
refinement (3 tests). Production build, `npx tsc --noEmit` and `git diff --check`
passed. The earlier API mock was updated to include the frozen client profile in
its snapshot contract.
