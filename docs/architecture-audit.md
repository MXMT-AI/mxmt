# Architecture Audit

Date: 2026-07-15

## Executive Summary

MXMT Analytics is a workable early-stage fullstack SaaS monolith:

- Next.js App Router handles UI and API routes.
- PostgreSQL stores tenant, inventory, sales, calendar, planner, and agent data.
- Prisma is the data access layer.
- Railway hosts the app and database.
- AI providers and Google Drive are integrated server-side.

The architecture does not need a rewrite. The main problem is not the platform or framework. The main problem is missing production discipline around schema changes, auth trust boundaries, long-running jobs, validation, tests, and code ownership boundaries.

Current build status:

```bash
npm run build
```

Result: passed.

## Severity Model

- P0: must fix immediately, production blocking.
- P1: should fix before adding more major features.
- P2: should fix during hardening/refactor cycles.
- P3: cleanup or quality improvement.

## P0 Findings

No P0 production blockers found during static audit.

The project builds successfully and the current monolith shape is viable.

## P1 Findings

### 1. Production deploy uses `prisma db push`

Evidence:

- `railway.toml` starts with `npx prisma db push && npm run start`.
- `prisma/` has only `schema.prisma`, no migration history.

Risk:

- Schema changes are not auditable.
- Rollbacks are unclear.
- A deploy can silently alter production schema.
- Data loss risk grows as the schema evolves.

Recommendation:

- Create a baseline Prisma migration.
- Replace production startup with `prisma migrate deploy && npm run start`.
- Keep `db push` only for disposable local/dev databases.

### 2. API trust boundary depends on middleware-injected headers

Evidence:

- `middleware.ts` verifies JWT and injects `x-user-id`, `x-tenant-id`, `x-user-role`.
- Most API routes read `tenantId` directly from headers.
- `lib/server-auth.ts` reads those headers rather than independently validating the cookie/JWT.

Risk:

- Middleware is acting as the only authentication trust boundary.
- Sensitive route handlers are tightly coupled to header injection.
- Role enforcement is mostly absent beyond display/use in UI.

Recommendation:

- Add `requireUser()` / `requireTenant()` server helpers that validate `access_token` from cookies in route handlers.
- Keep middleware for UX redirects, not as the only authority.
- Add role gates for mutations: settings, sync, planner writes, agent runs, exports.

### 3. Open redirect in silent refresh

Evidence:

- `app/api/auth/silent-refresh/route.ts` reads `next` query param and redirects to `new URL(next, request.url)`.

Risk:

- Public auth route can redirect users to external or protocol-relative URLs if not constrained.

Recommendation:

- Accept only internal paths beginning with `/`.
- Reject `//`, absolute URLs, and malformed paths.
- Fallback to `/dashboard`.

### 4. Long-running jobs execute inside request/response routes

Evidence:

- `app/api/sync/drive/route.ts` runs `syncFromDrive()` synchronously.
- `lib/gdrive.ts` downloads XLSX, parses it, and performs many sequential Prisma writes.
- AI agent routes synchronously call Anthropic/OpenAI and wait for completion.

Risk:

- User requests can timeout.
- Retries can duplicate work.
- Failed syncs may leave partial state.
- No centralized timeout/retry/cancellation behavior.

Recommendation:

- Add job records for Drive sync and agent runs.
- For now, keep request/response but add explicit timeouts, status tracking, and idempotency guards.
- Later move heavy sync/agent chains to cron or worker-style execution if runtime becomes unstable.

### 5. No automated tests for business-critical calculations

Evidence:

- No project test files or test runner config were found.
- Business logic exists in `brand-metrics`, `channel-metrics`, `attribute-metrics`, `promo-calc`, `reorder-calc`, and `gdrive`.

Risk:

- WOH, STR, trend, promo margin, reorder quantity, and import logic can regress silently.
- New features can break analytics without build failures.

Recommendation:

- Add a lightweight test setup.
- Start with pure/unit tests for `promo-calc`, `reorder-calc`, and `classify`.
- Add integration tests around Drive parsing and auth refresh later.

## P2 Findings

### 6. Request body validation is ad hoc

Evidence:

- Many API routes call `request.json()` / `req.json()` and destructure data directly.
- No `zod`, `valibot`, or equivalent schema validation is installed.

Risk:

- Bad input reaches Prisma or AI prompts.
- TypeScript gives false confidence because runtime data is untrusted.
- Error responses are inconsistent.

Recommendation:

- Add `zod` or a small local validation layer.
- Validate all mutation routes: auth, planner, calendar, agents, export, sync.

### 7. AI agent routes duplicate execution boilerplate

Evidence:

- Each agent route creates `AgentRun`, calls `chat()`, extracts JSON with regex, saves `_debug`, catches errors, and updates status.
- Parsing uses broad `any` and fallback JSON extraction.

Risk:

- Bug fixes must be repeated across 9 routes.
- Output contracts are not strongly validated.
- Timeout/retry/cost tracking cannot be applied consistently.

Recommendation:

- Create `lib/agents/run-agent.ts`.
- Centralize:
  - creating run
  - executing chat
  - timeout/retry
  - JSON parsing
  - output validation
  - `_debug`
  - status/error updates
- Add `promptVersion`.

### 8. Drive sync is inefficient and partially non-transactional

Evidence:

- `lib/gdrive.ts` loops rows and performs sequential `upsert`, `findUnique`, `deleteMany`, `create`, and `findFirst` calls.
- Catalog refresh deletes and recreates items per brand.

Risk:

- Sync time grows quickly with file size.
- Partial imports can occur when a later row fails.
- Duplicate or inconsistent snapshots/sales are possible.

Recommendation:

- Add import session tracking.
- Batch predictable writes with `createMany` where possible.
- Add uniqueness constraints for snapshot/sales idempotency where business rules allow.
- Report skipped/failed rows with row numbers.

### 9. Multi-tenant data is sometimes passed too broadly to client components

Evidence:

- `app/(app)/assortment/page.tsx` passes full Prisma `brands`.
- `app/(app)/calendar/page.tsx` passes full `MarketingEvent` rows.
- `app/(app)/settings/page.tsx` passes full `GoogleDriveSync`.

Risk:

- Internal IDs and tenant metadata leak to the client unnecessarily.
- Client contracts are unclear.

Recommendation:

- Use explicit DTO mapping in server components.
- Select only fields the client needs.

### 10. Large client components create maintenance and bundle risk

Evidence:

- `app/(app)/agents/page.tsx`: 2227 lines.
- `components/planner/PlannerApp.tsx`: 1109 lines.
- `components/calendar/MarketingCalendar.tsx`: 909 lines.

Risk:

- New features become harder to add safely.
- State/effects become coupled.
- More UI ships as client JavaScript than necessary.

Recommendation:

- Split by feature boundaries:
  - `AgentsClient`, `AgentCard`, `AgentResultRenderer`, modals, debug panel.
  - planner hooks for cart persistence and item loading.
  - calendar grid, event modals, insights/stock panels.

### 11. Race conditions in client-side planner flows

Evidence:

- Item loading and debounced cart saves use client fetch/setTimeout patterns without robust cancellation/version guards.

Risk:

- Old requests can overwrite newer UI state.
- Debounced saves can fire after unmount.
- Out-of-order saves can persist stale cart data.

Recommendation:

- Use `AbortController` or request version guards.
- Clear pending debounce on unmount.
- Track cart save status and last saved revision.

### 12. No health check or operational status endpoints

Evidence:

- No `/api/health`.
- No admin/ops view for DB, sync, agent, or version status.

Risk:

- Deploy and runtime failures are harder to detect.
- Railway cannot easily distinguish app up from app healthy.

Recommendation:

- Add `/api/health`.
- Include app version, DB connectivity, and basic env readiness.
- Add an internal ops/status page later.

## P3 Findings

### 13. Prisma client is initialized at module scope

Evidence:

- `lib/prisma.ts` exports a module-scope Prisma singleton.

Risk:

- This is common and usually acceptable on Railway.
- It can become a build/runtime issue in some serverless contexts, but is not urgent on current Railway setup.

Recommendation:

- Keep for now on Railway.
- If moving to serverless later, revisit connection handling and lazy initialization.

### 14. Accessibility gaps in custom UI

Evidence:

- Some clickable spans, icon-only buttons without labels, labels without `htmlFor`, and custom modals without full dialog semantics.

Risk:

- Keyboard and screen reader usability suffers.
- Regression risk grows with more custom UI.

Recommendation:

- Fix opportunistically while editing affected components.
- Prioritize calendar event actions, auth forms, planner modals, and agent modals.

### 15. Documentation is accurate but operationally mixed

Evidence:

- README documents many implementation details, Railway setup, and known bugs.
- There is no short production runbook.

Risk:

- Future changes depend on tribal knowledge.
- Recovery steps are scattered.

Recommendation:

- Add `RUNBOOK.md`:
  - deploy
  - env vars
  - backup/restore
  - failed Drive sync
  - failed AI agent
  - DB migration process

## What Is Architecturally Good

- The fullstack monolith is appropriate for this product stage.
- Multi-tenant model is consistently represented with `tenantId`.
- Server Components are used for initial data on dashboard, settings, calendar, analyst, and assortment.
- AI keys and Google keys are server-side.
- `AgentRun` provides a useful audit trail for AI execution.
- `_debug` output is valuable for observability while the product is still evolving.
- Business metric logic is separated into `lib/*-metrics.ts`.
- `npm run build` passes.

## Recommended Fix Order

### Week 1: Safety Foundation

1. Replace `db push` production flow with Prisma migrations.
2. Fix silent refresh open redirect.
3. Add server-side auth helper for sensitive API routes.
4. Add `/api/health`.
5. Update `.env.example` and create a short Railway production runbook.

### Week 2: Data + Job Reliability

1. Add unit tests for `classify`, `promo-calc`, and `reorder-calc`.
2. Add Drive sync import session/status model or strengthen `GoogleDriveSync`.
3. Add timeout/retry wrapper around AI provider calls.
4. Add idempotency/concurrency protection for agent runs and Drive sync.
5. Add file-size and row-count limits for catalog upload.

### Week 3: API Contracts

1. Add runtime validation for mutation APIs.
2. Introduce DTO mappers in server pages.
3. Add role checks to writes and exports.
4. Normalize API error responses.

### Week 4: Maintainability

1. Extract shared agent runner.
2. Split `/agents` page into smaller components.
3. Split `PlannerApp` into feature components/hooks.
4. Fix accessibility issues in touched components.

## Do Not Do Yet

- Do not rewrite from scratch.
- Do not migrate off Railway just to solve code quality problems.
- Do not switch Prisma to Drizzle before fixing migrations/tests/auth.
- Do not add major new product modules until P1 items are fixed.

## Production Readiness Verdict

Current state: functional MVP, not production-grade enough for sensitive commercial customer data.

Path forward: keep Railway and Next.js monolith, but harden the architecture before adding major features.

Minimum bar before serious production use:

- controlled migrations
- backup/restore runbook
- auth hardening
- tests for calculations
- healthier long-running jobs
- basic observability
