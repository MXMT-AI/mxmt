# Dependency upgrade progress

## Scope and approvals

- Branch: `chore/deps-upgrade`, based on merged main `5dc9405222b90ae8273ccf66d8a18f2c03adffec`.
- One PR with a logical commit per accepted block. No commits or pushes without explicit owner approval.
- Owner superseded the initial Node 26 preference with Node 24 LTS on 2026-10-29.
- Hosting verification: the current Chrome Vercel account returned 404 for `vercel.com/mxmt/mxmt`; actual project runtime settings could not be inspected. Hosting settings were not changed. Package engines will request 24.x for future deployments.
- Existing shared `node_modules` symlink was replaced in this worktree only with an independent `npm ci`; the main checkout dependencies were not modified.

## Baseline — complete

All commands used the unchanged committed dependency lock on Node 20.19.6 / npm 11.12.1.

| Check | Result |
| --- | --- |
| npm ci | Passed |
| Full tests | 163 files; 1,622 passed, one optional private-workbook test skipped |
| test:mvp | 80 files; 965 passed |
| tsc --noEmit --incremental false | Passed |
| npm run build | Passed in isolated copy, no production env |
| npm run build:vercel | Passed using separate native local PostgreSQL database with the repository migration history |
| npm audit | 13 total: 1 critical, 8 high, 4 moderate |
| audit:zavod on frozen workbook | REVIEW_REQUIRED / exit 2; recorded baseline data findings, not a parser crash |
| reconcile:zavod --reference-only | BLOCKED / exit 2; 31 blockers; this is reference-only, not complete real-data reconciliation |

Private workbook, raw audit output, database credentials and actual-account data are outside Git. `baseline-metadata.json` contains only sanitized metadata and lock hash. The earlier real-data five-screen projection failure remains a known baseline issue, not a dependency-upgrade regression.

## Block 1 — Node 24 runtime alignment

Changes: `.nvmrc` pins 24.22.2; `engines.node` is `24.x`; packageManager pins npm 11.19.1; @types/node changes 22.19.21 → 24.19.2 and its undici-types dependency 6.21.0 → 7.24.6. No runtime library or business-logic changes.

Node 24.22.2 was selected from the official Node release index and downloaded through nvm with checksum verification. Prisma remains 5.22.0 for this isolated compatibility step. Validation completed under Node 24.22.2 / npm 11.19.1:

| Check | Result |
| --- | --- |
| Full tests | 163 files; 1,622 passed, one optional private-workbook test skipped |
| test:mvp | 80 files; 965 passed |
| tsc --noEmit --incremental false | Passed |
| npm run build | Passed in isolated copy |
| npm run build:vercel | Passed against disposable native local PostgreSQL |
| git diff --check | Passed |

The owner approved the runtime block; committed as `0861290` (`chore: align runtime with Node 24 LTS`). No push has been made. Successful local Vercel-build validation does not confirm the remote project's selected runtime or a deployed preview.

Security advisories are unchanged in this runtime-only block. Compatible Next/PostCSS/Vitest updates are next, after approval of this logical checkpoint.


## Block 2 — compatible security and patch/minor updates

Targets were rechecked individually with npm view (version, engines, peerDependencies) before installation; npm outdated confirmed each target is inside its existing allowed range. Stable versions only; no forced peer resolution or npm audit fix --force.

| Package | Before | After |
| --- | --- | --- |
| next | 15.5.19 | 15.5.28 |
| react / react-dom | 19.2.7 | 19.3.1 |
| @types/react | 19.2.17 | 19.3.0 |
| @types/react-dom | 19.2.3 | 19.3.0 |
| autoprefixer | 10.5.0 | 10.6.2 |
| postcss | 8.5.20 | 8.5.32 |
| vitest | 4.1.10 | 4.1.12 |

Runtime/package changes only; no application or business-logic adaptation required so far. The lock also includes compatible transitive updates selected by these packages (including Vite 8.1.5 → 8.3.5 and Rolldown 1.1.5 → 1.2.16).

Audit after installation: **6 total: 0 critical, 4 high, 2 moderate**, down from 13. Remaining paths include form-data, Next, Next's nested PostCSS/sharp, Tailwind's postcss-selector-parser and SheetJS. Updating the root PostCSS does not replace Next's nested version. No override or advisory suppression added; remaining major/supply-source upgrades are separate blocks.

Vitest reports an advisory warning about future native config loading of the existing CommonJS package's vitest.config.ts. Current gates remain on Vitest 4; revisit the config during its major migration rather than suppressing the warning.

Validation completed on Node 24.22.2:

| Check | Result |
| --- | --- |
| tsc --noEmit --incremental false | Passed |
| Full tests | 163 files; 1,622 passed, one optional private-workbook test skipped |
| test:mvp | 80 files; 965 passed |
| npm run build | Passed in isolated copy with synthetic JWT secrets |
| npm run build:vercel | Passed against disposable native local PostgreSQL |
| Production HTTP smoke | Login returned 200 with a rendered form; unauthenticated dashboard redirected to login |
| git diff --check | Passed |

The first build attempt omitted the synthetic JWT secrets required by the existing production guard and failed during page-data collection. Correcting the isolated test environment made both builds pass; no auth guard or application code changed. HTTP smoke is not authenticated five-screen/customer-data acceptance.

The owner approved this block; committed as `62ea159` (`chore: update compatible dependencies`). No push has been made.

Release references:
- https://github.com/vercel/next.js/releases/tag/v15.5.28
- https://github.com/react/react/releases/tag/v19.3.1
- https://github.com/vitest-dev/vitest/releases/tag/v4.1.12

## Pinned dependency review — preparation

- `@electric-sql/pglite` was added at 0.5.11 in b2adaff for tenant-model SQL tests. No permanent freeze rationale was found in that package change; planned patch upgrade remains a separate SQL-validation block.
- `fast-xml-parser` and `server-only` were added in 00c5c69 for connector parsing and server boundaries. Both are already at the verified stable target; preserve exact pins.
- `@js-temporal/polyfill` and `lossless-json` were added in e9affb8 for date/time handling and lossless external data parsing. Both are already at the verified stable target; preserve exact pins and behavior.


## Block 3 — pinned PGlite patch

Updated only `@electric-sql/pglite` 0.5.11 → **0.5.13**, retaining an exact package.json pin and the registry tarball integrity in the lock. The package was introduced in b2adaff for isolated SQL tests; no documented requirement to remain on 0.5.11 was found. No other pinned packages changed.

Official changelog reviewed: https://raw.githubusercontent.com/electric-sql/pglite/main/packages/pglite/CHANGELOG.md

Relevant patch behavior:
- 0.5.12 initializes new databases in UTC consistently instead of inheriting a host fixed-offset timezone. Tests using offsetless timestamptz literals may therefore expose previous host-dependent assumptions.
- 0.5.13 waits for previously issued queries/transactions before close completes, avoiding teardown failures.
- Filesystem and Emscripten fixes do not require an application API change here. The existing `new PGlite()`, query/exec/transaction and migration-test bridge remain unchanged.

Additional direct runtime probe under `TZ=Europe/Kyiv` passed: database timezone UTC, offsetless `2026-10-29 12:00:00` parsed as epoch 1793275200, failed transaction rolled back, and a pending query completed before close. Probe uses synthetic in-memory data only. This does not prove equivalence to the production PostgreSQL engine or resolve the earlier real-Zavod projection timeout.

Audit is unchanged: 6 total, zero critical, four high, two moderate.

Validation completed on Node 24.22.2:

| Check | Result |
| --- | --- |
| tsc --noEmit --incremental false | Passed |
| Full tests | 163 files; 1,622 passed, one optional private-workbook test skipped |
| test:mvp | 80 files; 965 passed |
| npm run build | Passed in isolated copy with synthetic JWT secrets |
| npm run build:vercel | Passed against disposable native local PostgreSQL |
| Direct PGlite lifecycle/UTC/rollback probe | Passed |
| git diff --check | Passed |

No application changes or schema migrations were needed. Owner approved the block; committed as `698e8f7` (`chore: update pinned PGlite dependency`). No push has been made.


## Block 4 — bcryptjs and jose major compatibility

Pre-change review (before installing):
- bcryptjs 2.4.3 → 3.0.3: package now exports ESM with a UMD fallback and built-in types; remove @types/bcryptjs. New hashes default to $2b$ instead of $2a$; verify existing stored password/refresh hashes instead of comparing newly generated hash strings.
- jose 5.10.0 → 6.2.14: ESM/WebCrypto and ES2022 target; Node 18 support removed, CommonJS requires a runtime with require(esm). Approved Node 24 supplies WebCrypto. Existing HS256 Uint8Array keys, SignJWT, jwtVerify and errors.JWTExpired remain applicable. The project does not use removed remote-JWKS agent options, KeyObject, PEMImportOptions or removed algorithms; no whole-project ESM conversion is planned.
- Named imports already match supported APIs; preserve JWT claims, algorithms, expirations, cookie/session and redirect behavior.
- Synthetic fixed compatibility fixtures were generated with the old installed bcryptjs 2.4.3 and jose 5.10.0 before changing dependencies. They contain no customer credentials or production signing keys. Verify old hashes and JWTs under the new libraries and exercise middleware's expiry/redirect branch.

Official references:
- https://github.com/dcodeIO/bcrypt.js/releases/tag/v3.0.0
- https://github.com/dcodeIO/bcrypt.js/releases/tag/v3.0.3
- https://github.com/panva/jose/releases/tag/v6.0.0
- https://github.com/panva/jose/blob/main/README.md

Implemented bcryptjs 3.0.3 and jose 6.2.14; removed @types/bcryptjs because bcryptjs supplies types. Added 11 cross-version regression checks with fixed synthetic pre-upgrade fixtures. Application imports, algorithms, claims, expiry, session storage and business logic did not need changes.

| Check | Result |
| --- | --- |
| Focused auth and migration compatibility | 2 files; 38 passed |
| tsc --noEmit --incremental false | Passed |
| Full tests | 164 files; 1,633 passed, one optional private-workbook test skipped |
| test:mvp | 80 files; 965 passed |
| npm run build | Passed with synthetic JWT secrets |
| npm run build:vercel | Passed against disposable native local PostgreSQL |
| Real local production auth HTTP flow | Legacy bcrypt 2 password accepted; wrong password rejected; refresh and logout passed; replay after revocation rejected with SESSION_REVOKED |
| Compiled middleware HTTP smoke | jose 5 valid JWT passed through to expected missing probe route (404); missing/expired API JWT returned 401; expired page JWT with refresh cookie redirected to silent refresh (307) |
| npm audit | Unchanged: 6 total; 0 critical, 4 high, 2 moderate |
| git diff --check | Passed |

HTTP auth checks used one synthetic user/tenant in the disposable native PostgreSQL database; the tenant was removed afterward and local smoke servers stopped. No customer account, production secrets, production database or paid API was used. These checks do not replace customer-data five-screen acceptance.

The current auth block is ready for owner review; not committed or pushed. Lucide remains a separate following API/render compatibility block.
