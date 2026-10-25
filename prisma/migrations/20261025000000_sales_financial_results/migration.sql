-- Reuse the existing calculation lifecycle while keeping legacy cache identity intact.
ALTER TABLE "ReportCalculationRun"
 ADD COLUMN "reportKind" text NOT NULL DEFAULT 'SHEETS',
 ADD COLUMN "inputKey" text NOT NULL DEFAULT 'legacy',
 ADD COLUMN "financialResult" jsonb;
DROP INDEX "ReportCalcRun_cache_key";
CREATE UNIQUE INDEX "ReportCalcRun_cache_key" ON "ReportCalculationRun" ("tenantId","importRunId","dateFrom","dateTo","asOfDate","calculationVersion","inputKey");
ALTER TABLE "ReportCalculationRun" ADD CONSTRAINT "ReportCalcRun_financial_shape" CHECK (
 ("reportKind"='SHEETS' AND "inputKey"='legacy' AND "financialResult" IS NULL)
 OR ("reportKind"='SALESDRIVE' AND "inputKey" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("financialResult")='object' AND "financialResult" IS NOT NULL)
);
