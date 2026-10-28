# AI Agents Runbook

Design references: [`agent-architecture.md`](./agent-architecture.md) and
[`agent-prompts-reference.md`](./agent-prompts-reference.md). Runtime routes and
prompts in `app/api/agents/*/route.ts` remain the source of truth.

## Required Environment

At least one provider key must be configured for the selected provider:

| Provider | Env var |
| --- | --- |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |

`AI_PROVIDER` supports only:

- `anthropic`
- `openai`

Invalid provider values fall back to `openai` (see `resolveAiProvider` in `lib/ai.ts`).

## V2 planning and acceptance

The audit and separate implementation specifications for #53 are in
[`v2-ai-delivery-plan.md`](./v2-ai-delivery-plan.md). They describe planned work,
not activated capabilities. Spreadsheet/business-rule and agent acceptance
remain tracked in #92; a completed preparation PR does not satisfy that gate.
Legacy architecture token/cost examples are not measured usage or approved budgets.

The opt-in v2 server foundation is documented in
[`93-ai-execution-context-budgets.md`](../prisma/verification/93-ai-execution-context-budgets.md).
It validates saved MVP evidence and reserves/meters each paid attempt. It does not
migrate the legacy routes or enable a policy by default. Only explicitly approved
administrative provisioning may enable a new tenant-period budget.

The read-only merchandising chat uses explicit `mode: "merchandising"` on
`POST /api/ai`; see
[`94-evidence-backed-merchandising-chat.md`](../prisma/verification/94-evidence-backed-merchandising-chat.md).
It requires the `merchandising_chat` capability in an approved budget policy and
keeps legacy planner/analyst requests separate. Customer evaluation remains in #92.

Versioned Commercial Marketer briefs use explicit `mode: "marketing_v2"` on
the existing commercial-marketer and recommendation approval routes; see
[`95-versioned-marketing-briefs.md`](../prisma/verification/95-versioned-marketing-briefs.md).
The `marketing_briefs` capability reserves the whole selected-channel request.
Exact offers remain server facts, channel failures retain successful drafts and
actual usage, and owner approval/calendar handoff are separate idempotent steps.
Website is an explicit channel. No policy, advertising or publication is enabled
by adding this mode. Legacy calendar `ai-plan` is not used as v2 evidence.

Versioned Meta/Google custom-label exports are deterministic and make zero LLM
calls. See the dated
[`provider contract`](../prisma/verification/96-custom-label-provider-contract.md)
and [`API/verification guide`](../prisma/verification/96-custom-label-exports.md).
Owner-approved profiles bind source, catalog/feed identity, mappings, slot
ownership and ordered rules. Preview/export use saved MVP classifications and
retain exact CSV bytes, source/rule versions and actor history. The initial
slot-zero/class and omission policy was owner-approved on 2026-10-28; real
account mappings/ownership still require profile-specific approval. Downloads
do not upload a feed, modify campaigns or activate a provider integration.

The opt-in Product Attributes mode (`attributes_v2`) uses retained physical-field
evidence, versioned dictionaries and saved MVP stock/sales metrics; see
[`97-product-attribute-analysis.md`](../prisma/verification/97-product-attribute-analysis.md).
Dictionary preparation, sample projection and explicit sample/rubric approval
are separate operations. The owner deferred real samples and activation on
2026-10-28. No customer dictionary or default physical dimension is installed.
V2 analysis makes no LLM calls and cannot reinterpret legacy category STR as
dial-color/size evidence. Apply the attribute-evidence lookup index migration
before enabling this path for an approved client.

## External market evidence (#98)

See [`98-external-market-evidence.md`](../prisma/verification/98-external-market-evidence.md)
for versioned source policies, source-only quotas, retained evidence, recovery and
retention operations. The owner chose mechanism preparation on 2026-10-28;
source selection and activation remain deferred. Production has no market adapter,
no external request is made, and no optional LLM summary or forecast input is enabled.
Verify source rights, costs, relevance and daily cleanup before a future integration.

## New-product forecast research (#99)

See [`99-new-product-analog-forecast.md`](../prisma/verification/99-new-product-analog-forecast.md)
for explicit draft policies, frozen analog evidence and later time-split evaluation.
The owner chose mechanism preparation on 2026-10-28; business rules and activation
remain deferred. All outputs stay drafts, uncertainty is unevaluated, and a passing
draft score never approves release. No LLM call, scheduled forecast or procurement
conversion is enabled; existing reordering calculations and exports are unchanged.

## Runtime Behavior

- Agent output JSON is parsed through `parseAgentJson`.
- JSON inside fenced code blocks is supported.
- Invalid AI JSON does not crash the route; the run stores fallback output plus `parseError` in debug metadata where available.
- Only one `running` row is allowed per `tenantId + agentType`.
- A second run request returns `409` with `AGENT_RUN_ALREADY_RUNNING`.

## Recovery

For ledger-backed v2 runs, use the explicit recovery/reconciliation procedures in
the #93 verification guide. Updating `AgentRun` alone does not settle usage or
release budget reservations. The manual procedure below applies to legacy runs.

If an agent appears stuck:

1. Check `/api/health` for `stale_agent_runs`.
2. Inspect the latest `AgentRun` row for `status = 'running'`.
3. If the provider request is no longer active, close the row manually:

```sql
UPDATE "AgentRun"
SET status = 'error',
    "errorMsg" = 'Manually closed stale run',
    "finishedAt" = NOW()
WHERE id = '<run_id>';
```

4. Re-run the agent from the UI.

## Deploy Notes

Run migrations before releasing this phase:

```bash
npx prisma migrate deploy
npm run build
```

The migration adds a partial unique index for active agent runs. Existing duplicate `running` rows are closed before the index is created.
