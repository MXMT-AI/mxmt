CREATE UNIQUE INDEX "AgentRun_id_tenantId_key" ON "AgentRun"(id,"tenantId");
CREATE TABLE "AiBudgetPeriod" (
 id text PRIMARY KEY, "tenantId" text NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "startsAt" timestamptz(3) NOT NULL, "endsAt" timestamptz(3) NOT NULL,
 enabled boolean NOT NULL DEFAULT false, policy jsonb NOT NULL,
 "approvedBy" text NOT NULL, "approvalReference" text NOT NULL,
 spent numeric(24,8) NOT NULL DEFAULT 0, reserved numeric(24,8) NOT NULL DEFAULT 0,
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(id,"tenantId"), CHECK("endsAt">"startsAt"), CHECK(spent>=0 AND reserved>=0)
);
CREATE INDEX "AiBudgetPeriod_tenantId_startsAt_endsAt_idx" ON "AiBudgetPeriod"("tenantId","startsAt","endsAt");
CREATE TABLE "AiExecution" (
 id text PRIMARY KEY, "tenantId" text NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "periodId" text NOT NULL, "runId" text NOT NULL UNIQUE,
 "requestKey" text NOT NULL, fingerprint text NOT NULL, capability text NOT NULL,
 metadata jsonb NOT NULL, state text NOT NULL DEFAULT 'RUNNING',
 held numeric(24,8) NOT NULL, charged numeric(24,8) NOT NULL DEFAULT 0,
 result jsonb, "errorCode" text, "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "finishedAt" timestamptz(3),
 UNIQUE(id,"tenantId"), UNIQUE("tenantId","requestKey"), UNIQUE("runId","tenantId"),
 FOREIGN KEY("periodId","tenantId") REFERENCES "AiBudgetPeriod"(id,"tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY("runId","tenantId") REFERENCES "AgentRun"(id,"tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
 CHECK(held>=0 AND charged>=0), CHECK(state IN ('RUNNING','DONE','ERROR'))
);
CREATE INDEX "AiExecution_periodId_capability_idx" ON "AiExecution"("periodId",capability);
CREATE TABLE "AiUsageAttempt" (
 id text PRIMARY KEY, "tenantId" text NOT NULL, "executionId" text NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal>0), state text NOT NULL DEFAULT 'STARTED',
 allowance numeric(24,8) NOT NULL CHECK(allowance>=0), charged numeric(24,8) CHECK(charged>=0),
 usage jsonb, quality text, "requestId" text, "responseModel" text,
 "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "finishedAt" timestamptz(3),
 UNIQUE("executionId",ordinal),
 FOREIGN KEY("executionId","tenantId") REFERENCES "AiExecution"(id,"tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
 CHECK(state IN ('STARTED','SETTLED')),
 CHECK(quality IS NULL OR quality IN ('EXACT','ESTIMATED','UNKNOWN'))
);
CREATE INDEX "AiUsageAttempt_tenantId_state_createdAt_idx" ON "AiUsageAttempt"("tenantId",state,"createdAt");
