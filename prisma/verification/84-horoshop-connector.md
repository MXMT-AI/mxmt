# Horoshop read connector and onboarding (#84)

Implementation baseline: merged #83 / PR #89, main `61b267b`.
No live shop, production data, credentials or deployment were used for validation.

## Official contract reviewed on 2026-10-27

- [Authentication](https://horoshop.notion.site/1b6cc289707981b4bc0fc160b2b5fdf4):
  JSON POST `auth`, login/password in body, 32-character token, 600-second lifetime.
- [Orders](https://horoshop.notion.site/1b6cc28970798113b9b3fbd6fe844076):
  `orders/get`, `response.orders`, offset/limit, optional IDs and creation-date bounds.
  `stat_created`, `stat_status`, article and native `storage_id` are source facts.
- [Statuses](https://horoshop.notion.site/1b6cc289707981bd99b7dae801dfa99b):
  `orders/get_available_statuses`, `response.statuses` keyed by ID with localized title.
- [Catalog](https://horoshop.notion.site/1b6cc289707981e782b6e7c57c2fa526):
  `catalog/export`, `response.products`, offset/limit, maximum 500 records. This
  implementation requests at most 100 to match the shared workers.
- [Envelope/error contract](https://horoshop.notion.site/API-1b6cc289707981faa189c3513d66646a):
  OK, EMPTY, UNAUTHORIZED, AUTHORIZATION_ERROR, EXCEPTION, ERROR, HTTP_ERROR.

Public Notion pages omit some nested response examples in search rendering;
public `loadPageChunk` responses were also inspected. No third-party API examples
or guessed receipt endpoints were used. Account behavior still needs verification.

## Security and source boundaries

The shared signed ADMIN connection route handles saving/checking. Configuration is
strictly parsed; caller tenant/source overrides and oversized bodies are rejected.
Credentials remain encrypted with tenant/provider binding. Public results omit login,
password, token and ciphertext. Mapping evidence is immutable, actor-approved and
revisioned; changing quota, population, stock/price semantics or statuses requires a
higher mapping revision. Credential-only rotation increments the connection revision,
clears checks/capabilities and leaves unchanged mapping approval intact.

Set server-only `HOROSHOP_ALLOWED_ORIGINS` to comma-separated exact HTTPS origins
only after verifying the shop and restricted integration account. There is no
wildcard or default domain grant. Valid IDN shop origins, including `.укр`, are
normalized to their ASCII punycode form for exact allowlist matching. Configuration rejects URL credentials, paths,
queries, fragments, non-HTTPS protocols, custom ports and IP literals. Every request
resolves all DNS answers, rejects private/reserved IPv4 and non-public IPv6 (including
mapped/transition ranges), then pins the checked address on a fresh HTTPS socket.
TLS continues verifying the original hostname. No redirect, cookie, arbitrary header,
remote continuation URL or arbitrary API function is followed. DNS and HTTP requests
are bounded; JSON responses have a 4 MiB limit and strict UTF-8/lossless decimal parsing.

Tokens live only inside one runtime instance, already bound to the decrypted tenant,
source and credential revision. There is no process-wide token map. Expiry refreshes
early at 550 seconds; unauthorized reads retry after fresh authentication once.
Authentication responses are never retained. Source response bodies remain unchanged during validation and fact mapping. Separate
audit copies (page text and per-record raw fields) structurally redact credential/token
echoes before storage; audit JSON may therefore differ from source bytes.

No authoritative numeric provider quota was established. An account-evidenced
request/window budget is mandatory, uses existing durable reservations/backfill
headroom and is shared by shop origin across credential rotation. HTTP 429 persists
Retry-After backoff; JSON HTTP_ERROR 429 yields a safe retry error. No sleeps,
provider writes, webhook registration or automatic sync are added.

## Orders and modification strategy

`incrementalOrders=false`, `automaticSync=false`. Both backfill and later refreshes
rescan the entire accessible order list from offset zero. The adapter deliberately
omits `from`/`to`: filtering a recent creation window would miss an old modified
order. `updatedFrom`/`updatedTo` are rejected rather than misrepresented as supported.
The shared fixed job windows/cursors are scan metadata only; history coverage stays
unverified and cannot become proof of prior-year completeness.

Activation requires account evidence for stable offset ordering under modification.
Without it, `capabilities.orders=false` and connection checks cannot make the source
selectable. Offset APIs do not provide an atomic snapshot: concurrent insertion,
deletion or reorder behavior must be tested on the actual account. A successful
fixture cannot prove the provider's real behavior. Repeat scans are idempotent;
missing orders are never inferred as deletions/refunds. Identified orders with invalid
record fields (including a mismatched currency) are retained in quarantine with an
order-specific ImportIssue and raw-record reference. They never replace prior facts.
Every source row retains its pagination slot, so later offsets still run. Invalid
envelopes, page sizes, duplicate or missing order identities remain fatal page errors.

Horoshop does not document an order modification timestamp/version here. The shared
store now supports an explicit observation revision capability: a newer complete
read of an order may replace its lines under the existing source/revision/lease and
transaction guards; older observations are stale, same-time conflicts quarantine.
Other adapters keep their existing provider-version checks. No synthetic source
version or source-updated timestamp is written. Native storage IDs stabilize line
identity; modified line sets replace current facts atomically, including removed lines.

## Facts and unknowns

- Modification article is both catalog external product identity and SKU; parent
  article is retained as source metadata, not collapsed into a sellable modification.
- Named warehouse `residues.quantity` may supply physical stock only after explicit
  approval for every selected warehouse. Missing/duplicate warehouse data fails.
  Presence labels, reserve, catalog quantity and omission never create numeric stock.
- Catalog activation requires an independently approved full modification count,
  exact expected page lengths, consistent observation identity and a terminal empty
  probe. Shared durable staging validates all pages/unique identities before atomic
  activation. A changed population/count requires refreshed evidence and revision.
  These are complete scan observations with per-page times, not provider snapshots.
- Catalog price/currency interpretation requires account evidence. Order net unit
  price requires explicit approval, zero verified order/coupon/manager discounts and
  exact `price * quantity == total_price`. Bundles and unallocated discounts remain
  unknown. No discount allocation or financial formula is introduced.
- `payed` is not a payment date. Paid/return dates, costs, fees, supplier receipts,
  channels and historical stock remain unavailable. Financial rows stay in review
  where required evidence is absent; verified revenue is never manufactured.

## Settings and reuse

Horoshop is added to Settings with the existing server parallel reads and shared
connection API. Login/password are write-only and cleared after successful save.
The form captures timezone, account budget, population and warehouse evidence,
status meanings and approval reference. Unsaved edits warn on page exit, invalidate
approval and disable checking an unsaved draft. Status dictionaries can populate
unverified rows; meanings require explicit selection. Save does not select a source.

Status mapping controls and localized connector diagnostics are shared with KeyCRM.
Both reuse the existing Field/control components, API refresh and response validation.
Viewer rendering never contains credential inputs. The existing Settings theme,
spacing, native controls and single-column mobile layout are preserved.

## Validation

- Full suite: 113 files / 1108 tests passed.
- Real pipeline/scenario tests: 5/5 Horoshop pipeline tests passed, including
  unchanged repricing/reordering previews and blocked export/no audit publication
  when payment/cost/history evidence is missing.
- Production Next.js build, `npx tsc --noEmit` and `git diff --check` passed.
- Adapter/API/SQL pipeline tests cover signed roles, tenant isolation, encrypted
  credentials, rotation, mapping audits, token expiry and retry, malformed/partial
  envelopes, HTTP errors/Retry-After, exact offset replay, historical modified orders,
  removed lines, stale observations and complete catalog staging.
- Mocked DNS/HTTPS socket tests cover address pinning, mixed/private answers,
  allowlist/functions/query rejection, slow DNS and no redirect follow-up.
- Browser verification used only a local synthetic fixture of the real component:
  save/check flow, approval checkbox persistence, credential clearing, status rows
  and localized partial diagnostics. Desktop 1280 px and mobile 390 px checked;
  mobile document/scroll widths both 390 px. Screenshots saved locally in `/tmp`.
- Browser checks did not contact Horoshop or a database. No full authenticated
  production-app E2E or real-account reconciliation is claimed.

## Activation checklist (separate from code validation)

1. Verify exact shop origin and restricted API user; add the origin to the server allowlist.
2. Record actual API version/permissions, timezone, supported offset and storage IDs,
   history access/depth and quota evidence. Test pagination during old-order edits,
   new insertions and deletions; keep the provider unavailable if ordering is unsafe.
3. Confirm catalog population, warehouse sync names and physical stock interpretation;
   compare multiple pages and numeric stock against an approved account export.
4. Confirm currency/discount/bundle semantics. Payment dates, refunds and costs need
   an independently documented contract before they can become financial facts.
5. Save credentials through Settings, run checks, explicitly select the source, then
   run a manual scan and compare facts, five screens and safe scenario export behavior.
6. Obtain customer acceptance separately. This change neither enables production
   automatic synchronization nor authorizes deployment/customer-data processing.

## PR #90 review follow-up

Three CodeRabbit findings were verified and addressed: audit masking is isolated
from mapped source facts; identified malformed orders quarantine independently
without blocking pagination or deleting prior facts; valid punycode TLDs are accepted.
Regression cases cover short credential overlaps in SKUs, keys, prices and titles;
per-order currency/date/line failures across offset pages; retained prior projections
and per-order issue references; Unicode/ASCII origin normalization with unsafe URL
restrictions preserved. No PR comment replies or thread resolutions are automated.

Follow-up validation: 113 test files / 1115 tests passed; production build,
`npx tsc --noEmit` and `git diff --check` passed.
