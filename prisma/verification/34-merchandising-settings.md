# Merchandising settings (#34)

Open **Settings → Merchandising** (`/settings?tab=merchandising`). Authenticated
tenant members can read settings; ADMIN and SUPER_ADMIN can publish changes.
The English and Ukrainian forms reuse the existing settings layout and link to
the brand-alias/product-type editor introduced in #33.

## Defaults and inheritance

| Setting | New profile default |
| --- | --- |
| Brand configuration | Multibrand; monobrand requires an existing tenant brand |
| Monthly revenue plans | Unset; explicit zero is retained, with no attainment percentage |
| Plan currency | Unset; an ISO currency code is required before saving plans |
| Minimum margin / turnover target | 45% / 3 months |
| Dead-stock threshold | 90 days; supported choices 60, 90, 120 |
| Healthy / risk WOH upper bounds | 12 / 26 weeks; risk must exceed healthy |
| New-product quarantine | 6 weeks |
| Sale-status suggestions | 5, 59, 60; inactive until explicitly confirmed for the account |
| Excluded channels / projects | Empty; use source IDs, not display names |
| Supplier lead / post-delivery coverage / MOQ | 30 days / 60 days / 1 unit |
| Category season | All 12 calendar months; at least one month is required |

SKU ownership, commission and supplier overrides precede brand defaults. A null
SKU override inherits; explicit UNKNOWN ownership stays unknown. Consignment
commission is entered as a percentage and stored as a ratio. Unknown ownership,
commission, cost and in-transit stock never become fabricated financial values.
Unverified supplier terms use the client defaults for a provisional calculation
and block export until the supplier terms are confirmed.

Monobrand configuration supplies an explicitly selected brand only for SKU policy
resolution where the SKU has no brand. It does not rewrite catalog associations.
MONOBRAND/MULTIBRAND is independent of the existing
SEASONAL/CARRYOVER/HYBRID business model. Existing brand lead-time and legacy
planner defaults are preserved.

## Persistence and application

- `GET /api/settings/merchandising` lists a selected resource with bounded search
  and pagination; `skuId` resolves the current tenant SKU policy.
- `POST` with `action: save` validates a complete resource payload and its expected
  revision. Stale edits return 409; cross-tenant entities cannot be changed.
  Creating a supplier requires a stable UUID creation key so a retry cannot
  create a second supplier.
- Reuse existing Brand, Sku, Supplier and Category fields. Client policies and
  entity change snapshots use approved GENERAL `MerchandisingConfig` revisions
  under `settings:client` and `settings:<resource>:<id>`. Old revisions are
  deactivated atomically; `MerchandisingAction` retains the actor and before/after
  values. No schema migration is required.
- New order-import jobs capture the active confirmed sale statuses and channel/
  project exclusions. Already queued jobs retain their captured policy. Source
  price, cost, currency and date verification remain required separately.
- Project exclusions require the verified flat SalesDrive project-ID field.
  A missing field or unsupported payload shape blocks signed amounts and creates
  `PROJECT_MAPPING_UNVERIFIED`; excluded rows retain their raw payloads and explicit
  exclusion diagnostics. They do not enter the data-quality financial components.
- Changing effective status/exclusion filters marks old order projections for
  replay in Data quality. Re-import the affected historical period through the
  existing import flow; saving settings alone does not replay remote history.
  Changes to plans or thresholds do not falsely mark order projections stale.
- Saving settings invalidates existing recalculation requests to WAITING_ENGINE
  and records the settings config in their provenance. The complete financial
  reporting engine remains assigned to #35–#37, as approved in #32.
- The SKU form's server preview reads saved policy, not browser-supplied rules.
  It evaluates own/consignment gross profit, margin comparison, season-aware
  reorder quantity with MOQ, and monthly plan attainment. Test revenue uses the
  configured plan currency; this preview does not write report facts or export.

## Verification

Automated coverage includes validation, fresh defaults, null inheritance versus
explicit UNKNOWN, commission precedence, plan currency, zero/missing targets,
supplier MOQ, season gating, confirmed-status activation and exclusion mapping.
PGlite runs all migrations against synthetic tenants to verify revisions, audit,
stale-edit rollback, tenant boundaries, supplier retry idempotency, frozen import
policy, exclusion of financial components and filter-specific replay detection.
API tests exercise cookie authentication, forged identity headers, read-only
authorization, request bounds and persisted-policy previews.

Local browser verification uses the actual React component with a synthetic API
fixture, rather than customer data. Checked English validation and save feedback,
SKU inheritance/UNKNOWN and unavailable preview values, category defaults, and
the Ukrainian read-only form at a 320px viewport. This is not a deployed reference
comparison or a production SalesDrive verification.

No production data, credentials or database migrations are needed for these checks.

Implementation verification: 393 tests across 45 files passed with two workers;
TypeScript, Prisma schema validation, the production build and whitespace checks
passed. An unrestricted parallel test run exceeded worker/test timeouts; the
bounded run completed successfully without changing timeout limits.

```sh
npm test -- --maxWorkers=2
npx tsc --noEmit
npx prisma validate
npm run build
git diff --check
```

To reverse a policy change, publish the desired values as another revision through
the form. Do not delete audit/configuration history or reactivate rows manually.
