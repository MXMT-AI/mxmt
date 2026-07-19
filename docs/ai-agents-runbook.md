# AI Agents Runbook

## Required Environment

At least one provider key must be configured for the selected provider:

| Provider | Env var |
| --- | --- |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `OPENAI_API_KEY` |

`AI_PROVIDER` supports only:

- `anthropic`
- `openai`

Invalid provider values fall back to `anthropic`.

## Runtime Behavior

- Agent output JSON is parsed through `parseAgentJson`.
- JSON inside fenced code blocks is supported.
- Invalid AI JSON does not crash the route; the run stores fallback output plus `parseError` in debug metadata where available.
- Only one `running` row is allowed per `tenantId + agentType`.
- A second run request returns `409` with `AGENT_RUN_ALREADY_RUNNING`.

## Recovery

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
