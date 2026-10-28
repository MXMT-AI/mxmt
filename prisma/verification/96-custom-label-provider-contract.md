# #96 — Custom-label provider contract

Verified on **2026-10-28**. Revision `custom-label-feed-2026-10-28-v1`.
This is a file-export contract, not a provider integration or production upload.

## Official sources checked before implementation

- [Google custom labels](https://support.google.com/merchants/answer/6324473?hl=en):
  slots `custom_label_0` through `custom_label_4`, one value per slot; Unicode
  strings with ASCII recommended; 1–100 characters; 1,000 unique values per slot
  across an account. This application cannot know labels outside its own profile.
- [Google product IDs](https://support.google.com/merchants/answer/6324405?hl=en):
  1–50 characters, stable product/variant identity, valid Unicode and UTF-8;
  avoid whitespace and IDs differentiated only by case.
- [Google supplemental sources](https://support.google.com/merchants/answer/14990942?hl=en):
  supplement existing primary items; exact primary-feed ID matching and matching
  feed label/language are required. Supplemental data cannot add/remove products.
- [Meta product data specifications](https://www.facebook.com/business/help/120325381656392?id=725943027795860):
  read successfully in the in-app browser after web fetching was blocked.
  Five custom-label text slots, each limited to 100 characters. Product `id` is
  case-sensitive with a 100-character limit and must identify the actual variant.
  CSV field names are English; comma/whitespace fields need quoting and embedded
  double quotes must be doubled. CSV/TSV are supported formats.
- [Meta supplementary feeds](https://www.facebook.com/business/help/609872007120910):
  read in the browser, including the expanded supported-field list. IDs must
  match the linked primary feed exactly. Custom-label slots are supported;
  supplementary attributes override matching primary attributes. A primary feed
  can have only one supplementary feed. This is not a standalone product feed.

Meta now recommends `internal_label` for changing product-set filters because
custom-label edits can trigger product policy review and affect delivery. #96
explicitly implements custom-label file exports; it does not silently substitute
internal labels or make performance claims. The owner must review the intended
use and provider ingestion settings before uploading anything.

## Application contract and conservative restrictions

- One explicitly approved profile identifies provider, account/catalog, primary
  feed reference and source. Google additionally pins feed label and language.
  An owner-attested SKU-to-target-item mapping is required; connector aliases,
  barcode or SKU text are never automatically treated as advertising IDs.
- Only explicitly owned slots are emitted. Each exported row must have a
  nonempty valid value in every emitted slot. If any slot is unknown/unmatched,
  omit the whole item and report why; do not send blank cells or clear markers.
  This enables one supplemental CSV even for Meta's single-supplementary-feed
  limit. External ingestion/overwrite semantics still require account review.
- Use UTF-8 without BOM, a comma delimiter, CRLF records and quoted fields with
  doubled quotes. Output only `id` and the approved `custom_label_N` columns.
  Do not add metadata columns to the provider CSV; retain provenance separately
  in the audited export metadata/history.
- Reject unsafe spreadsheet formula prefixes, control/function/private/unassigned
  Unicode, malformed surrogates and leading/trailing whitespace instead of
  altering IDs or labels. This is stricter than the platform's free-text format;
  apostrophe-prefixing would change exact feed identity and is not used.
- Reject duplicate SKU mappings and conflicting provider IDs. Google collisions
  are compared case-insensitively; Meta follows exact case-sensitive matching.
  Unverified/missing mappings are rejected per item. Unknown saved classifications
  remain unknown; there is no legacy or LLM-derived classification fallback.
- Profile rule order defines first-match precedence independently per slot.
  Rule meanings, order, owned slots and omission policy require explicit owner
  approval. No production rules/mappings are installed by this implementation.
- Bound preview to 5,000 source rows, one file up to 4 MiB and 20 new exports per
  tenant per UTC day. Replays/downloads do not consume another export quota.
  Provider submission and account-wide validation are outside this task.

## Approval and acceptance state

On 2026-10-28 the project owner approved the proposed initial policy in this chat:
slot 0 carries the saved SKU class; other slots require explicitly configured
rules; ordered first-match precedence, omission of unknowns/empty values and
overwriting only explicitly owned slots. `classificationLabelRules()` supplies
the initial known-class rules with verbatim class values. SERVICE/DATA_ERROR and
unknown inputs are rejected, not marketed as fabricated healthy classifications.

This approval does not invent real account IDs, SKU mappings or existing slot
ownership. Each real profile still needs explicit owner approval with its scope,
mapping verification references and owned slots. No production profile is
installed here. Where business/source validation is unsettled, the customer
acceptance gate remains #92.
