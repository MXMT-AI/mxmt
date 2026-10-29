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

The runtime block is ready for owner review. No commit or push has been made. Successful local Vercel-build validation does not confirm the remote project's selected runtime or a deployed preview.

Security advisories are unchanged in this runtime-only block. Compatible Next/PostCSS/Vitest updates are next, after approval of this logical checkpoint.
