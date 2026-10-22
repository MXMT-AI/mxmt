ALTER TABLE "MarketingEvent"
ADD COLUMN "sourceAgentRunId" TEXT,
ADD COLUMN "recommendationKey" TEXT,
ADD COLUMN "brandId" TEXT,
ADD COLUMN "channel" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedBy" TEXT;

CREATE INDEX "MarketingEvent_tenantId_brandId_idx"
ON "MarketingEvent"("tenantId", "brandId");

CREATE UNIQUE INDEX "MarketingEvent_tenantId_recommendationKey_rowKey_key"
ON "MarketingEvent"("tenantId", "recommendationKey", "rowKey");
