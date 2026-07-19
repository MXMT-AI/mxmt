# Frontend Architecture

## Goals

- Keep Next.js pages focused on routing, server data loading, and top-level composition.
- Keep client components small enough to reason about and review safely.
- Separate static config, shared types, pure helpers, state orchestration, and UI components.

## Module Boundaries

Use this structure for feature-heavy frontend areas:

```text
components/<feature>/
  <Feature>.tsx              # reusable UI component
  use<Feature>.ts            # client orchestration/state hook
  <feature>.config.ts        # static config and route maps
  <feature>.types.ts         # shared TypeScript contracts
  <feature>.utils.ts         # pure helpers
```

For route-specific screens, `app/**/page.tsx` should compose feature modules instead of owning all UI and orchestration logic.

## Client Components

- Add `"use client"` only to files that need browser state, effects, event handlers, or browser APIs.
- Prefer extracting client-only state/fetch/polling logic into feature hooks.
- Keep static config outside page files to avoid mixing UI and workflow definitions.
- Keep pure helpers outside client components so they can be unit-tested without React.

## Next.js Performance Rules

- Fetch independent server data in parallel with `Promise.all`.
- Avoid turning a whole route into a client component when only a subsection needs interactivity.
- Avoid large barrel imports for feature modules when direct imports are clear.
- Split very large client components by stable seams first: config, types, pure helpers, hooks, then UI sections.

## Agents Feature Example

The agents screen now uses these seams:

- `components/agents/agents.config.ts` for agent/block definitions and route maps
- `components/agents/agents.types.ts` for shared contracts
- `components/agents/agents.utils.ts` for pure formatting/simulation helpers
- `components/agents/useAgentRuns.ts` for polling and run orchestration
- `components/agents/DebugSection.tsx` for reusable debug UI

Future work should continue extracting self-contained UI sections from `app/(app)/agents/page.tsx` instead of adding more logic directly to the page.
