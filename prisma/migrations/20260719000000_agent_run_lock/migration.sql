-- Allow at most one active run per tenant and agent type.
-- Existing duplicate running rows are closed before the partial unique index is added.
WITH ranked_running AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY "tenantId", "agentType" ORDER BY "startedAt" DESC, id DESC) AS rn
  FROM "AgentRun"
  WHERE status = 'running'
)
UPDATE "AgentRun" run
SET status = 'error',
    "errorMsg" = 'Closed by migration before adding running agent lock',
    "finishedAt" = NOW()
FROM ranked_running ranked
WHERE run.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX "AgentRun_tenantId_agentType_running_key"
ON "AgentRun"("tenantId", "agentType")
WHERE status = 'running';
