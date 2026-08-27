-- CreateEnum
CREATE TYPE "DataImportTrigger" AS ENUM ('MANUAL', 'CRON');

-- CreateEnum
CREATE TYPE "DataRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'WARNING', 'FAILED');

-- CreateEnum
CREATE TYPE "DataIssueSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "ProductMatchStatus" AS ENUM ('PENDING', 'MATCHED', 'AMBIGUOUS', 'UNMATCHED');

-- Existing users need a composite candidate key for tenant-safe preferences.
CREATE UNIQUE INDEX "User_id_tenantId_key" ON "User"("id", "tenantId");

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'ZAVOD Google Sheets',
    "driveFileId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Kyiv',
    "allowedSheets" JSONB NOT NULL DEFAULT '[]',
    "activeImportRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImportRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "trigger" "DataImportTrigger" NOT NULL,
    "status" "DataRunStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "sourceChecksum" TEXT,
    "sourceModifiedAt" TIMESTAMP(3),
    "stats" JSONB NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSheetSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "sheetKey" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "headerRow" INTEGER NOT NULL,
    "columns" JSONB NOT NULL DEFAULT '[]',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataSheetSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSheetRow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "rowHash" TEXT NOT NULL,
    "searchText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataSheetRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "article" TEXT,
    "vendorCode" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "retailPrice" DECIMAL(18,4) NOT NULL,
    "oldPrice" DECIMAL(18,4),
    "costPrice" DECIMAL(18,4) NOT NULL,
    "stockUnits" DECIMAL(18,4) NOT NULL,
    "sourceStatus" TEXT,
    "sourceValues" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSaleLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "sourceLineId" TEXT,
    "orderId" TEXT,
    "rowHash" TEXT NOT NULL,
    "orderTime" TIMESTAMP(3),
    "paymentDate" DATE,
    "statusId" INTEGER,
    "productSku" TEXT,
    "productParameter" TEXT,
    "sourceProductId" TEXT,
    "manufacturer" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "salesAmount" DECIMAL(18,4) NOT NULL,
    "costAmount" DECIMAL(18,4) NOT NULL,
    "normalizedQuantity" DECIMAL(18,4),
    "normalizedSales" DECIMAL(18,4),
    "normalizedCost" DECIMAL(18,4),
    "matchStatus" "ProductMatchStatus" NOT NULL DEFAULT 'PENDING',
    "matchMethod" TEXT,
    "resolvedProductId" TEXT,
    "sourceValues" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceSaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportIssue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "sheetKey" TEXT,
    "rowNumber" INTEGER,
    "code" TEXT NOT NULL,
    "severity" "DataIssueSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCalculationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "asOfDate" DATE NOT NULL,
    "calculationVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "DataRunStatus" NOT NULL DEFAULT 'PENDING',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportCalculationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleReportResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "calculationRunId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "article" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "costPrice" DECIMAL(18,4) NOT NULL,
    "rrp" DECIMAL(18,4),
    "retailPrice" DECIMAL(18,4) NOT NULL,
    "discount" DECIMAL(20,10),
    "gmPct" DECIMAL(20,10),
    "salesUnits" DECIMAL(18,4) NOT NULL,
    "salesUah" DECIMAL(18,4) NOT NULL,
    "costOfSalesUah" DECIMAL(18,4) NOT NULL,
    "gpUah" DECIMAL(18,4) NOT NULL,
    "salesGmPct" DECIMAL(20,10),
    "stockUnits" DECIMAL(18,4) NOT NULL,
    "stockUah" DECIMAL(18,4) NOT NULL,
    "strPct" DECIMAL(20,10),
    "avgSalesLastTwoWeeks" DECIMAL(18,4) NOT NULL,
    "woh" DECIMAL(20,10),
    "sourceValues" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleReportResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandReportResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "calculationRunId" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "brand" TEXT,
    "salesUah" DECIMAL(18,4) NOT NULL,
    "salesUnits" DECIMAL(18,4) NOT NULL,
    "costOfSalesUah" DECIMAL(18,4) NOT NULL,
    "gpUah" DECIMAL(18,4) NOT NULL,
    "stockUnits" DECIMAL(18,4) NOT NULL,
    "stockUah" DECIMAL(18,4) NOT NULL,
    "strPct" DECIMAL(20,10),
    "salesSharePct" DECIMAL(20,10),
    "avgSalesLastTwoWeeks" DECIMAL(18,4) NOT NULL,
    "woh" DECIMAL(20,10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandReportResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryReportResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "calculationRunId" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "category" TEXT,
    "salesUah" DECIMAL(18,4) NOT NULL,
    "salesUnits" DECIMAL(18,4) NOT NULL,
    "costOfSalesUah" DECIMAL(18,4) NOT NULL,
    "gpUah" DECIMAL(18,4) NOT NULL,
    "stockUnits" DECIMAL(18,4) NOT NULL,
    "stockUah" DECIMAL(18,4) NOT NULL,
    "strPct" DECIMAL(20,10),
    "salesSharePct" DECIMAL(20,10),
    "avgSalesLastTwoWeeks" DECIMAL(18,4) NOT NULL,
    "woh" DECIMAL(20,10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryReportResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataTablePreference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sheetKey" TEXT NOT NULL,
    "visibleColumns" JSONB NOT NULL DEFAULT '[]',
    "pageSize" INTEGER NOT NULL DEFAULT 50,
    "sortColumn" TEXT,
    "sortDirection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataTablePreference_pkey" PRIMARY KEY ("id")
);

-- Composite candidate keys used by tenant-safe foreign keys.
CREATE UNIQUE INDEX "DataSource_id_tenantId_key" ON "DataSource"("id", "tenantId");
CREATE UNIQUE INDEX "DataImportRun_id_tenantId_key" ON "DataImportRun"("id", "tenantId");
CREATE UNIQUE INDEX "DataSheetSnapshot_id_tenantId_key" ON "DataSheetSnapshot"("id", "tenantId");
CREATE UNIQUE INDEX "ReportCalculationRun_id_tenantId_key" ON "ReportCalculationRun"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_activeImportRunId_key" ON "DataSource"("activeImportRunId");
CREATE UNIQUE INDEX "DataSource_tenantId_driveFileId_key" ON "DataSource"("tenantId", "driveFileId");
CREATE INDEX "DataSource_tenantId_idx" ON "DataSource"("tenantId");

CREATE UNIQUE INDEX "DataImportRun_tenantId_idempotencyKey_key" ON "DataImportRun"("tenantId", "idempotencyKey");
CREATE INDEX "DataImportRun_tenantId_status_startedAt_idx" ON "DataImportRun"("tenantId", "status", "startedAt");
CREATE INDEX "DataImportRun_sourceId_createdAt_idx" ON "DataImportRun"("sourceId", "createdAt");
CREATE UNIQUE INDEX "DataImportRun_sourceId_running_key" ON "DataImportRun"("sourceId") WHERE "status" = 'RUNNING';

CREATE UNIQUE INDEX "DataSheetSnapshot_importRunId_sheetKey_key" ON "DataSheetSnapshot"("importRunId", "sheetKey");
CREATE INDEX "DataSheetSnapshot_tenantId_sheetKey_idx" ON "DataSheetSnapshot"("tenantId", "sheetKey");

CREATE UNIQUE INDEX "DataSheetRow_snapshotId_rowNumber_key" ON "DataSheetRow"("snapshotId", "rowNumber");
CREATE INDEX "DataSheetRow_tenantId_snapshotId_idx" ON "DataSheetRow"("tenantId", "snapshotId");
CREATE INDEX "DataSheetRow_snapshotId_rowHash_idx" ON "DataSheetRow"("snapshotId", "rowHash");

CREATE UNIQUE INDEX "SourceProduct_importRunId_productId_key" ON "SourceProduct"("importRunId", "productId");
CREATE UNIQUE INDEX "SourceProduct_importRunId_sourceRowNumber_key" ON "SourceProduct"("importRunId", "sourceRowNumber");
CREATE INDEX "SourceProduct_tenantId_productId_idx" ON "SourceProduct"("tenantId", "productId");
CREATE INDEX "SourceProduct_importRunId_article_idx" ON "SourceProduct"("importRunId", "article");
CREATE INDEX "SourceProduct_importRunId_vendorCode_idx" ON "SourceProduct"("importRunId", "vendorCode");
CREATE INDEX "SourceProduct_importRunId_brand_idx" ON "SourceProduct"("importRunId", "brand");
CREATE INDEX "SourceProduct_importRunId_category_idx" ON "SourceProduct"("importRunId", "category");

CREATE UNIQUE INDEX "SourceSaleLine_importRunId_sourceRowNumber_key" ON "SourceSaleLine"("importRunId", "sourceRowNumber");
CREATE INDEX "SourceSaleLine_tenantId_paymentDate_idx" ON "SourceSaleLine"("tenantId", "paymentDate");
CREATE INDEX "SourceSaleLine_importRunId_statusId_paymentDate_idx" ON "SourceSaleLine"("importRunId", "statusId", "paymentDate");
CREATE INDEX "SourceSaleLine_importRunId_productSku_idx" ON "SourceSaleLine"("importRunId", "productSku");
CREATE INDEX "SourceSaleLine_importRunId_productParameter_idx" ON "SourceSaleLine"("importRunId", "productParameter");
CREATE INDEX "SourceSaleLine_importRunId_resolvedProductId_idx" ON "SourceSaleLine"("importRunId", "resolvedProductId");
CREATE INDEX "SourceSaleLine_importRunId_matchStatus_idx" ON "SourceSaleLine"("importRunId", "matchStatus");

CREATE INDEX "ImportIssue_tenantId_severity_createdAt_idx" ON "ImportIssue"("tenantId", "severity", "createdAt");
CREATE INDEX "ImportIssue_importRunId_code_idx" ON "ImportIssue"("importRunId", "code");

CREATE UNIQUE INDEX "ReportCalcRun_cache_key"
ON "ReportCalculationRun"("tenantId", "importRunId", "dateFrom", "dateTo", "asOfDate", "calculationVersion");
CREATE INDEX "ReportCalculationRun_tenantId_status_createdAt_idx" ON "ReportCalculationRun"("tenantId", "status", "createdAt");
CREATE INDEX "ReportCalculationRun_importRunId_createdAt_idx" ON "ReportCalculationRun"("importRunId", "createdAt");

CREATE UNIQUE INDEX "ArticleReportResult_calculationRunId_productId_key" ON "ArticleReportResult"("calculationRunId", "productId");
CREATE INDEX "ArticleReportResult_tenantId_calculationRunId_idx" ON "ArticleReportResult"("tenantId", "calculationRunId");
CREATE INDEX "ArticleReportResult_calculationRunId_brand_idx" ON "ArticleReportResult"("calculationRunId", "brand");
CREATE INDEX "ArticleReportResult_calculationRunId_category_idx" ON "ArticleReportResult"("calculationRunId", "category");

CREATE UNIQUE INDEX "BrandReportResult_calculationRunId_groupKey_key" ON "BrandReportResult"("calculationRunId", "groupKey");
CREATE INDEX "BrandReportResult_tenantId_calculationRunId_idx" ON "BrandReportResult"("tenantId", "calculationRunId");

CREATE UNIQUE INDEX "CategoryReportResult_calculationRunId_groupKey_key" ON "CategoryReportResult"("calculationRunId", "groupKey");
CREATE INDEX "CategoryReportResult_tenantId_calculationRunId_idx" ON "CategoryReportResult"("tenantId", "calculationRunId");

CREATE UNIQUE INDEX "DataTablePreference_userId_sheetKey_key" ON "DataTablePreference"("userId", "sheetKey");
CREATE INDEX "DataTablePreference_tenantId_sheetKey_idx" ON "DataTablePreference"("tenantId", "sheetKey");

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataImportRun" ADD CONSTRAINT "DataImportRun_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataImportRun" ADD CONSTRAINT "DataImportRun_sourceId_tenantId_fkey"
FOREIGN KEY ("sourceId", "tenantId") REFERENCES "DataSource"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_activeImportRunId_fkey"
FOREIGN KEY ("activeImportRunId") REFERENCES "DataImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DataSheetSnapshot" ADD CONSTRAINT "DataSheetSnapshot_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataSheetSnapshot" ADD CONSTRAINT "DataSheetSnapshot_importRunId_tenantId_fkey"
FOREIGN KEY ("importRunId", "tenantId") REFERENCES "DataImportRun"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataSheetRow" ADD CONSTRAINT "DataSheetRow_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataSheetRow" ADD CONSTRAINT "DataSheetRow_snapshotId_tenantId_fkey"
FOREIGN KEY ("snapshotId", "tenantId") REFERENCES "DataSheetSnapshot"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SourceProduct" ADD CONSTRAINT "SourceProduct_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SourceProduct" ADD CONSTRAINT "SourceProduct_importRunId_tenantId_fkey"
FOREIGN KEY ("importRunId", "tenantId") REFERENCES "DataImportRun"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SourceSaleLine" ADD CONSTRAINT "SourceSaleLine_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SourceSaleLine" ADD CONSTRAINT "SourceSaleLine_importRunId_tenantId_fkey"
FOREIGN KEY ("importRunId", "tenantId") REFERENCES "DataImportRun"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_importRunId_tenantId_fkey"
FOREIGN KEY ("importRunId", "tenantId") REFERENCES "DataImportRun"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportCalculationRun" ADD CONSTRAINT "ReportCalculationRun_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportCalculationRun" ADD CONSTRAINT "ReportCalculationRun_importRunId_tenantId_fkey"
FOREIGN KEY ("importRunId", "tenantId") REFERENCES "DataImportRun"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArticleReportResult" ADD CONSTRAINT "ArticleReportResult_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArticleReportResult" ADD CONSTRAINT "ArticleReportResult_calculationRunId_tenantId_fkey"
FOREIGN KEY ("calculationRunId", "tenantId") REFERENCES "ReportCalculationRun"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrandReportResult" ADD CONSTRAINT "BrandReportResult_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrandReportResult" ADD CONSTRAINT "BrandReportResult_calculationRunId_tenantId_fkey"
FOREIGN KEY ("calculationRunId", "tenantId") REFERENCES "ReportCalculationRun"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CategoryReportResult" ADD CONSTRAINT "CategoryReportResult_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CategoryReportResult" ADD CONSTRAINT "CategoryReportResult_calculationRunId_tenantId_fkey"
FOREIGN KEY ("calculationRunId", "tenantId") REFERENCES "ReportCalculationRun"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataTablePreference" ADD CONSTRAINT "DataTablePreference_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataTablePreference" ADD CONSTRAINT "DataTablePreference_userId_tenantId_fkey"
FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
