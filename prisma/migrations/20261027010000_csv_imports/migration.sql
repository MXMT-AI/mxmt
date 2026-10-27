BEGIN;
ALTER TABLE "ConnectorSyncJob" DROP CONSTRAINT "ConnectorSyncJob_mode_check";
ALTER TABLE "ConnectorSyncJob" ADD CONSTRAINT "ConnectorSyncJob_mode_check" CHECK (mode IN ('BACKFILL','INCREMENTAL','WEBHOOK','REFRESH','CSV'));
ALTER TABLE "ConnectorSyncJob" DROP CONSTRAINT "ConnectorSyncJob_resource_check";
ALTER TABLE "ConnectorSyncJob" ADD CONSTRAINT "ConnectorSyncJob_resource_check" CHECK (resource IN ('orders','inventory','csv'));
ALTER TABLE "ConnectorSyncJob" DROP CONSTRAINT "ConnectorSyncJob_state_check";
ALTER TABLE "ConnectorSyncJob" ADD CONSTRAINT "ConnectorSyncJob_state_check" CHECK (state IN ('PENDING','RUNNING','RETRY','PAUSED','COMPLETE','FAILED','CANCELLED'));
DROP INDEX "InventorySnapshot_tenantId_skuId_snapshotDate_key";
CREATE UNIQUE INDEX "InventorySnapshot_tenant_source_sku_date" ON "InventorySnapshot" ("tenantId","sourceId","skuId","snapshotDate");
CREATE UNIQUE INDEX "InventorySnapshot_legacy_sku_date" ON "InventorySnapshot" ("tenantId","skuId","snapshotDate") WHERE "sourceId" IS NULL;
CREATE TABLE "CsvImport" (
 "id" TEXT PRIMARY KEY,
 "tenantId" TEXT NOT NULL,
 "sourceId" TEXT NOT NULL,
 "importRunId" TEXT NOT NULL UNIQUE,
 "contentHash" TEXT NOT NULL,
 "options" JSONB NOT NULL,
 "preview" JSONB NOT NULL,
 "context" JSONB NOT NULL DEFAULT '{}',
 "state" TEXT NOT NULL DEFAULT 'READY' CHECK ("state" IN ('INVALID','READY','QUEUED','ACTIVE','CANCELLED','EXPIRED')),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 "expiresAt" TIMESTAMPTZ(3) NOT NULL DEFAULT (now()+interval '30 days'),
 "activatedAt" TIMESTAMPTZ(3),
 UNIQUE ("importRunId","sourceId","tenantId"),
 FOREIGN KEY ("importRunId","sourceId","tenantId") REFERENCES "DataImportRun" ("id","sourceId","tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "CsvImport_current_hash" ON "CsvImport" ("tenantId","sourceId","contentHash") WHERE state NOT IN ('CANCELLED','EXPIRED');
CREATE INDEX "CsvImport_tenant_source_hash" ON "CsvImport" ("tenantId","sourceId","contentHash");
CREATE INDEX "CsvImport_tenant_source_created" ON "CsvImport" ("tenantId","sourceId","createdAt");
COMMIT;
