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

Owner approved the auth block; committed as `cf83170` (`chore: upgrade authentication libraries`). No push has been made. Lucide remains a separate following API/render compatibility block.


## Block 5 — Lucide icon compatibility

Pre-change review: lucide-react 0.468.0 → stable 1.64.0 (npm version and React peer dependencies checked). The official React migration guide removes brand icons; AST inventory found 59 imported icon components in 18 application files and none of the removed brand icons. Only the LucideIcon type is imported in the additional type-only file.

Lucide 1 defaults decorative SVGs to aria-hidden, removes UMD distribution, and adds optional context providers. This Next/React application uses named ESM component imports and the LucideIcon type; no UMD or provider conversion is needed. Preserve existing size/stroke/className and accessible control labels; do not add dynamic whole-library imports to application code.

Before changing the dependency, rendered all 59 current icons to SVG using the installed 0.468.0 package. The private temporary inventory is available for export/geometry comparison after upgrade.

Official sources:
- https://lucide.dev/guide/react/migration
- https://lucide.dev/guide/version-1
- https://github.com/lucide-icons/lucide/releases/tag/1.64.0

Installed lucide-react 1.64.0 without application source changes. All 59 imported components still export and render. Across all icons, width/height, viewBox, fill, stroke width/caps/joins are preserved. No application CSS selectors target renamed Lucide-generated class names. The default aria-hidden behavior was verified; visible text labels in sidebar controls and the theme toggle aria-label remain intact. This is a scoped icon-compatibility review, not a complete accessibility audit.

Rendered and visually inspected all 59 before/after SVG pairs at 24px on the existing dark background. Twenty-six geometries changed with upstream icon refinements (most visibly Megaphone); no missing, clipped or illegible icons were observed. Application layout, icon sizing and theme styles remain unchanged. This comparison is an icon sheet, not authenticated browser acceptance of every product page.

A separate existing issue was noticed while reviewing the full logs: clean Next 15 builds with jose 6 warn that JWE compression references CompressionStream/DecompressionStream in Edge. The app uses HS256 JWTs, not compressed JWE; compiled middleware HTTP checks passed in the previous block. These are warnings, not build failures. Revisit the import/runtime boundary during the planned Next framework block and check the final clean build; do not suppress the warning or claim warning-free builds.

| Check | Result |
| --- | --- |
| tsc --noEmit --incremental false | Passed |
| Full tests | 164 files; 1,633 passed, one optional private-workbook test skipped |
| test:mvp | 80 files; 965 passed |
| npm run build | Passed; jose Edge warnings described above |
| npm run build:vercel | Passed against disposable native local PostgreSQL |
| Imported icon exports / SVG render / dimensions | All 59 passed |
| Before/after visual icon sheet | Inspected; upstream geometry refinements retained |
| npm audit | Unchanged: 6 total; 0 critical, 4 high, 2 moderate |
| git diff --check | Passed |

Owner approved the Lucide block; committed as `b7f8739` (`chore: upgrade Lucide icons`). No push has been made. Next is the external AI SDK compatibility block.


## Block 6 — external AI SDK compatibility

Pre-change review:
- OpenAI 4.104.0 → stable 7.45.1; reviewed v5 migration guide, v6 and v7 breaking releases. v5 switches node-fetch to native fetch, Web Headers/errors and updated request overloads/path parameters; the app only uses chat.completions.create with an explicit body. v6 widens Responses tool-output types, which this Chat Completions integration does not use. v7 requires Node >=22; owner-approved Node 24 satisfies this. No production migration through unused intermediate SDK APIs is needed; validate the final supported endpoint with the actual new SDK.
- Anthropic 0.39.0 → stable 1.3.0; reviewed the SDK's linked 2026-10-21 API migration. New API version removes sampling parameters and rejects some document/citation placements. The application sends text-only messages and no sampling/tool/document parameters. Verify actual SDK serialization, headers, response usage and errors with intercepted fetch before accepting the upgrade.
- Preserve gpt-4o and claude-sonnet-4-6 identifiers. Official model documentation can establish published availability, not account-specific access. No model change or paid live call is part of this dependency block.
- Preserve chat.completions/messages endpoints, output limits, 5–55s timeout clamp, legacy retry=1, durable retry=0, separate cached/uncached input/output accounting and all execution budgets. Existing mocked-client tests alone are insufficient; add tests using the actual new SDK with synthetic intercepted HTTP responses.

Sources reviewed:
- https://github.com/openai/openai-node/blob/master/MIGRATION.md
- https://github.com/openai/openai-node/releases/tag/v6.0.0
- https://github.com/openai/openai-node/releases/tag/v7.0.0
- https://developers.openai.com/api/reference/typescript/resources/chat/subresources/completions/methods/create
- https://developers.openai.com/api/docs/models/gpt-4o
- https://github.com/anthropics/anthropic-sdk-typescript/blob/main/MIGRATION.md
- https://platform.claude.com/docs/en/api/migration-2026-10-21

Installed OpenAI 7.45.1 and Anthropic 1.3.0. No application adapter change was required by TypeScript. Added eight tests exercising actual SDK clients with intercepted fetch: request endpoint/body/auth/API-version headers, typed responses, missing/null usage, cache categories, truncation, error classes, one-attempt metered calls and one-retry legacy calls. Every request is intercepted and keys are synthetic; no paid calls or real keys are used.

Anthropic 1.3.0 sends API version 2026-10-21 and Bearer authorization. Its usage fields remain separate input/output/cache-read/cache-write values; null cache categories normalize to zero as before. Existing text requests contain none of the removed sampling parameters. OpenAI continues to call Chat Completions with the existing model and output cap.

Focused tests: 4 files, 46 passed. A first new assertion incorrectly expected the OpenAI SDK to emit the old x-stainless-timeout header. Replaced that assertion with an AbortSignal check; a separate intercepted-fetch probe confirmed both actual SDK clients abort on their configured timeout and dispatch only once when maxRetries=0. No timeout behavior was weakened in application code.

Published model lifecycle review: GPT-4o is deprecated in the official OpenAI model catalogue; Claude Sonnet 4.6 remains active in Anthropic's table. IDs remain unchanged in this dependency-only scope. Real account access and model-output quality remain unverified; changing models would require a separate approved behavior/budget evaluation.

Additional references:
- https://developers.openai.com/api/docs/models/gpt-4o
- https://platform.claude.com/docs/en/about-claude/model-deprecations

Audit after installation: 5 total, zero critical, three high, two moderate (form-data advisory path removed). Final validation passed: TypeScript; 165 test files / 1,641 passed / one optional private-workbook test skipped; 80 MVP files / 965 passed; both build and build:vercel against disposable native PostgreSQL; git diff --check. Existing jose Edge and Vitest config advisory warnings remain documented above. No application code or business logic changed.

Owner authorized each validated remaining block to be committed without individual approval on 2026-10-30. No push or PR creation was requested in that authorization.


## Block 7 — official SheetJS tarball

Official distribution documentation rechecked: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/ specifies 0.20.3 at https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz. Owner chose this supply-source migration. Preserve existing read(buffer)/utils APIs; no parser replacement or business normalization change.

Before mutation, froze the existing private workbook bytes and captured per-sheet raw/formatted matrices and cell-value/formula/type metadata hashes in both cellDates modes. Also reran workbook audit, reference-only reconciliation (expected review/block exit 2) and actual-workbook offline reporting suite (6 files / 84 passed). Complete real reconciliation remains blocked by missing approved business inputs; reference-only output is compared as limited evidence, not claimed as full acceptance.

Attempted installation completed with official 0.20.3 tarball; TypeScript/build/build:vercel passed, but full tests failed (2 workbook audit tests; 1,639 passed / 1 skipped). The same real workbook produced different typed dates, decoded XML text, period aggregates and offline projection diagnostics; reference-only reconciliation was identical. Offline test assertions alone passed but semantic comparison did not, so this block was NOT accepted.

Rolled package.json and lockfile back to the previously committed 0.18.5 and restored dependencies with npm ci. No failing upgrade was committed. Owner decision requested for a separately scoped import compatibility adapter versus deferral. The customer workbook and comparison outputs remain private temporary evidence. Other independent blocks may proceed from the restored accepted lock.


## Block 8 — Prisma 5 to 6

Before installation reviewed https://www.prisma.io/docs/guides/upgrade-prisma-orm/v6. Selected matching stable client/CLI 6.19.3 after individual registry version/engine checks. Node 24 / TypeScript 5.9 meet requirements. Schema has no Bytes fields, fullTextSearch preview feature or implicit many-to-many relation tables; existing explicit relations avoid the v6 implicit-join primary-key change. No NotFoundError usage found.

Prisma 5 migrate diff against the fully migrated disposable native PostgreSQL database is empty. Never ran schema push/reset or production migrations. After upgrade require the same empty diff and native SQL/transaction/JSON/Decimal/BigInt checks in addition to the existing PGlite suites.

Validated matching Prisma 6.19.3: TypeScript; 165 files / 1,641 passed / one optional workbook skip; MVP 80 files / 965 passed; build and build:vercel; native CRUD, parameterized SQL, JSON/Decimal/BigInt and serializable rollback; empty migrate diff. No schema changes or application adaptations were required. Ready for committed checkpoint before Prisma 7.


## Block 9 — Prisma 7 adapter/configuration

Pre-change review: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7. Matching stable client/CLI/adapter-pg 7.10.1 verified; reject registry latest 8 RC. Prisma 7 requires a driver adapter and moves datasource URLs out of schema to config; explicit environment loading is required. Native PostgreSQL TCP adapter preserves the existing pooled runtime URL and direct CLI URL; no Neon HTTP driver, Accelerate or new infrastructure.

Keep supported prisma-client-js generator with explicit output in node_modules/.prisma/client for existing @prisma/client imports; the new prisma-client generator is recommended but not necessary to change every application import during this compatibility block. No generated files committed. Current Next/Vitest pipeline supports TS/ESM and Node 24 supports require(esm); avoid unrelated whole-package module conversion unless required by actual gates.

Configure finite adapter connection timeout (5s by default, matching old connect timeout), idle eviction (300s), and a bounded 10-connection pool unless the existing URL specifies connection_limit. Preserve explicit connect_timeout; strip Prisma-only URL options before passing to pg. Transaction timeouts/retries stay controlled by existing calls. No blanket disabling of SSL certificate verification.

CLI config uses DIRECT_URL and loads existing Next env precedence; generation/build without a database URL remains supported, while database lifecycle checks still require both URLs and validate they target the same database. Require an empty schema diff and native SQL verification before committing.


Prisma 7 validation complete: TypeScript; 166 test files / 1,647 passed / one optional workbook skip; MVP 80 files / 965 passed; both isolated builds; native CRUD, SQL/JSON/Decimal/BigInt and Serializable rollback; empty schema diff through the new CLI config. Local production HTTP login and protected redirect passed; /api/health confirmed the application's adapter reaches the disposable database. No schema migration was generated or applied. Audit is five remaining findings, as before. Explicit URL pool_timeout has no separate pg equivalent; the finite acquisition/connect timeout is now five seconds by default, documented above. Production connection performance/TLS remains a deployment check.


## Block 10 — Next 16

Reviewed https://nextjs.org/docs/app/guides/upgrading/version-16 before changes; exact stable Next/codemod 16.4.3 verified. React pair/types already on latest stable 19.3.x from block 2. Relevant changes: async request APIs are mandatory; production/dev default to Turbopack; middleware becomes Node-runtime proxy; removed next lint/build lint behavior. Existing project has no custom webpack config, next lint script, PPR or cacheComponents configuration. Preserve auth route matching, identity verification, cron/webhook exemptions and silent-refresh redirects during proxy migration; do not add new caching behavior.

Run official pinned async-request and middleware-to-proxy codemods, inspect their diffs, then verify production HTTP auth/health in addition to all gates. Node proxy also removes the earlier Edge-only jose JWE compression warning boundary without changing JWT algorithms.


Pinned @next/codemod 16.4.3 ran both migrations. Async codemod could not process two route alias exports and added three re-export review markers plus an unnecessary double-await in an already-async preference route. Manually inspected: both aliases already await Promise params in the shared handler, re-export targets do not use route params, and the preference helper already awaits params. Restored those four unnecessary codemod edits rather than accepting invalid Promise typing or leaving markers. middleware-to-proxy renamed only the file/export; updated direct tests to import proxy without changing Next response header names. No auth matching or caching logic changed.


Next 16 validation: first isolated Turbopack build rejected external node_modules symlink by design. Changed only the temporary verification runner to install the accepted lock with independent npm ci, then both builds passed. First parallel test run had worker-start/hook timeouts during a long host stall; repeated after the build with unchanged timeouts/assertions: 166 files / 1,647 passed / one optional workbook skip; MVP 80 files / 965 passed; TypeScript passed. Local production HTTP login/database-health/auth redirect passed. Earlier jose Edge warning is gone with Node proxy. npm audit now two findings (xlsx high, Tailwind's selector-parser moderate); no forced overrides. Schema and business logic unchanged.


## Block 11 — TypeScript 6 intermediate checkpoint

Reviewed official announcement https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/ and exact stable 6.0.3 metadata before installation. Relevant changes: explicit ambient types, side-effect imports checked by default, stricter defaults and deprecations preparing for native TypeScript 7. Project already uses strict, bundler resolution and ES2017 target. Preserve these semantics; explicitly list required Node/React ambient types and project root. Do not use ignoreDeprecations, disable strictness or skip new application errors.


TypeScript 6.0.3 validation: tsc passed without suppressions or application changes; 166 files / 1,647 tests passed / one optional workbook skip; MVP 80 files / 965 passed; independent npm ci and both builds passed. Explicit types/rootDir preserve the intended environment.

## Block 12 — TypeScript 7

Reviewed https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ before mutation. Native compiler retains tsc CLI but removes deprecated configuration/API assumptions; strict bundler project already compiles on 6 with no ignoreDeprecations. No compiler API imports exist in application source. Preserve explicit target/types/rootDir and verify Next's own type-check integration, not just standalone tsc. Install only stable 7.0.2, not 7.1 beta.


TypeScript 7.0.2 validation complete: tsc, 166 files / 1,647 passed / one optional workbook skip, MVP 80 files / 965 passed, independent npm ci and both Next 16 builds. No application/type assertion changes or strictness suppressions required.

## Block 13 — Vitest 5

Before mutation reviewed https://vitest.dev/guide/migration/. Verified stable Vitest 5.0.5, Vite 8.3.5 peer and Node requirements. Relevant changes: Vite becomes peer, clearMocks defaults true, hoisted mocking calls must be top-level. No projects/browser custom runner configuration is used. Preserve prior explicit mock-history behavior with clearMocks:false rather than silently changing the meaning of cross-test call assertions; existing tests continue clearing mocks where intended. Rename config to .mts for native ESM loading, resolving the previous Vite warning without converting the entire package. No skips or timeouts will be added to bypass regressions.
