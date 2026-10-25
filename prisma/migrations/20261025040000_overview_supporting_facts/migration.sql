-- Add dated, frozen supporting facts for YTD charts and full-month LY outlier checks.
-- Existing period-only snapshots retain null dates and remain readable.
ALTER TABLE "MerchandisingScreenFact" ADD COLUMN "businessDate" DATE;
ALTER TABLE "MerchandisingScreenFact" ADD COLUMN "isSupporting" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MerchandisingScreenFact" DROP CONSTRAINT "MerchandisingScreenFact_check";
ALTER TABLE "MerchandisingScreenFact" ADD CONSTRAINT "ScreenFact_membership_check"
  CHECK ("inCurrent" OR "inPriorYear" OR "isSupporting");
ALTER TABLE "MerchandisingScreenFact" ADD CONSTRAINT "ScreenFact_supporting_date_check"
  CHECK (NOT "isSupporting" OR "businessDate" IS NOT NULL);
CREATE INDEX "ScreenFact_timeline" ON "MerchandisingScreenFact" ("tenantId","snapshotId","businessDate");
