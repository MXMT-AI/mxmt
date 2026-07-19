# Testing

## Commands

Run unit tests:

```bash
npm run test
```

Run unit tests in watch mode:

```bash
npm run test:watch
```

Run production build validation:

```bash
npm run build
```

Before opening a PR, run:

```bash
npm run test
npm run build
```

## Current Scope

The test suite covers critical production-hardening helpers:

- API error envelopes and JSON parsing contracts
- API field validation helpers
- AI provider resolution and model mapping
- AI agent JSON output parsing

Tests are intentionally unit-level and do not require a database, network, or external AI provider keys.

## Adding Tests

- Put tests under `tests/**/*.test.ts`.
- Prefer pure helper tests for business logic and contracts.
- Do not call real external APIs in unit tests.
- Mock database/network boundaries before adding route-level integration tests.
- Keep tests deterministic and fast enough for PR checks.
