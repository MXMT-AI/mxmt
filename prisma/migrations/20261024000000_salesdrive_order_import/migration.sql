-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "datePrecision" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "identityDerived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sourceAmounts" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "sourceSku" TEXT;

-- CreateTable
CREATE TABLE "ConnectorSyncJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "connectionRevision" INTEGER NOT NULL,
    "checkpoint" JSONB NOT NULL,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ConnectorSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderImportState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "sourceVersion" INTEGER,
    "sourceUpdatedAt" TIMESTAMPTZ(3),
    "payloadHash" TEXT NOT NULL,
    "projectionHash" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderImportState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorRequestBudget" (
    "accountKey" TEXT NOT NULL,
    "blockedUntil" TIMESTAMPTZ(3),

    CONSTRAINT "ConnectorRequestBudget_pkey" PRIMARY KEY ("accountKey")
);

-- CreateTable
CREATE TABLE "ConnectorRequestAttempt" (
    "id" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorRequestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorSyncJob_importRunId_key" ON "ConnectorSyncJob"("importRunId");

-- CreateIndex
CREATE INDEX "ConnectorSyncJob_state_availableAt_idx" ON "ConnectorSyncJob"("state", "availableAt");

-- CreateIndex
CREATE INDEX "ConnectorSyncJob_tenantId_sourceId_createdAt_idx" ON "ConnectorSyncJob"("tenantId", "sourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderImportState_tenantId_sourceId_externalOrderId_key" ON "OrderImportState"("tenantId", "sourceId", "externalOrderId");

-- CreateIndex
CREATE INDEX "ConnectorRequestAttempt_accountKey_at_idx" ON "ConnectorRequestAttempt"("accountKey", "at");

-- AddForeignKey
ALTER TABLE "ConnectorSyncJob" ADD CONSTRAINT "ConnectorSyncJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSyncJob" ADD CONSTRAINT "ConnectorSyncJob_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "DataSource"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSyncJob" ADD CONSTRAINT "ConnectorSyncJob_importRunId_sourceId_tenantId_fkey" FOREIGN KEY ("importRunId", "sourceId", "tenantId") REFERENCES "DataImportRun"("id", "sourceId", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderImportState" ADD CONSTRAINT "OrderImportState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderImportState" ADD CONSTRAINT "OrderImportState_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "DataSource"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderImportState" ADD CONSTRAINT "OrderImportState_importRunId_sourceId_tenantId_fkey" FOREIGN KEY ("importRunId", "sourceId", "tenantId") REFERENCES "DataImportRun"("id", "sourceId", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ConnectorRequestAttempt" ADD CONSTRAINT "ConnectorRequestAttempt_accountKey_fkey" FOREIGN KEY ("accountKey") REFERENCES "ConnectorRequestBudget"("accountKey") ON DELETE CASCADE ON UPDATE CASCADE;


-- Keep one checkpoint writer per source, including webhook refetches.
CREATE UNIQUE INDEX "ConnectorSyncJob_one_active_source" ON "ConnectorSyncJob" ("tenantId", "sourceId")
WHERE state IN ('PENDING','RUNNING','RETRY','PAUSED');
ALTER TABLE "ConnectorSyncJob" ADD CONSTRAINT "ConnectorSyncJob_state_check"
CHECK (state IN ('PENDING','RUNNING','RETRY','PAUSED','COMPLETE','FAILED'));
ALTER TABLE "ConnectorSyncJob" ADD CONSTRAINT "ConnectorSyncJob_mode_check"
CHECK (mode IN ('BACKFILL','INCREMENTAL','WEBHOOK'));
