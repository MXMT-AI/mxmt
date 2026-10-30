# Dependency upgrade completion report

Branch: `chore/deps-upgrade`; baseline: `5dc9405`. Prepared 2026-10-30. All implementation blocks are separate local commits, intended for one PR. No push, preview deployment or production runtime change has been performed.

## What changed

Updated the complete dependency set to the reviewed stable targets. Node 24 LTS replaces the original Node 26 proposal by explicit owner decision. Prisma 8 release candidates are excluded; Node types intentionally match Node 24. SheetJS uses the official stable vendor tarball because the npm registry version is stale. Already-current pinned dependencies remain unchanged.

| Package | Baseline lock | Accepted lock |
| --- | --- | --- |
| `@anthropic-ai/sdk` | 0.39.0 | 1.3.0 |
| `@electric-sql/pglite` | 0.5.11 | 0.5.13 |
| `@js-temporal/polyfill` | 0.5.1 | 0.5.1 |
| `@prisma/adapter-pg` | — | 7.10.1 |
| `@prisma/client` | 5.22.0 | 7.10.1 |
| `@tailwindcss/forms` | 0.5.11 | 0.5.11 |
| `@tailwindcss/postcss` | — | 4.3.3 |
| `@types/bcryptjs` | 2.4.6 | removed |
| `@types/node` | 22.19.21 | 24.19.2 |
| `@types/react` | 19.2.17 | 19.3.0 |
| `@types/react-dom` | 19.2.3 | 19.3.0 |
| `autoprefixer` | 10.5.0 | removed |
| `bcryptjs` | 2.4.3 | 3.0.3 |
| `clsx` | 2.1.1 | 2.1.1 |
| `fast-xml-parser` | 5.11.2 | 5.11.2 |
| `jose` | 5.10.0 | 6.2.14 |
| `lossless-json` | 4.3.3 | 4.3.3 |
| `lucide-react` | 0.468.0 | 1.64.0 |
| `next` | 15.5.19 | 16.4.3 |
| `openai` | 4.104.0 | 7.45.1 |
| `postcss` | 8.5.20 | 8.5.32 |
| `prisma` | 5.22.0 | 7.10.1 |
| `react` | 19.2.7 | 19.3.1 |
| `react-dom` | 19.2.7 | 19.3.1 |
| `server-only` | 0.0.1 | 0.0.1 |
| `tailwind-merge` | 2.6.1 | 3.7.0 |
| `tailwindcss` | 3.4.19 | 4.3.3 |
| `typescript` | 5.9.3 | 7.0.2 |
| `vite` | — | 8.3.5 |
| `vitest` | 4.1.10 | 5.0.5 |
| `xlsx` | 0.18.5 | 0.20.3 |

Runtime: Node 20.19.6 → 24.22.2; npm 11.12.1 → 11.19.1. `.nvmrc`, package engines and packageManager are aligned.

## Key decisions

- Prisma 5 → 6 → 7 checkpoints; explicit PostgreSQL adapter/pool configuration and Prisma config/env loading. Native PostgreSQL schema diffs are empty; this work adds no model/schema migrations. Production migration checks remain non-mutating.
- Next 16 uses Node `proxy.ts`; authentication behavior remains covered by legacy JWT/hash fixtures, security tests and local HTTP checks. No new cache behavior was enabled.
- AI SDK migrations retain approved models, provider endpoints, retry/budget ownership and token accounting. SDK fetch-contract tests do not make paid requests.
- SheetJS compatibility adapter preserves existing dates, exact IDs, cached text, row hashes and financial behavior. The same frozen real workbook produces identical audit and offline projection evidence; see [comparison](sheetjs-comparison.json).
- Tailwind 4 uses CSS theme configuration and its PostCSS plugin, with tailwind-merge 3. Autoprefixer is removed as redundant; PostCSS remains. Style migration has no non-string TSX AST changes. Browser minimums: Safari 16.4, Chrome 111, Firefox 128. Minor spacing differences were observed, without broken navigation/controls.
- TypeScript 6 → 7 checkpoints retain strictness. Vitest 5 preserves prior explicit mock-history behavior; no new skips, longer timeouts or weakened assertions were used to hide regressions.

## Validation

Final clean-install rehearsal passed in an independent directory with npm ci from the accepted lock: TypeScript, full/MVP suites, build and build:vercel all exit 0. Production and development HTTP checks passed. See [machine-readable validation](final-validation.json). Every accepted implementation block passed TypeScript, the full suite, MVP suite and both builds; detailed history is in [progress](progress.md).

- Full suite: 167 files, 1,651 passed, one existing optional private-workbook test skipped.
- MVP suite: 80 files, 965 passed (overlaps the full suite).
- SheetJS real-workbook offline checks: six files, 84 passed; these explicitly supply the private workbook.
- Local native PostgreSQL: CRUD, parameterized SQL, JSON/Decimal/BigInt and serializable rollback passed; local production HTTP login/database health/protected-route redirect passed.
- Browser review used an isolated synthetic admin: five report empty-source states, Settings, light/dark Overview, 390px mobile menu, English/Ukrainian and visible keyboard focus. This does not accept populated customer report tables, sliders or dialogs.
- Final rehearsal encountered intermittent wall-clock timeouts: first run in connector-source-api setup (166 other files passed), second in five different SQL/volume cases (162 other files passed). A further unchanged run temporarily prevents idle system sleep only while the test command runs; system sleep is a suspected cause, not confirmed telemetry. The unchanged final run passed all 167 files in 55.71s and all 80 MVP files in 32.50s; outcomes are recorded in final-validation.json. No test timeout, assertion or skip was changed.
- Audit: baseline 13 (1 critical, 8 high, 4 moderate) → final 0. No forced audit fixes, overrides or suppressed advisories.

## Scope and release limitations

- Effective Vercel Node version and real preview deployment remain unverified: the selected account returned project 404. Local `build:vercel` success does not establish hosted execution.
- Complete customer-data acceptance remains open. Baseline real-data five-screen projection had a disposable PGlite timeout, and Zavod business reconciliation still requires source-owner decisions. Reference-only reconciliation remains BLOCKED (31 blockers); workbook audit remains REQUIRES_SOURCE_RECONCILIATION. Equal before/after evidence is compatibility proof, not business approval.
- No live SalesDrive sync/write, supplier delivery or paid AI request was run. GPT-4o deprecation/model access requires a separate product decision; configured models were not silently replaced.
- Verification uses an isolated native PostgreSQL database and a frozen private workbook. No production DB migration, source activation or customer-data export was performed. Private workbook/credentials are excluded from Git.

## Rollback

Revert each dependency/adaptation block together with its package/lock changes, run npm ci on the corresponding known-good Node version, then redeploy the previously verified artifact. No customer database reset or migration rollback is needed for this schema-neutral upgrade. Hosted runtime settings have not been changed by this work.

## Migration references

Official references and block-specific findings are recorded in [plan](plan.md) and [progress](progress.md), including Next 16, Prisma 6/7, Tailwind 4, TypeScript 6/7, Vitest 5 and SDK migration guides. Accepted package integrity is pinned in package-lock.json.
