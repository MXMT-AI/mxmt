-- AlterTable
ALTER TABLE "ConnectorConnection" ADD COLUMN     "lastScheduledAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "ConnectorSyncCycle" (
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "ordersJobId" TEXT,
    "inventoryJobId" TEXT,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "errorCode" TEXT,

    CONSTRAINT "ConnectorSyncCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorRecalculation" (
    "importRunId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'WAITING_ENGINE',
    "inputProvenance" JSONB NOT NULL,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorRecalculation_pkey" PRIMARY KEY ("importRunId")
);

-- CreateIndex
CREATE INDEX "ConnectorSyncCycle_dispatchedAt_requestedAt_idx" ON "ConnectorSyncCycle"("dispatchedAt", "requestedAt");

-- CreateIndex
CREATE INDEX "ConnectorSyncCycle_dispatchedAt_availableAt_idx" ON "ConnectorSyncCycle"("dispatchedAt", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorSyncCycle_tenantId_sourceId_requestKey_key" ON "ConnectorSyncCycle"("tenantId", "sourceId", "requestKey");

-- CreateIndex
CREATE INDEX "ConnectorRecalculation_tenantId_sourceId_requestedAt_idx" ON "ConnectorRecalculation"("tenantId", "sourceId", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorRecalculation_importRunId_sourceId_tenantId_key" ON "ConnectorRecalculation"("importRunId", "sourceId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorSyncJob_scoped_id" ON "ConnectorSyncJob"("id", "sourceId", "tenantId");

-- AddForeignKey
ALTER TABLE "ConnectorSyncCycle" ADD CONSTRAINT "ConnectorSyncCycle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSyncCycle" ADD CONSTRAINT "ConnectorSyncCycle_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "DataSource"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSyncCycle" ADD CONSTRAINT "ConnectorSyncCycle_ordersJobId_sourceId_tenantId_fkey" FOREIGN KEY ("ordersJobId", "sourceId", "tenantId") REFERENCES "ConnectorSyncJob"("id", "sourceId", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ConnectorSyncCycle" ADD CONSTRAINT "ConnectorSyncCycle_inventoryJobId_sourceId_tenantId_fkey" FOREIGN KEY ("inventoryJobId", "sourceId", "tenantId") REFERENCES "ConnectorSyncJob"("id", "sourceId", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ConnectorRecalculation" ADD CONSTRAINT "ConnectorRecalculation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorRecalculation" ADD CONSTRAINT "ConnectorRecalculation_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "DataSource"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorRecalculation" ADD CONSTRAINT "ConnectorRecalculation_importRunId_sourceId_tenantId_fkey" FOREIGN KEY ("importRunId", "sourceId", "tenantId") REFERENCES "DataImportRun"("id", "sourceId", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Queue independently, serialize only leased writers per source.
DROP INDEX "ConnectorSyncJob_one_active_source";
CREATE UNIQUE INDEX "ConnectorSyncJob_one_active_source" ON "ConnectorSyncJob" ("tenantId", "sourceId") WHERE state='RUNNING';
ALTER TABLE "ConnectorSyncCycle" ADD CONSTRAINT "ConnectorSyncCycle_resource_check" CHECK (resource IN ('orders','inventory','both'));
ALTER TABLE "ConnectorRecalculation" ADD CONSTRAINT "ConnectorRecalculation_state_check" CHECK (state IN ('WAITING_ENGINE','PENDING','RUNNING','COMPLETE','FAILED'));
