-- Expand only. Existing business rules and historical amounts are unchanged.
BEGIN;

-- Abort instead of silently reassigning or deleting inconsistent legacy data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Sku" s JOIN "Brand" b ON b.id = s."brandId"
      WHERE s."tenantId" <> b."tenantId"
    UNION ALL
    SELECT 1 FROM "SalesRecord" r JOIN "Sku" s ON s.id = r."skuId"
      WHERE r."tenantId" <> s."tenantId"
    UNION ALL
    SELECT 1 FROM "InventorySnapshot" r JOIN "Sku" s ON s.id = r."skuId"
      WHERE r."tenantId" <> s."tenantId"
    UNION ALL
    SELECT 1 FROM "CatalogUpload" c JOIN "Brand" b ON b.id = c."brandId"
      WHERE c."tenantId" <> b."tenantId"
    UNION ALL
    SELECT 1 FROM "CatalogItem" i JOIN "Brand" b ON b.id = i."brandId"
      JOIN "CatalogUpload" c ON c.id = i."catalogId"
      WHERE i."tenantId" <> b."tenantId" OR i."tenantId" <> c."tenantId" OR i."brandId" <> c."brandId"
    UNION ALL
    SELECT 1 FROM "DataSource" s JOIN "DataImportRun" r ON r.id = s."activeImportRunId"
      WHERE r."tenantId" <> s."tenantId" OR r."sourceId" <> s.id
  ) THEN
    RAISE EXCEPTION 'Merchandising preflight: inconsistent tenant/source/brand links; investigate before retrying';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "DataSourceKind" AS ENUM ('GOOGLE_SHEETS', 'SALESDRIVE', 'YML');

-- CreateEnum
CREATE TYPE "StockOwnership" AS ENUM ('UNKNOWN', 'OWN', 'CONSIGNMENT');

-- CreateEnum
CREATE TYPE "MerchandiseProductKind" AS ENUM ('UNKNOWN', 'MERCHANDISE', 'SERVICE', 'GIFT_CARD');

-- CreateEnum
CREATE TYPE "SkuAliasType" AS ENUM ('SKU', 'BARCODE', 'VENDOR_CODE', 'SOURCE_PRODUCT_ID');

-- CreateEnum
CREATE TYPE "OrderLineKind" AS ENUM ('UNKNOWN', 'SALE', 'RETURN', 'PREORDER', 'REFUSAL');

-- CreateEnum
CREATE TYPE "ReceiptMovementType" AS ENUM ('UNKNOWN', 'SUPPLIER_RECEIPT', 'TRANSFER', 'WRITE_OFF', 'INVENTORY_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "MerchandisingConfigType" AS ENUM ('GENERAL', 'THRESHOLDS', 'SOURCE_MAPPING', 'EXCLUSIONS', 'REPRICING', 'REORDERING');

-- DropForeignKey
ALTER TABLE "Sku" DROP CONSTRAINT "Sku_brandId_fkey";

-- DropForeignKey
ALTER TABLE "SalesRecord" DROP CONSTRAINT "SalesRecord_skuId_fkey";

-- DropForeignKey
ALTER TABLE "InventorySnapshot" DROP CONSTRAINT "InventorySnapshot_skuId_fkey";

-- DropForeignKey
ALTER TABLE "DataSource" DROP CONSTRAINT "DataSource_activeImportRunId_fkey";

-- DropForeignKey
ALTER TABLE "CatalogUpload" DROP CONSTRAINT "CatalogUpload_brandId_fkey";

-- DropForeignKey
ALTER TABLE "CatalogItem" DROP CONSTRAINT "CatalogItem_catalogId_fkey";

-- DropForeignKey
ALTER TABLE "CatalogItem" DROP CONSTRAINT "CatalogItem_brandId_fkey";

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "commissionRate" DECIMAL(9,8),
ADD COLUMN     "ownership" "StockOwnership" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "Sku" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "commissionRateOverride" DECIMAL(9,8),
ADD COLUMN     "firstReceiptAt" TIMESTAMPTZ(3),
ADD COLUMN     "ownershipOverride" "StockOwnership",
ADD COLUMN     "productKind" "MerchandiseProductKind" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "InventorySnapshot" ADD COLUMN     "costPrice" DECIMAL(18,4),
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "importRunId" TEXT,
ADD COLUMN     "inTransitVerifiedAt" TIMESTAMPTZ(3),
ADD COLUMN     "observedAt" TIMESTAMPTZ(3),
ADD COLUMN     "retailPrice" DECIMAL(18,4),
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceRecordKey" TEXT,
ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "DataSource" ADD COLUMN     "kind" "DataSourceKind" NOT NULL DEFAULT 'GOOGLE_SHEETS',
ADD COLUMN     "sourceKey" TEXT,
ALTER COLUMN "driveFileId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seasonMonths" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]::INTEGER[],
    "seasonVerifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadTimeDays" INTEGER,
    "coverDays" INTEGER,
    "moq" INTEGER,
    "termsVerifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuAlias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "type" "SkuAliasType" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkuAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSourceRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "sourceUpdatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataSourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "externalLineId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL DEFAULT 'current',
    "skuId" TEXT,
    "externalProductId" TEXT,
    "statusId" INTEGER,
    "channelId" TEXT,
    "kind" "OrderLineKind" NOT NULL DEFAULT 'UNKNOWN',
    "orderedAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "returnedAt" TIMESTAMPTZ(3),
    "dateInferred" BOOLEAN NOT NULL DEFAULT false,
    "quantity" DECIMAL(18,4) NOT NULL,
    "netAmount" DECIMAL(18,4),
    "costAmount" DECIMAL(18,4),
    "currency" TEXT,
    "sourceRecordKey" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMPTZ(3),
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "movementType" "ReceiptMovementType" NOT NULL DEFAULT 'UNKNOWN',
    "sourceStatus" TEXT,
    "postingVerifiedAt" TIMESTAMPTZ(3),
    "supplierId" TEXT,
    "receivedAt" TIMESTAMPTZ(3),
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "sourceUpdatedAt" TIMESTAMPTZ(3),
    "sourceRecordKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "externalLineId" TEXT NOT NULL,
    "skuId" TEXT,
    "externalProductId" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4),
    "currency" TEXT,

    CONSTRAINT "ReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "sourceRecordKey" TEXT NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3),
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "retailPrice" DECIMAL(18,4),
    "costPrice" DECIMAL(18,4),
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchandisingConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "configType" "MerchandisingConfigType" NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'default',
    "revision" INTEGER NOT NULL,
    "values" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "approvalReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchandisingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuDaily" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "configId" TEXT NOT NULL,
    "calculationVersion" INTEGER NOT NULL,
    "inputProvenance" JSONB NOT NULL,
    "salesQuantity" DECIMAL(18,4),
    "netRevenue" DECIMAL(18,4),
    "grossProfit" DECIMAL(18,4),
    "currency" TEXT,
    "velocityPerWeek" DECIMAL(20,10),
    "weeksOnHand" DECIMAL(20,10),
    "classification" TEXT,
    "diagnostics" JSONB NOT NULL DEFAULT '[]',
    "calculatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkuDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchandisingAction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "configId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchandisingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "checkpoint" JSONB NOT NULL,
    "lastSuccessfulRunId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_tenantId_key" ON "Category"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_tenantId_key_key" ON "Category"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_id_tenantId_key" ON "Supplier"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenantId_key_key" ON "Supplier"("tenantId", "key");

-- CreateIndex
CREATE INDEX "SkuAlias_tenantId_skuId_idx" ON "SkuAlias"("tenantId", "skuId");

-- CreateIndex
CREATE UNIQUE INDEX "SkuAlias_tenantId_sourceId_type_value_key" ON "SkuAlias"("tenantId", "sourceId", "type", "value");

-- CreateIndex
CREATE INDEX "DataSourceRecord_tenantId_sourceId_resource_externalId_idx" ON "DataSourceRecord"("tenantId", "sourceId", "resource", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "DataSourceRecord_importRunId_resource_externalId_key" ON "DataSourceRecord"("importRunId", "resource", "externalId");

-- CreateIndex
CREATE INDEX "OrderLine_tenantId_paidAt_statusId_idx" ON "OrderLine"("tenantId", "paidAt", "statusId");

-- CreateIndex
CREATE INDEX "OrderLine_tenantId_returnedAt_idx" ON "OrderLine"("tenantId", "returnedAt");

-- CreateIndex
CREATE INDEX "OrderLine_tenantId_skuId_paidAt_idx" ON "OrderLine"("tenantId", "skuId", "paidAt");

-- CreateIndex
CREATE INDEX "OrderLine_tenantId_channelId_paidAt_idx" ON "OrderLine"("tenantId", "channelId", "paidAt");

-- CreateIndex
CREATE INDEX "OrderLine_importRunId_sourceId_tenantId_idx" ON "OrderLine"("importRunId", "sourceId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_source_identity_key" ON "OrderLine"("tenantId", "sourceId", "externalOrderId", "externalLineId", "eventKey");

-- CreateIndex
CREATE INDEX "Receipt_tenantId_movementType_receivedAt_idx" ON "Receipt"("tenantId", "movementType", "receivedAt");

-- CreateIndex
CREATE INDEX "Receipt_importRunId_sourceId_tenantId_idx" ON "Receipt"("importRunId", "sourceId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_id_tenantId_key" ON "Receipt"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_tenantId_sourceId_externalId_key" ON "Receipt"("tenantId", "sourceId", "externalId");

-- CreateIndex
CREATE INDEX "ReceiptLine_tenantId_skuId_idx" ON "ReceiptLine"("tenantId", "skuId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptLine_receiptId_externalLineId_key" ON "ReceiptLine"("receiptId", "externalLineId");

-- CreateIndex
CREATE INDEX "PriceHistory_tenantId_skuId_observedAt_idx" ON "PriceHistory"("tenantId", "skuId", "observedAt");

-- CreateIndex
CREATE INDEX "PriceHistory_importRunId_sourceId_tenantId_idx" ON "PriceHistory"("importRunId", "sourceId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceHistory_source_identity_key" ON "PriceHistory"("tenantId", "sourceId", "skuId", "sourceRecordKey");

-- CreateIndex
CREATE UNIQUE INDEX "MerchandisingConfig_id_tenantId_key" ON "MerchandisingConfig"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchandisingConfig_revision_key" ON "MerchandisingConfig"("tenantId", "configType", "key", "revision");

-- CreateIndex
CREATE INDEX "SkuDaily_tenantId_businessDate_classification_idx" ON "SkuDaily"("tenantId", "businessDate", "classification");

-- CreateIndex
CREATE UNIQUE INDEX "SkuDaily_version_key" ON "SkuDaily"("tenantId", "skuId", "businessDate", "configId", "calculationVersion");

-- CreateIndex
CREATE INDEX "MerchandisingAction_tenantId_createdAt_idx" ON "MerchandisingAction"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "MerchandisingAction_tenantId_entityType_entityId_idx" ON "MerchandisingAction"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchandisingAction_tenantId_idempotencyKey_key" ON "MerchandisingAction"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SyncCursor_tenantId_sourceId_resource_key" ON "SyncCursor"("tenantId", "sourceId", "resource");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_id_tenantId_key" ON "Brand"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Sku_tenantId_categoryId_idx" ON "Sku"("tenantId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Sku_id_tenantId_key" ON "Sku"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_active_run_scope_key" ON "DataSource"("activeImportRunId", "id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_tenantId_kind_sourceKey_key" ON "DataSource"("tenantId", "kind", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "DataImportRun_id_sourceId_tenantId_key" ON "DataImportRun"("id", "sourceId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogUpload_id_brandId_tenantId_key" ON "CatalogUpload"("id", "brandId", "tenantId");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_supplierId_tenantId_fkey" FOREIGN KEY ("supplierId", "tenantId") REFERENCES "Supplier"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_brandId_tenantId_fkey" FOREIGN KEY ("brandId", "tenantId") REFERENCES "Brand"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_categoryId_tenantId_fkey" FOREIGN KEY ("categoryId", "tenantId") REFERENCES "Category"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_supplierId_tenantId_fkey" FOREIGN KEY ("supplierId", "tenantId") REFERENCES "Supplier"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_skuId_tenantId_fkey" FOREIGN KEY ("skuId", "tenantId") REFERENCES "Sku"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_skuId_tenantId_fkey" FOREIGN KEY ("skuId", "tenantId") REFERENCES "Sku"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "DataSource"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_importRunId_sourceId_tenantId_fkey" FOREIGN KEY ("importRunId", "sourceId", "tenantId") REFERENCES "DataImportRun"("id", "sourceId", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_activeImportRunId_id_tenantId_fkey" FOREIGN KEY ("activeImportRunId", "id", "tenantId") REFERENCES "DataImportRun"("id", "sourceId", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CatalogUpload" ADD CONSTRAINT "CatalogUpload_brandId_tenantId_fkey" FOREIGN KEY ("brandId", "tenantId") REFERENCES "Brand"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_catalogId_brandId_tenantId_fkey" FOREIGN KEY ("catalogId", "brandId", "tenantId") REFERENCES "CatalogUpload"("id", "brandId", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_brandId_tenantId_fkey" FOREIGN KEY ("brandId", "tenantId") REFERENCES "Brand"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuAlias" ADD CONSTRAINT "SkuAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuAlias" ADD CONSTRAINT "SkuAlias_skuId_tenantId_fkey" FOREIGN KEY ("skuId", "tenantId") REFERENCES "Sku"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuAlias" ADD CONSTRAINT "SkuAlias_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "DataSource"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DataSourceRecord" ADD CONSTRAINT "DataSourceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSourceRecord" ADD CONSTRAINT "DataSourceRecord_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "DataSource"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSourceRecord" ADD CONSTRAINT "DataSourceRecord_importRunId_sourceId_tenantId_fkey" FOREIGN KEY ("importRunId", "sourceId", "tenantId") REFERENCES "DataImportRun"("id", "sourceId", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "DataSource"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_importRunId_sourceId_tenantId_fkey" FOREIGN KEY ("importRunId", "sourceId", "tenantId") REFERENCES "DataImportRun"("id", "sourceId", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_skuId_tenantId_fkey" FOREIGN KEY ("skuId", "tenantId") REFERENCES "Sku"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "DataSource"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_importRunId_sourceId_tenantId_fkey" FOREIGN KEY ("importRunId", "sourceId", "tenantId") REFERENCES "DataImportRun"("id", "sourceId", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_supplierId_tenantId_fkey" FOREIGN KEY ("supplierId", "tenantId") REFERENCES "Supplier"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_receiptId_tenantId_fkey" FOREIGN KEY ("receiptId", "tenantId") REFERENCES "Receipt"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_skuId_tenantId_fkey" FOREIGN KEY ("skuId", "tenantId") REFERENCES "Sku"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_skuId_tenantId_fkey" FOREIGN KEY ("skuId", "tenantId") REFERENCES "Sku"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "DataSource"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_importRunId_sourceId_tenantId_fkey" FOREIGN KEY ("importRunId", "sourceId", "tenantId") REFERENCES "DataImportRun"("id", "sourceId", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MerchandisingConfig" ADD CONSTRAINT "MerchandisingConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandisingConfig" ADD CONSTRAINT "MerchandisingConfig_approvedById_tenantId_fkey" FOREIGN KEY ("approvedById", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SkuDaily" ADD CONSTRAINT "SkuDaily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuDaily" ADD CONSTRAINT "SkuDaily_skuId_tenantId_fkey" FOREIGN KEY ("skuId", "tenantId") REFERENCES "Sku"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SkuDaily" ADD CONSTRAINT "SkuDaily_configId_tenantId_fkey" FOREIGN KEY ("configId", "tenantId") REFERENCES "MerchandisingConfig"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MerchandisingAction" ADD CONSTRAINT "MerchandisingAction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandisingAction" ADD CONSTRAINT "MerchandisingAction_actorId_tenantId_fkey" FOREIGN KEY ("actorId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MerchandisingAction" ADD CONSTRAINT "MerchandisingAction_configId_tenantId_fkey" FOREIGN KEY ("configId", "tenantId") REFERENCES "MerchandisingConfig"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SyncCursor" ADD CONSTRAINT "SyncCursor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncCursor" ADD CONSTRAINT "SyncCursor_sourceId_tenantId_fkey" FOREIGN KEY ("sourceId", "tenantId") REFERENCES "DataSource"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncCursor" ADD CONSTRAINT "SyncCursor_lastSuccessfulRunId_sourceId_tenantId_fkey" FOREIGN KEY ("lastSuccessfulRunId", "sourceId", "tenantId") REFERENCES "DataImportRun"("id", "sourceId", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Prisma 5 cannot express CHECK constraints or partial unique indexes.
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_commission_rate_check"
  CHECK ("commissionRate" BETWEEN 0 AND 1);
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_commission_rate_check"
  CHECK ("commissionRateOverride" BETWEEN 0 AND 1);
ALTER TABLE "Category" ADD CONSTRAINT "Category_season_months_check"
  CHECK ("seasonMonths" IS NOT NULL AND cardinality("seasonMonths") > 0
    AND "seasonMonths" <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::INTEGER[]
    AND array_position("seasonMonths", NULL) IS NULL);
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_terms_check"
  CHECK (("leadTimeDays" IS NULL OR "leadTimeDays" >= 0)
    AND ("coverDays" IS NULL OR "coverDays" >= 0)
    AND (moq IS NULL OR moq > 0));
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_identity_check"
  CHECK ((kind = 'GOOGLE_SHEETS' AND "driveFileId" IS NOT NULL AND length(btrim("driveFileId")) > 0 AND "sourceKey" IS NULL)
    OR (kind <> 'GOOGLE_SHEETS' AND "driveFileId" IS NULL AND "sourceKey" IS NOT NULL AND length(btrim("sourceKey")) > 0));
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_provenance_check"
  CHECK (("importRunId" IS NULL OR "sourceId" IS NOT NULL)
    AND ("sourceId" IS NULL OR ("importRunId" IS NOT NULL AND "observedAt" IS NOT NULL AND "timezone" IS NOT NULL AND "sourceRecordKey" IS NOT NULL)));
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_prices_check"
  CHECK (("costPrice" IS NULL OR "costPrice" >= 0) AND ("retailPrice" IS NULL OR "retailPrice" >= 0));
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_unit_cost_check" CHECK ("unitCost" >= 0);
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_prices_check"
  CHECK (("costPrice" IS NULL OR "costPrice" >= 0) AND ("retailPrice" IS NULL OR "retailPrice" >= 0)
    AND ("costPrice" IS NOT NULL OR "retailPrice" IS NOT NULL));
ALTER TABLE "MerchandisingConfig" ADD CONSTRAINT "MerchandisingConfig_approval_check"
  CHECK (revision > 0
    AND (("approvedAt" IS NULL AND "approvedById" IS NULL AND "approvalReference" IS NULL)
      OR ("approvedAt" IS NOT NULL AND "approvedById" IS NOT NULL AND "approvalReference" IS NOT NULL))
    AND (NOT "isActive" OR "approvedAt" IS NOT NULL));
CREATE UNIQUE INDEX "MerchandisingConfig_active_key"
  ON "MerchandisingConfig" ("tenantId", "configType", key) WHERE "isActive";
ALTER TABLE "SkuDaily" ADD CONSTRAINT "SkuDaily_version_check" CHECK ("calculationVersion" > 0);

-- A failed/pending sync must not advance a resource checkpoint.
CREATE FUNCTION "check_sync_cursor_run"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "DataImportRun" r
    WHERE r.id = NEW."lastSuccessfulRunId" AND r."sourceId" = NEW."sourceId"
      AND r."tenantId" = NEW."tenantId" AND r.status IN ('SUCCESS', 'WARNING')
  ) THEN
    RAISE EXCEPTION 'Sync cursor requires a successful run of the same tenant and source' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "SyncCursor_successful_run" BEFORE INSERT OR UPDATE ON "SyncCursor"
  FOR EACH ROW EXECUTE FUNCTION "check_sync_cursor_run"();

COMMIT;
