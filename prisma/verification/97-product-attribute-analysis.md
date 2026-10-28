# #97 — Real product attribute evidence and analysis

## Scope and owner decision

On 2026-10-28 the owner explicitly chose **code and verification now; real samples
and activation later**. This implementation creates no live dictionary, chooses
no customer dimensions and does not approve a customer performance rubric.
The sample mappings in tests and below are synthetic. Applicable acceptance
remains #92, including physical-field meaning and actual source examples.

The v2 path uses retained structured product fields, an explicit versioned
dictionary and saved MVP metrics. It never infers color, size or material from a
name, category or photograph. No enrichment service, image model or paid LLM is
called. Existing category-only Product Attributes consumers retain their legacy
contract; their category STR bands are not reused as physical-attribute truth.

## Connector evidence

Catalog normalization now captures a bounded `PRODUCT_ATTRIBUTE_EVIDENCE_V1`
payload from `ProductDto.raw`. Catalog storage retains it as immutable
`DataSourceRecord` rows with resource `product-attributes`, source product ID,
content hash, import run and product observation time. Original feed bodies are
still retained by the existing catalog audit. Raw objects up to 64 KiB are kept
for later remapping; missing or oversized objects produce explicit MISSING or
TOO_LARGE evidence, without guessing or truncating physical values.

The observation is captured for all common catalog paths (SalesDrive, KeyCRM,
Horoshop, Shopify and CSV) through the shared normalizer/storage. This does not
prove that each account exports every desired physical field. A missing field
remains missing, and a fresh import is required for pre-feature catalogs that
have no per-product evidence. Old whole-feed records are not parsed into
invented attribute observations.

Shopify explicitly requests variant `selectedOptions { name value }`. Its
[official ProductVariant contract](https://shopify.dev/docs/api/admin-graphql/2026-04/objects/ProductVariant)
was checked on 2026-10-28. Selected options remain under the audited variant;
the variant title is not parsed as a physical attribute. Other providers retain
their actual returned product objects. CSV gains an optional `attributes`
column containing a JSON object, such as `{"dial_color":["blue","red"]}`; old
packets and required fields are unchanged. The original CSV remains in the feed
audit while the attribute object is available at `attributes` in product evidence.

Apply migration `20261028220000_product_attribute_evidence` before release. It
adds a partial index for tenant/source/product/as-of evidence lookup. There are
no new tables or automatically populated customer dictionaries. Development
checks use isolated PostgreSQL/PGlite fixtures; no live migration/import was run.

## Dictionary preparation and selectors

`POST /api/merchandising/attributes/dictionaries/<dictionaryId>` requires a signed
ADMIN/SUPER_ADMIN session and database membership. It only saves a draft:

```json
{
  "expectedRevision": 0,
  "dictionary": {
    "version": 1,
    "sourceId": "source-id",
    "attribution": "exclusive_bucket",
    "rubric": {"kind": "coverage_only", "minGroupSize": 5},
    "dimensions": [{
      "id": "dial_color",
      "label": "Колір циферблата",
      "cardinality": "multiple",
      "selectors": [{"path": ["attributes", "dial_color"]}],
      "values": [
        {"id": "blue", "label": "Синій", "aliases": ["blue"]},
        {"id": "red", "label": "Червоний", "aliases": ["red"]}
      ]
    }]
  }
}
```

IDs/fields above are examples to replace with owner-reviewed real data. Names,
aliases and field meanings are not installed as defaults. For a named-array
source, use an explicit selector, for example:

```json
{"path":["param"],"match":{"key":"@_name","value":"Колір циферблата"},"valueKey":"#text"}
```

Shopify's equivalent can select `path: ["variant","selectedOptions"]` with
`match: {"key":"name","value":"Color"}` and `valueKey: "value"`. Whether that
option really describes dial color rather than case/strap color needs owner
verification. No implicit splitting of strings or guessing from field names is
performed. Known title/name/description/image/identity paths are forbidden as
physical value paths; named-array keys can be matched explicitly.

Dictionary bounds: at most five dimensions, three selectors per dimension,
eight path segments, 50 canonical values and 20 aliases per value. Unicode NFKC,
case and whitespace are normalized for alias comparisons, while raw selected
values remain available for review. Two canonical values cannot share a
normalized alias. A single-valued dimension with conflicting known values goes
to CONFLICT; mixed known/unmapped values stay UNMAPPED. Repeated aliases mapping
to the same value are deduplicated. Explicit arrays are multivalue inputs;
unrecognized objects or excessive values are conflicts, not coerced text.

Dictionary revisions are immutable definitions in `MerchandisingConfig`, with
optimistic revision checks and audit actions. Financial `isActive` stays false:
an attribute dictionary does not become a client financial setting or silently
trigger an MVP recalculation. The latest draft/approved revision is explicit.
A newer draft blocks activated analysis until that revision is checked; older
results cannot be served as if they used the new dictionary.

`GET` on the dictionary URL returns its current revision and approval metadata
to an analyst or owner in the same signed tenant.

## Sample review and future activation gate

`POST /api/merchandising/attributes/samples` (ADMIN/SUPER_ADMIN):

```json
{"dictionaryId":"reviewed-dictionary","skuIds":["canonical-sku-id"]}
```

At most five canonical SKUs can be reviewed at a time. The response contains
only the selected dimension values/states and evidence IDs, hashes and times;
it does not return the entire raw product/feed body.

After obtaining real samples, the owner can explicitly approve the exact latest
revision through
`POST /api/merchandising/attributes/dictionaries/<dictionaryId>/approve`:

```json
{
  "configId": "server-returned-config-id",
  "approvalReference": "owner review of real field meanings and aliases",
  "rubricApprovalReference": "owner approval of exclusive buckets and coverage-only statuses",
  "samples": [{
    "skuId": "canonical-sku-id",
    "dimensionId": "dial_color",
    "recordId": "reviewed-source-evidence-id",
    "valueIds": ["blue"]
  }]
}
```

The service requires verified sample checks covering every dimension (at most
25 checks), against actual retained AVAILABLE records from the same source and
canonical SKU. It recomputes normalization and rejects wrong expected values,
foreign records, missing dimensions or a stale config ID. Mapping and rubric
approval references are mandatory and audited. The owner action changes only
approval metadata; no provider or paid AI action is performed. This action was
tested with synthetic fixtures and was not executed for any real customer.

## Analysis contract and reconciliation

The existing `POST /api/agents/product-attributes` endpoint opts into v2 through:

```json
{
  "mode": "attributes_v2",
  "dictionaryId": "reviewed-dictionary",
  "snapshotId": "saved-mvp-snapshot",
  "preview": true,
  "filters": {"brandId": "canonical-brand-id"}
}
```

`preview: true` permits a clearly labeled draft report. `preview: false` requires
the current dictionary revision's approval. Both require ANALYST-or-higher
signed membership and current pinned source/snapshot provenance. Filters may
select brand/category/SKU, sales channel and currency; canonical monobrand and
stock/channel semantics are inherited from the saved MVP context.

Eligible merchandise rows are bounded to 500 canonical SKUs. Identity comes
only from a unique `SOURCE_PRODUCT_ID` alias in the selected tenant/source. An
ambiguous canonical alias is unavailable; another source's product is never
substituted. The latest successful/warning import observation at or before the
saved stock cutoff is used. Future observations and failed imports cannot
change a historical report. Conflicting payloads at the latest observation time
are unavailable, even when identical duplicate observations also exist.
Unsupported evidence versions remain unavailable instead of being interpreted
under an older contract.

Indexed observation headers are batch-read first, with an aggregate 4 MiB source
evidence bound before fetching selected bodies. There is no per-SKU network/DB
fan-out. Snapshot freshness and publication headers reuse the existing bounded
MVP evidence path; no full financial summary is computed just to validate scope.

Within each dimension every eligible SKU has exactly one bucket: a known value,
`__multiple__`, `__conflict__` or `__unknown__`. A multivalue SKU is not duplicated
into each known-value total. This conservative `exclusive_bucket` policy must
be approved explicitly; fractional or duplicate-membership measures are not
silently substituted. Different dimensions describe the same population, so
headline totals reconcile **within** a dimension and must not be summed across
dimensions.

Group stock, stock valuation, velocity/WOH/cohort STR and availability reuse
`stockStatsSql` / `stockGroupValues`. Sales, margin, coverage and LY comparisons
reuse saved `MerchandisingScreenFact` data, `totalsSql` / `salesAggregateMetric`.
Preorders/non-merchandise are excluded from the eligible domain, currencies stay
separate, incomplete costs/history retain their existing null/partial states,
and gross sale/absolute return units are shown separately from net units.
Sales without a selected eligible canonical SKU are explicitly outside this
attribute domain; the report does not claim to equal an unrestricted account
headline containing unassigned products.

Statuses are explicitly `ATTRIBUTE_MAPPING_COVERAGE_ONLY`: SPARSE for small
known-value groups, REVIEW_MAPPING for diagnostic buckets, COVERED for sufficiently
populated known-value mappings. These are not bestseller/dead-stock performance
labels. The saved stock/financial coverage flags remain separate and visible.
Recommendations reuse the attribute-analysis text module with deterministic
coverage/sparsity wording, without category STR thresholds or AI inference.

The response includes `groups`, per-SKU `memberships`, evidence/dictionary/source
provenance, coverage and an `analysisId` derived from the exact revisions,
memberships and metrics. No stale result is cached across dictionary or source
changes. Output is bounded to 4 MiB and sent with no-store headers. `by_category`
is empty in v2, so physical groups cannot masquerade as legacy category evidence.
Requests without a v2 mode retain the old category-only behavior; unknown modes
are rejected. No new frontend workspace is added in this backend task.

## Validation and remaining acceptance

Synthetic tests cover normalization, duplicate/multivalue/conflicting inputs,
unknown values, aliases/Unicode, tenant and SKU isolation, historical observations,
activation gating, sparse groups, exact saved metrics, dictionary revision
invalidation, retained catalog evidence, optional CSV attributes, Shopify's
explicit option query and signed API roles/legacy compatibility. Tests apply
production migrations only to isolated PGlite databases and use fake providers.

Completed checks: full suite 132 files / 1,333 tests passed. After adding three
additional regression cases and distinguishing recorded from available source
evidence, all four feature test files passed again (36 tests), including
simultaneous conflicts hidden behind duplicate hashes, unsupported evidence
versions, byte limits before body fetching and exact revenue reconciliation.
Final TypeScript and production build passed. Tracked and new-file whitespace
checks passed. No live provider calls or authenticated browser/customer UAT were
run for this API/service implementation.

Real sample selection, customer mapping review and approval of the attribution
and status/performance rubric are intentionally deferred under the owner's
instruction. No production dictionary is created or activated by this work.
