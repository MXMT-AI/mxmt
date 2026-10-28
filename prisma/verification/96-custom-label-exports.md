# #96 — Versioned custom-label exports

## Delivery and approval

The dated [provider contract](./96-custom-label-provider-contract.md) was checked
on 2026-10-28 before implementation and attached to #96. Google documentation
was read through web tools; Meta's actual product specification and expanded
supplementary-feed field list were read in the browser after web fetch blocking.

The owner approved the initial policy in this chat on 2026-10-28: slot 0 is the
saved SKU class; other slots require explicitly configured rules; ordered
first-match precedence; unknown/empty values are omitted; only expressly owned
slots may be overwritten. `classificationLabelRules()` supplies the initial
eligible-class values verbatim. This approval does not establish that any real
advertising ID matches a SKU or that a particular client owns a slot.

This task implements a deterministic API/service and downloadable CSV artifacts.
It adds no navigation/workspace and makes no LLM calls, provider submissions,
campaign changes or claims about advertising performance. Existing repricing
and reordering CSV contracts, delimiters and BOM behavior are unchanged.

## Profile lifecycle

`POST /api/merchandising/custom-labels/profiles/<profileId>` requires ADMIN or
SUPER_ADMIN both at the signed-session route and within the database transaction.
Body:

```json
{
  "expectedRevision": 0,
  "approvalReference": "owner-reviewed catalog mapping and slot ownership",
  "profile": {
    "version": 1,
    "sourceId": "source-id",
    "target": {
      "provider": "google",
      "accountId": "merchant-account-id",
      "primaryFeedReference": "reviewed-primary-feed-reference",
      "feedLabel": "UA",
      "language": "uk"
    },
    "ownedSlots": [0],
    "precedence": "first_match",
    "emptyPolicy": "omit_item",
    "rules": [
      {"id": "class-HEALTHY", "slot": 0, "value": "HEALTHY", "when": {"classifications": ["HEALTHY"]}},
      {"id": "class-RISK", "slot": 0, "value": "RISK", "when": {"classifications": ["RISK"]}}
    ],
    "mappings": [
      {"skuId": "canonical-sku-id", "itemId": "00001", "verificationReference": "verified-primary-feed-row"}
    ]
  }
}
```

All IDs/reference values above are placeholders. Include the other eligible
class rules from `classificationLabelRules()` for the full initial policy. A
Meta target uses `provider: meta` with its catalog ID/primary feed reference and
omits Google feedLabel/language fields. The app does not infer target identity
from connector aliases, barcodes, product groups or SKU display text.

Rules may additionally test saved `shortage` and known `inStock` states. They
match classifications first, then all specified conditions. The first possible
matching rule per owned slot has priority. If a higher-priority candidate needs
an unavailable input, lower-priority rules cannot invent its outcome. A
conclusively false condition permits evaluation of the next rule. Labels are
configured constants, not LLM text or implicit attribute-derived values.

Mappings are explicitly owner-attested through their verification references;
the application has no ad-account credentials and does not independently fetch
the external catalog. Every mapped canonical SKU/source must belong to the
signed tenant. Duplicate/unverified mappings and unsupported cell values remain
visible as per-item preview rejections, allowing an owner to repair imported
mapping data without silently guessing a target ID. Rule labels/IDs are never
truncated, normalized or apostrophe-prefixed to force them through validation.

The approval creates an immutable `MerchandisingConfig` revision with approver,
timestamp/reference and an audit action. It deliberately remains `isActive=false`:
custom-label profiles do not become financial settings or invalidate the saved
MVP metric configuration just because their mappings changed. The label reader
explicitly selects the latest approved revision. Expected-revision conflicts
prevent overwriting a concurrent owner decision. A target already assigned to
another profile's latest approved revision cannot be silently reintroduced under
a competing profile key. Superseded revisions remain historical: moving a
profile to a new target releases its former target for a different live profile.

`GET` on the same URL returns the latest approved profile to an ANALYST-or-higher
signed tenant member. There is no default live profile, no seeded real account
and no automatic activation from the general owner policy decision above.

## Preview, exact export and history

`POST /api/merchandising/custom-labels/preview` requires ANALYST or higher:

```json
{
  "profileId": "reviewed-profile",
  "snapshotId": "saved-mvp-snapshot",
  "filters": {"brandId": "canonical-brand-id"}
}
```

Filters are optional and limited to brand/category/SKU. Their effective values
reuse the MVP context's canonical profile/filter semantics, including explicit
unassigned values. The service reuses #93's principal/tenant lock, snapshot
freshness validation and provenance-envelope builder, but does not create a
budget period or paid execution.
The snapshot must be current for the selected source, its settings and saved
sales/daily publication versions. The profile source must match it exactly.

One bounded batch joins the saved screen SKU rows to their `SkuDaily` records.
The row limit is checked before reading publication headers. No full sales/stock
summaries, full daily counts or scope-wide observation aggregates are computed.
Only two publication headers are checked against the saved snapshot; observation
min/max/missing values and the source fingerprint are derived from the bounded
rows, including their saved daily IDs, calculation versions and observed times.
The bounded evidence fingerprint has its own `custom-label-evidence-v1` version;
old previews must be refreshed, while already audited export artifacts remain
downloadable unchanged.
Classification, shortage, product kind and quantity come from those publications;
the service never falls back to legacy Sheets classification or recalculates a
marketing class. Unknown/error classes and non-merchandise products are rejected.
Mapping duplicates are checked against the entire profile even for a filtered
preview, so an ID collision cannot be hidden by selecting only one SKU.

The preview returns assignments with exact provider IDs, slot values and matched
rule IDs; per-SKU rejection reasons; accepted/rejected/source counts; target;
profile approval/revision/hash; complete source provenance and snapshot timestamp;
file byte length/hash; readiness, blockers and manual-import warnings. It does
not persist an export action or return the CSV body yet. Identical inputs and
published data produce the same ordered assignments, hash and preview ID.

`POST /api/merchandising/custom-labels/exports` explicitly approves creation of
the already reviewed file, without submitting it to a provider:

```json
{
  "exportId": "96aabbcc-1122-4123-8123-001122334455",
  "previewId": "server-returned-64-character-preview-hash",
  "scope": {
    "profileId": "reviewed-profile",
    "snapshotId": "saved-mvp-snapshot",
    "filters": {"brandId": "canonical-brand-id"}
  }
}
```

The UUID/hash above are illustrative. Under the same tenant lock, the service
re-resolves the current profile/context, compares the preview, checks readiness
and the daily quota, and persists exact bytes, assignments/rejections, actor,
scope, rule revision and source evidence in one `MerchandisingAction`. Any changed
rules, mappings, ownership, snapshot, effective scope or source provenance makes
the old preview unusable for a new export. Clients cannot submit assignments or
override fields. Partial rejection is explicit: an export can contain the ready
items, while the preview/audit retain the rejected items and their reasons.

Reusing the same export UUID with the same actor/scope/preview returns the
original receipt; conflicting reuse returns 409. This replay remains valid as
historical retrieval even after the live profile changes. It does not assert
that the old file is current or execute a new provider action.

`GET /api/merchandising/custom-labels/exports` returns the latest 50 receipts for
the signed tenant, reading `context.receipt` without touching the potentially
large `after` artifact payload.
`GET /api/merchandising/custom-labels/exports/<exportId>` returns the originally
audited bytes with attachment, UTF-8, no-store and nosniff headers. Current tenant
membership/ANALYST permission is rechecked; another tenant cannot retrieve an
artifact by guessing its UUID. Repeated downloads neither consume quota nor
append another export action.

## Limits, encoding and manual-import scope

- One profile has at most 100 ordered rules and 5,000 mapping rows. One preview
  has at most 5,000 saved source rows; over-limit selections fail rather than
  exporting an arbitrary truncated page. Use a narrower canonical scope.
- Each new file is at most 4 MiB; there are at most 20 new exports per tenant per
  UTC day. The source/config/approval and export operations share the tenant
  lock, so concurrent actions cannot spend the same quota slot or export a
  half-updated profile. Idempotent replay and download are free.
- Provider CSV contains only `id` and ascending owned `custom_label_N` columns,
  UTF-8 without BOM, commas, CRLF records, quoted fields and doubled quotes.
  Shared `csvCell` quoting is reused after rejecting unsafe cells. Existing
  scenario exports retain their separate semicolon/BOM/neutralization contract.
- Google IDs are at most 50 UTF-16 code units; Meta IDs at most 100; label values
  at most 100. These bounds are conservative for Unicode astral characters.
  Control/function/private/unassigned/surrogate code points, surrounding
  whitespace and formula initiators (including full-width prefixes) are rejected.
  Valid Ukrainian text, punctuation and embedded quotes are preserved exactly.
- One complete row is required across all emitted slots. A missing match/value
  omits the entire item. Unowned columns, blank values and clear markers are not
  emitted. No new stock classification or optional #97 attribute label is guessed.
- Google account-wide distinct-value limits cannot be verified against another
  feed/account without its data. The preview reports its own counts and retains
  `ACCOUNT_WIDE_LABEL_CARDINALITY_NOT_VERIFIED`. Meta retains the potential
  custom-label policy-review warning from its official documentation.
- The artifact is a reviewed **patch**, not a complete replacement of an existing
  supplementary feed. It retains `MANUAL_PATCH_MERGE_REVIEW_REQUIRED`. Before
  uploading, review/merge it with existing supplementary data and provider feed
  rules. Replacing an external feed with an incomplete subset can otherwise
  remove previous overrides even though this file has no blank cells. The app
  performs no upload and cannot promise external preservation from omission alone.

## Verification and release gate

Tests use isolated PGlite databases with production migrations, synthetic
owner-approved mappings and signed auth cookies; no live account, provider call,
workbook edit or production migration is used. They cover deterministic rule
precedence and missing inputs, platform limits, Unicode/formula handling, target
identity collisions, CSV exactness, role/tenant/source isolation, quota, profile
revision invalidation, idempotent export, metadata history and unchanged download.

Apply the data-only migration
`20261028210000_custom_label_history_receipts` before releasing the updated
history path against existing artifacts. It copies missing legacy receipts into
the small context object once and leaves the original receipt/CSV/assignments in
`after` unchanged. It is safe to repeat and adds no schema/table changes. Tests
exercise this upgrade with a legacy-format artifact and verify exact file bytes;
the migration was not applied to a live database during development.

Completed checks: `npm test -- --maxWorkers=2` — 128 files / 1,300 tests passed;
`npx tsc --noEmit` and `npm run build` passed. All 54 new feature tests pass as
part of the full suite. Diff/whitespace checks cover tracked and new files. No
frontend/browser UAT is claimed for these APIs; the browser was used only to
verify official Meta documentation.

Before production use, the owner must supply real catalog/feed identity, attest
SKU-to-variant IDs against the primary feed, confirm owned slots and account-wide
label usage, review rejected rows and the exact patch merge/import behavior, and
record the applicable business acceptance in #92. General class/omission-policy
approval does not complete those account-specific checks.
