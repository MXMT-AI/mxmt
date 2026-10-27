-- Add source kinds without relabeling any existing source or rewriting immutable results.
ALTER TYPE "DataSourceKind" ADD VALUE IF NOT EXISTS 'KEYCRM';
ALTER TYPE "DataSourceKind" ADD VALUE IF NOT EXISTS 'HOROSHOP';
ALTER TYPE "DataSourceKind" ADD VALUE IF NOT EXISTS 'SHOPIFY';
ALTER TYPE "DataSourceKind" ADD VALUE IF NOT EXISTS 'CSV';
BEGIN;
ALTER TABLE "ReportCalculationRun" DROP CONSTRAINT "ReportCalcRun_financial_shape";
ALTER TABLE "ReportCalculationRun" ADD CONSTRAINT "ReportCalcRun_financial_shape" CHECK (
 ("reportKind"='SHEETS' AND "inputKey"='legacy' AND "financialResult" IS NULL)
 OR ("reportKind" IN ('SALESDRIVE','CONNECTOR') AND "inputKey" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("financialResult")='object' AND "financialResult" IS NOT NULL)
);
CREATE TABLE "ConnectorSelection" (
  "tenantId" TEXT PRIMARY KEY REFERENCES "Tenant"(id) ON DELETE CASCADE,
  "sourceId" TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("sourceId","tenantId") REFERENCES "DataSource"(id,"tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION
);
ALTER TABLE "ConnectorConnection" ADD COLUMN capabilities JSONB;
ALTER TABLE "ConnectorRequestBudget" ADD COLUMN "costState" JSONB;
-- Temporary page staging is durable until one validated complete observation is activated.
CREATE TABLE "ConnectorCatalogPage" (
  "jobId" TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence>=0),
  "tenantId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  payload JSONB NOT NULL,
  FOREIGN KEY("tenantId") REFERENCES "Tenant"(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("sourceId","tenantId") REFERENCES "DataSource"(id,"tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION,
  PRIMARY KEY("jobId",sequence),
  FOREIGN KEY("jobId","sourceId","tenantId") REFERENCES "ConnectorSyncJob"(id,"sourceId","tenantId") ON DELETE CASCADE ON UPDATE NO ACTION
);
COMMIT;
