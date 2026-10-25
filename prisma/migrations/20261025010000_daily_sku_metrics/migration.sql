-- Extend the existing versioned SKU daily materialization; preserve legacy rows.
ALTER TABLE "SkuDaily"
 ALTER COLUMN "velocityPerWeek" TYPE numeric(38,18),
 ALTER COLUMN "weeksOnHand" TYPE numeric(38,18),
 ADD COLUMN quantity numeric(18,4),
 ADD COLUMN "stockCostValue" numeric(38,4),
 ADD COLUMN "stockRetailValue" numeric(38,4),
 ADD COLUMN "daysToZero" numeric(38,18),
 ADD COLUMN "sellThroughRatio" numeric(38,18),
 ADD COLUMN active boolean,
 ADD COLUMN metrics jsonb NOT NULL DEFAULT '{}';
ALTER TABLE "SkuDaily" ADD CONSTRAINT "SkuDaily_metrics_shape" CHECK (jsonb_typeof(metrics)='object');
ALTER TABLE "SkuDaily" ADD CONSTRAINT "SkuDaily_nonnegative_metrics" CHECK (
 (quantity IS NULL OR quantity>=0) AND ("velocityPerWeek" IS NULL OR "velocityPerWeek">=0)
 AND ("weeksOnHand" IS NULL OR "weeksOnHand">=0) AND ("daysToZero" IS NULL OR "daysToZero">=0)
 AND ("stockCostValue" IS NULL OR "stockCostValue">=0) AND ("stockRetailValue" IS NULL OR "stockRetailValue">=0)
 AND ("sellThroughRatio" IS NULL OR "sellThroughRatio" BETWEEN 0 AND 1)
);
