# mxmt-analytics dependency upgrade plan

Planning snapshot: 2026-10-29, Europe/Kyiv. This is a proposal and inventory, not an executed upgrade. No package, lockfile, application setting or hosting runtime was changed.

## Owner decisions

- One PR, separate logical commits, branch `chore/deps-upgrade` from freshly fetched main after confirming merged PR #118.
- Keep SheetJS; use an official stable vendor tarball instead of replacing the parser with ExcelJS.
- Initial target Node 26 was superseded by explicit owner approval of Node 24 LTS on 2026-10-29 after Vercel project access was unavailable. Target Node 24 locally and in package engines; production hosting settings have not been changed.
- Do not commit without explicit owner approval of the implemented block; run all gates first. A later explicit instruction can authorize commits/pushes.
- Preserve DRY, existing components and business behavior. Use vercel-react-best-practices for framework work and existing frontend/design guidelines for visual verification.

## Inventory evidence and caveats

Executed npm outdated, npm audit and individual npm view version/engines for all 28 direct dependencies. Current versions below come from the committed lockfile, not package.json minimum ranges. Registry tags may move; freeze exact accepted targets and lock integrity before each block. Do not treat latest dist-tag as stable automatically.

npm outdated and direct npm view disagreed for OpenAI and Vitest; direct view/dist-tags were rechecked: OpenAI 7.45.1, Vitest 5.0.5. Prisma latest points to a release candidate; enumerating stable versions of both client and CLI yields 7.10.1 as their highest shared stable version.

| Package | Locked current | Stable target / action | Type | Note |
| --- | --- | --- | --- | --- |
| `@anthropic-ai/sdk` | 0.39.0 | 1.3.0 | major | 0.x to 1.x is a compatibility migration. Preserve provider behavior and approved models. |
| `@js-temporal/polyfill` | 0.5.1 | 0.5.1 | unchanged | Already latest; preserve Kyiv timezone/date behavior. |
| `@prisma/client` | 5.22.0 | 7.10.1 | major | Upgrade together with prisma through 6.x, then 7.10.1. |
| `@tailwindcss/forms` | 0.5.11 | 0.5.11 | unchanged | Verify release notes and peer dependencies before update. |
| `bcryptjs` | 2.4.3 | 3.0.3 | major | Verify release notes and peer dependencies before update. |
| `clsx` | 2.1.1 | 2.1.1 | unchanged | Verify release notes and peer dependencies before update. |
| `fast-xml-parser` | 5.11.2 | 5.11.2 | unchanged | Already latest; preserve XML security configuration. |
| `jose` | 5.10.0 | 6.2.14 | major | Verify release notes and peer dependencies before update. |
| `lossless-json` | 4.3.3 | 4.3.3 | unchanged | Already latest; preserve exact external IDs and money parsing. |
| `lucide-react` | 0.468.0 | 1.64.0 | major | Major migration, verify named icon exports and rendering. |
| `next` | 15.5.19 | 16.4.3 | major | Verify release notes and peer dependencies before update. |
| `openai` | 4.104.0 | 7.45.1 | major | Direct npm view rechecked 7.45.1; outdated returned older metadata. Preserve model/budgets/retry ownership. |
| `react` | 19.2.7 | 19.3.1 | minor | Verify release notes and peer dependencies before update. |
| `react-dom` | 19.2.7 | 19.3.1 | minor | Verify release notes and peer dependencies before update. |
| `server-only` | 0.0.1 | 0.0.1 | unchanged | Already latest; keep server/client boundaries. |
| `tailwind-merge` | 2.6.1 | 3.7.0 | major | 3.7.0 belongs with Tailwind 4, not the early low-risk batch. |
| `xlsx` | 0.18.5 | 0.20.3 (official tarball) | minor | npm registry is stale; owner chose official SheetJS 0.20.3 tarball; verify current stable vendor release before installation. |
| `@electric-sql/pglite` | 0.5.11 | 0.5.13 | patch | Pinned; test SQL behavior and performance, do not conflate with native PostgreSQL. |
| `@types/bcryptjs` | 2.4.6 | remove | remove / special source | Remove after bcryptjs 3 supplies built-in types; do not install the deprecated stub. |
| `@types/node` | 22.19.21 | 24.19.2 | major | Match owner-approved Node 24 LTS; npm latest is 26.6.6, intentionally not selected. |
| `@types/react` | 19.2.17 | 19.3.0 | minor | Verify release notes and peer dependencies before update. |
| `@types/react-dom` | 19.2.3 | 19.3.0 | minor | Verify release notes and peer dependencies before update. |
| `autoprefixer` | 10.5.0 | 10.6.2 | minor | Verify release notes and peer dependencies before update. |
| `postcss` | 8.5.20 | 8.5.32 | patch | Verify release notes and peer dependencies before update. |
| `prisma` | 5.22.0 | 7.10.1 | major | Use 7.10.1, matching @prisma/client. Registry latest currently points at 8.0.0-rc.28; reject prereleases. |
| `tailwindcss` | 3.4.19 | 4.3.3 | major | Verify release notes and peer dependencies before update. |
| `typescript` | 5.9.3 | 7.0.2 | major | Separate major migrations through stable 6.x and 7.x; validate Next compatibility. |
| `vitest` | 4.1.10 | 5.0.5 | major | Major migration; Vite peer resolution and clearMocks/hoisted mocks need review. |

## Baseline findings

- Local runtime: Node 20.19.6 and npm 11.12.1. No package engines or .nvmrc currently found.
- Vercel build command is `npm run build:vercel`, not merely `npm run build`. Its database lifecycle script checks migration status and generates the client. It must remain non-mutating toward production.
- No GitHub workflow file was found in this checkout; check actual hosting settings before choosing CI/runtime behavior.
- Initial npm audit: 13 findings: 1 critical, 8 high, 4 moderate. Direct affected packages include Next, xlsx, postcss and Vitest. Audit scope and paths need verification; this count does not mean 13 remotely exploitable application bugs.
- npm outdated identifies Next 15.5.28 as the compatible 15.x update from 15.5.19. Handle this security batch early, before the framework major.
- Recent pre-upgrade verification of the preceding work: 1,622 tests passed, one private-workbook test skipped; tsc and isolated build passed. This is not a replacement for a fresh baseline on main.
- Real Zavod raw import and legacy calculations passed. Complete real-data five-screen acceptance did not pass: disposable PGlite projection timed out and rolled back. Keep this as a known baseline issue; neither claim that dependency upgrades caused it nor mark it fixed without a normal PostgreSQL/test-account reproduction.
- Current node_modules is shared through a symlink. Upgrade work MUST use independent node_modules in an isolated checkout/copy; do not npm ci/install through the existing shared symlink.

## Ordered implementation blocks

Every accepted mutation block gets one logical commit after owner authorization. Keep everything in one PR. Before each major block, add a short applicable-breaking-changes note with official sources, exact versions and files touched.

### 0. Confirm main, environment and immutable baseline

Fetch main; verify #118 merged and clean checkout; create chore/deps-upgrade. Capture commit, lock hash, npm version, Node and hosting settings. Use independent dependencies. Run npm ci, tsc, complete tests, test:mvp and build. Run build:vercel against a disposable native PostgreSQL database with the complete migration history (never production). Store complete audit privately and commit only aggregate dependency evidence. Record all pre-existing failures separately.

Freeze one Zavod workbook/hash and input manifest for before/after comparisons; do not redownload a dynamic workbook independently on each side. Capture parser outputs, row counts, warnings, date/money/ID normalization and existing reconciliation outputs. audit:zavod returns exit 2 for review-required evidence by design; reconcile:zavod can also return 2 for business acceptance. Compare classified findings and metrics rather than blindly requiring exit 0. Reconciliation needs a full manifest, not just an xlsx path.

Done: reproducible baseline, isolated native DB, named test-account environment, known failures and sanitized evidence recorded.

### 1. Align the owner-approved Node 24 LTS runtime

The owner explicitly approved Node 24 LTS instead of Node 26 after the current Vercel account could not access the MXMT project. Official Vercel documentation lists Node 24. Local target is 24.22.2 with npm 11.19.1, selected from the official Node release index. Pin .nvmrc and package engines; align @types/node to 24.19.2. Validate existing dependencies and Prisma 5 before mixing other major changes.

Actual hosting settings were not changed or verified because the project returned 404 in the current browser account. Verify the effective Node version in the eventual Vercel preview deployment. Do not claim production runtime activation from a package.json edit alone.

### 2. Compatible security and patch/minor updates

Update compatible Next 15.x, postcss, autoprefixer, React 19.x/@types together where peers require it, Vitest 4.x patch, and remaining packages within approved current ranges. Separate TypeScript 7, Vitest 5 and lucide 1.x from this batch. Maintain matching React/react-dom and Prisma CLI/client pairs. Record audit before/after. Already-latest packages do not need artificial churn.

### 3. Pinned dependency review

Read git history/blame and comments for fast-xml-parser, lossless-json, Temporal, server-only and PGlite. Temporal/lossless were introduced for source dates and precision; XML/parser restrictions and private workbook behavior must remain intact. PGlite was introduced in tenant-model SQL tests. Exact versions do not establish a permanent freeze by themselves. Update PGlite 0.5.11 → 0.5.13 independently, and verify migration/SQL suites. Keep currently latest pinned packages unchanged with documented rationale.

### 4. Auth and small compatibility migrations

bcryptjs 2 → 3 plus removal of @types/bcryptjs; verify previously stored password hashes, login, refresh and session revocation. jose 5 → 6: inspect ESM/WebCrypto compatibility and middleware runtime. Verify signature/expiry/issuer behavior and existing auth-security tests. lucide 0.x → 1.x is its own API compatibility block with icon export/render verification. clsx is already latest. Keep tailwind-merge 2.x until Tailwind 4.

### 5. External AI SDKs

Migrate OpenAI 4 → reviewed stable 5/6/7 checkpoints as required by official guides, and Anthropic 0.39 → 1.3. Preserve existing chat/messages endpoints unless adaptation is necessary; do not migrate product behavior to Responses or change models just because SDK defaults changed. Inventory configured/default model IDs and availability separately. Preserve maxRetries:0 in the durable execution layer, quota reservations, timeout and disjoint cached/input/output token accounting. Tests use realistic new response/error shapes. Paid live calls require an approved test budget and destination.

### 6. SheetJS supply-source migration

Use official stable tarball (documentation currently specifies 0.20.3), verify package/version, source URL, integrity and license, pin source plus lock integrity. Existing xlsx APIs are reused. Compare frozen real workbook parsing, malformed workbooks, serial dates, timezone, formulas/cached cells, 15 MB limit, exact IDs, negative quantities and line amounts. Run audit:zavod, reconcile:zavod with frozen manifests, and verify:reporting:offline before/after. Require zero unexplained semantic differences; allow only timestamps/output paths to be normalized in the comparison. No blanket audit suppression and no library replacement without a new owner decision.

### 7. Prisma 5 → stable 6.x

Read v6 guide and inspect implicit many-to-many schema/index changes. Client and CLI use the same exact version. Verify raw SQL, transaction isolation/retries, JSON, Decimal and BigInt serialization. Run migrate diff against an isolated migrated native PostgreSQL database. If schema drift appears, stop; dependency-only scope does not authorize a schema migration.

### 8. Prisma 6 → 7.10.1

Review generator/output/import changes, prisma.config/env loading, module format and required PostgreSQL driver adapter. Decide adapter connection strategy explicitly for existing Neon pooler/direct URLs; preserve pool sizes, timeouts and transaction semantics. Inspect scripts/database-lifecycle.mjs, build/postinstall/predev/prestart and require.resolve usage under ESM. Prove migration status checks still inspect the intended DB without applying migrations. Run native PostgreSQL integration tests as well as PGlite. Require empty schema diff or an explicit owner decision.

### 9. Next 15 → 16.4.3 and remaining React/type alignment

Read exact stable release/upgrade notes; review codemod diff. Inspect async cookies/headers/params, fetch and route cache semantics, middleware/proxy runtime, request auth, cron/webhooks, streaming and platform durations. Do not enable new cache modes as part of dependency work. Next 16 defaults to Turbopack; verify production bundling and any server-only imports. proxy migration changes runtime, so preserve security behavior and do not mechanically rename middleware without tests. Validate npm run dev, build and the actual Vercel preview command.

### 10. TypeScript major upgrades

5.9 → stable 6.x → 7.0.2 as separate compatibility checkpoints/commits. Read official compiler release/migration notes before editing; the attempted TypeScript 7 handbook URL did not resolve, so use the official release announcement/repository changelog. Check Next peer/tooling support, native compiler/tooling integration where applicable, tsconfig target/moduleResolution, generated Prisma types and tsc CLI behavior. Do not silence new errors by weakening strictness or broad any casts.

### 11. Vitest 4 → 5.0.5

Read v5 migration guide. Resolve Vite peer dependency; inspect clearMocks now defaulting true, top-level vi.mock/hoisted placement, removed entrypoints and worker/module mocking behavior. Preserve test intent and test counts; do not skip business tests to make migration pass. Retest auth, raw SQL and all connector suites on the chosen Node runtime.

### 12. Tailwind 3 → 4.3.3 with tailwind-merge 3.7.0

Owner selected one PR; keep this a separate logical commit, not a separate PR unless subsequently approved. Run the official upgrade tool only after recording exact tool version and baseline screenshots. Review CSS-first config, @tailwindcss/postcss, forms plugin, arbitrary values/CSS variables, border/ring/shadow/spacing changes and theme modes. Remove autoprefixer only when redundant; do not remove PostCSS while the chosen integration still uses it. Confirm browser support (Safari 16.4+, Chrome 111+, Firefox 128+) before changing policy. Compare login/settings, five reports, tables, filters/sliders, dialogs, Ukrainian/English, dark/light, mobile and keyboard focus. Reuse components; no visual redesign.

### 13. Release rehearsal and one PR

Run npm ci in a new independent directory WITH the accepted package-lock.json; do not delete it or broadly regenerate transitive versions at final verification. Run all gates, actual dev/start/startup checks and build:vercel against a disposable DB. Compare final audit with baseline; explain remaining advisories and direct/transitive paths.

Use the real approved test account against an explicitly identified test deployment and isolated customer data. Verify login/refresh/logout; Zavod raw import → mapping/selection → projection → all five report APIs AND browser UIs; safe repricing/reordering preview/export; read-only SalesDrive sync/webhook retry behavior. Native SQL timings and platform limits must be measured. No real CRM price write or supplier order delivery is implied by smoke testing.

PR body: What changed / Key decisions / Validation / Scope, package was→now table, official breaking-change references, unresolved acceptance and audit findings. Do not close acceptance work merely because build passes. Final owner-approved release uses the exact tested commit/lock/runtime.

## Mandatory gate for each block

- npx tsc --noEmit
- npm run test (bounded worker count is acceptable)
- npm run test:mvp
- npm run build
- Relevant runtime/API/native DB/browser/data-reconciliation checks for the changed library.

A red gate stops the next block. Fix within the same logical block or revert only that block and document why. The final PR must not include half-migrated runtime/library pairs.

## Rollback

Revert the logical dependency/adaptation commit(s) together with package.json and lockfile; npm ci on the known-good runtime; redeploy the previous verified artifact/commit. Restore hosting Node selection only if it changed and the previous combination is still supported. Prisma dependency work is expected to have no schema diff; any non-empty drift needs a separate plan. No blanket migration rollback or reset of customer databases. Keep test credentials and real workbook/diagnostic rows out of Git.

## Official references

- Node 26 LTS: https://nodejs.org/uk/blog/release/v26.13.0
- Vercel runtime availability: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Next 16 upgrade: https://nextjs.org/docs/app/guides/upgrading/version-16
- Prisma 6: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v6
- Prisma 7: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- Tailwind 4: https://tailwindcss.com/docs/upgrade-guide
- SheetJS distribution: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/
- Vitest 5: https://vitest.dev/guide/migration/
- TypeScript releases: https://github.com/microsoft/TypeScript/releases
- OpenAI releases: https://github.com/openai/openai-node/releases
- Anthropic migration: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/MIGRATION.md
- jose releases: https://github.com/panva/jose/releases
- bcryptjs: https://github.com/dcodeIO/bcrypt.js
- tailwind-merge: https://github.com/dcastil/tailwind-merge/releases
