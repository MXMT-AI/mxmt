BEGIN;

-- CreateTable
CREATE TABLE "ConnectorConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'salesdrive',
    "accountHost" TEXT NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "hasReceiptsKey" BOOLEAN NOT NULL DEFAULT false,
    "hasYmlUrl" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "lastCheck" JSONB,
    "checkedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorConnection_sourceId_key" ON "ConnectorConnection"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorConnection_tenantId_provider_key" ON "ConnectorConnection"("tenantId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorConnection_sourceId_tenantId_key" ON "ConnectorConnection"("sourceId", "tenantId");

-- AddForeignKey
ALTER TABLE "ConnectorConnection" ADD CONSTRAINT "ConnectorConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorConnection" ADD CONSTRAINT "ConnectorConnection_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "DataSource"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConnectorConnection" ADD CONSTRAINT "ConnectorConnection_revision_check" CHECK (revision > 0);

COMMIT;
