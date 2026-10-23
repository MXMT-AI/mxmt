# Connector contract and SalesDrive onboarding (#29)

## Scope and authority

The provider-independent contract is `lib/connectors/contract.ts`. It defines
read-only orders/products/stock/receipts methods, source DTOs, pagination,
capabilities, dictionaries and connection-check results. Future KeyCRM, Horoshop,
Shopify and CSV adapters implement this contract; formulas remain in calculation
consumers. `tests/fixtures/mock-connector.ts` implements it independently and passes
the same consumer assertions as SalesDrive.

The current official [SalesDrive Swagger](https://api.salesdrive.me/api/docs/) and
[OpenAPI](https://api.salesdrive.me/swagger/openapi-uk.php) were checked October 23,
2026. OpenAPI 3.1.1 SHA-256:
`44a6c30a2aaa466cbf7cdf5cb0225a0ad3b1c7cabacaa5a907bad1114653110e`.
The [approved #27 policies](../../docs/mvp-business-decisions.md) remain authoritative;
E01–E03 customer evidence and activation gates remain open.

## Read contract

| Method | SalesDrive source | Evidence/limitations |
| --- | --- | --- |
| Orders | `GET /api/order/list/` with form-level orders read key | `X-Api-Key`; page/limit and `filter[updateAt][from]`; no financial inclusion policy |
| Statuses | `GET /api/statuses/` | Status IDs/names only; no status-to-sale mapping inferred |
| Channels | Order response `meta.fields.sajt.options`, when recognizable numeric `id`/`name` entries exist | Public schema leaves metadata opaque; always marked incomplete/unverified; no guessed channel endpoint or names |
| Receipts | `GET /api/arrival-product/list/` with account-level arrival read key | `filter[updatedAt][from]`; types 1/2/3/4 remain receipt/transfer/write-off/inventory adjustment; supplier and posting semantics unverified |
| Products/stock | Account's `GET /export/yml/export.yml?publicKey=…` | Current observation only; optional `vendorprice` cost; `quantity_in_stock`; no inferred in-transit or historical stock |

The old ticket's `Form-Api-Key` assumption is superseded by the verified
`X-Api-Key` header. Operation IDs are not URL paths. Create keys with only the
required read permissions in SalesDrive settings. Successful read probes confirm
access; they do not prove that an externally issued key lacks write permissions.
The adapter itself exposes no write operation and sends only GET requests.

DTO money/quantity values are decimal strings, never calculated using binary
float arithmetic. API numbers retain the precision supplied by SalesDrive JSON;
YML string values retain decimal precision. Unknown costs and unit flags remain
null/unknown. Commission unit flags are not supplier commission rates or ownership
evidence. Missing source line IDs remain null: #30/#31 must verify stable line and
event identity before persistence. Source-local date strings remain source facts;
normalization must apply the approved timezone/date policies. Refund dates are not
derived from generic order updates.

Catalog and stock share one request-scoped feed observation. Page methods slice
that bounded snapshot; future bulk ingestion must reuse the same adapter/feed
instance to avoid mixing observations. There is no global shared credential/feed
cache. Full refresh, durable raw storage/checkpoints, deduplication and calculation
activation belong to #30–#38 rather than the onboarding probes.

## Setup and public API

1. Apply `20261023010000_connector_connections` on an isolated staging database
   after the #28 migration. Use the direct connection and the existing runbook.
2. Set server-only `CONNECTOR_ENCRYPTION_KEY` to 32 random bytes encoded in base64
   (`openssl rand -base64 32`). Do not expose it through `NEXT_PUBLIC_*`, source
   control, issue comments or client settings. Preserve it across deployments and
   back it up with the encrypted database: losing it prevents credential recovery.
3. An ADMIN/SUPER_ADMIN opens Settings → General → SalesDrive, enters the exact
   account hostname, orders read key, optional receipts read key and optional YML
   URL, then saves and checks the connection. Account hostname is public; keys and
   token-bearing feed URLs are write-only and cleared after submission.
4. Saving replaces the whole credential set and increments its revision. Re-enter
   keys and the feed URL when replacing it. Blank optional fields disable the
   associated resource. Each save invalidates prior checks; it never starts an
   import or activates a calculation profile.

`/api/connectors/salesdrive` uses the existing verified-cookie auth/RBAC, validation,
error envelopes and request-ID response helpers:

- GET: authenticated tenant's public hostname/configured flags and last sanitized
  check result, selected without credential ciphertext.
- PUT: ADMIN-only complete replacement of validated credentials. The tenant is
  always derived from the verified session. Unknown fields, including tenant IDs,
  are rejected. Request bodies are limited to 16 KiB including chunked requests.
- POST: ADMIN-only check of the saved configuration. Request target/tenant fields
  are ignored; no supplied URL or key is used. Missing configuration returns 409.
- Responses use `Cache-Control: no-store`. A fresh server-generated request ID
  prevents callers putting credentials into correlation logs. Raw Prisma/fetch
  errors, payloads, request bodies and token-bearing URLs are never logged by these
  handlers. Only fixed operation/error codes and the request ID are logged.

`ConnectorConnection` references the existing `DataSource` through a composite
tenant/source FK. Credentials are AES-256-GCM encrypted with random 96-bit nonces
and tenant/provider-bound authenticated data. Ciphertext swapping or tampering
fails closed. No plaintext credentials are stored in source metadata, settings
JSON, audit logs, local storage or response payloads. They necessarily pass through
the administrator's input and same-origin HTTPS save request once; they are never
returned to the browser by the server.

Key rotation requires decrypting/re-encrypting existing rows under a controlled
server-side procedure while retaining the old key for recovery. Do not simply
replace the environment key on a populated deployment. Password/key reset at the
provider requires replacing the saved configuration and checking it again.

## Connection checks and operational limits

Orders, statuses, receipts and catalog have independent result codes: OK,
NOT_CONFIGURED, AUTH_FAILED, RATE_LIMITED, TIMEOUT, NETWORK_ERROR,
INVALID_RESPONSE, RESPONSE_TOO_LARGE. Missing optional scopes remain visible;
overall `ok` is true only when all four read scopes pass. This is connection health,
not business mapping approval or MVP acceptance. Channel dictionary completeness
is displayed separately.

Checks issue at most four sequential GETs, with 8-second request deadlines and no
automatic retries. Published list quotas are 10/minute, 100/hour, 1,000/day;
account/key scope and other clients' use still require customer verification. A
429 is shown explicitly; avoid repeatedly probing a shared key. Durable sync
pacing/retries belong to #30/#32. Checks do not advance cursors or active imports.

Only single-label SalesDrive account hostnames over HTTPS are accepted. Feed URLs
must use the same hostname, the documented export path and a non-empty publicKey.
Non-default ports, userinfo, fragments, arbitrary hosts and redirects are rejected, and API
headers are never sent to the feed URL. API responses are bounded to 4 MiB; YML to
16 MiB. DTD/entities are rejected and XML entity processing is disabled. A larger
production feed needs a separately reviewed streaming import path in #31 rather
than silently increasing onboarding resource limits.

Checks are stored only if the saved credential revision is unchanged; otherwise a
409 asks the administrator to check the newly saved configuration. Connection
errors never include remote response bodies. Dictionary names redact configured
secrets if the upstream unexpectedly echoes them.

## Verification, deployment and rollback

- Run `npx prisma validate`, `npx tsc --noEmit`, `npm test`, `npm run build`.
- The shared adapter suite verifies canonical source DTOs, read paths/scopes,
  pagination, unknown values, unsafe URLs, redaction and encryption. Route tests
  use real signed access cookies to check unauthenticated requests, RBAC, tenant
  isolation, write-only storage, body limits, safe errors and stale checks.
- PGlite replays the complete migration history, verifies scoped FK/unique
  constraints and cascade behavior; existing Sheets tests remain unchanged.
- Test the Settings form in Ukrainian/English, keyboard/mobile and both themes
  with sanitized fixtures. Never use real keys for screenshots or preview fixtures.
- Before deployment, verify on a staging Neon branch, set the encryption key and
  apply the migration, then deploy. A missing key fails save/check operations
  closed while public status remains readable. Do not deploy code against a
  database that lacks the new table.
- Prefer application rollback retaining the additive schema. This migration does
  not alter legacy rows; backfill is unnecessary. Before any connection exists,
  the new table can be removed only through a reviewed reverse migration on
  staging; after use retain it or export encrypted credentials with their key and
  use a forward fix. Never reverse #28 underneath this migration. Resolve a
  failed transactional migration only after verifying rollback, as documented in
  the [existing migration recovery procedure](README.md).

Real customer credentials, dictionaries, permissions and E02 mapping samples have
not been supplied or verified by implementing this task. Synthetic success/failure
checks validate behavior; they do not claim a live customer connection.

Local UI verification on October 23 used the actual component in an isolated
synthetic preview: Ukrainian/English, dark/light themes, save/check feedback,
keyboard-operated dictionaries with visible focus, and a 390px viewport without
horizontal overflow. The production Settings page was build-checked; no live
database credentials or customer connector was used for browser checks.
