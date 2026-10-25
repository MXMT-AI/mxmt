-- Version 1 remains immutable and readable. New versions publish one canonical status.
ALTER TABLE "SkuDaily" ADD CONSTRAINT "SkuDaily_classification_check" CHECK (
  "calculationVersion" < 2 OR (
    classification IS NOT NULL AND classification IN ('SERVICE','DATA_ERROR','NEW','OFF_SEASON','OOS','DEAD','RISK','HEALTHY')
    AND (metrics->>'classification') IS NOT DISTINCT FROM classification
  )
);
CREATE UNIQUE INDEX "ConnectorRecalculation_one_running_source" ON "ConnectorRecalculation" ("tenantId","sourceId") WHERE state='RUNNING';
