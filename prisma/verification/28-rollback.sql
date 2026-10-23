-- Emergency schema rollback only BEFORE any new merchandising data is written.
-- Prefer application rollback with the expanded schema retained. Never CASCADE.
BEGIN;
-- Prevent new writes between the no-data guard and destructive DDL.
LOCK TABLE "Brand", "Sku", "InventorySnapshot", "DataSource", "Category", "Supplier",
  "SkuAlias", "DataSourceRecord", "OrderLine", "Receipt", "ReceiptLine", "PriceHistory",
  "MerchandisingConfig", "SkuDaily", "MerchandisingAction", "SyncCursor" IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE
  relation_name TEXT;
  has_rows BOOLEAN;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['Category','Supplier','SkuAlias','DataSourceRecord','OrderLine','Receipt','ReceiptLine','PriceHistory','MerchandisingConfig','SkuDaily','MerchandisingAction','SyncCursor'] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', relation_name) INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'Rollback refused: % has merchandising data; retain expanded schema or use a reviewed forward fix', relation_name;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM "Brand" WHERE ownership <> 'UNKNOWN' OR "commissionRate" IS NOT NULL OR "supplierId" IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "Sku" WHERE "barcode" IS NOT NULL OR "categoryId" IS NOT NULL OR "commissionRateOverride" IS NOT NULL
      OR "firstReceiptAt" IS NOT NULL OR "ownershipOverride" IS NOT NULL OR "productKind" <> 'UNKNOWN' OR "supplierId" IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "InventorySnapshot" WHERE "costPrice" IS NOT NULL OR currency IS NOT NULL OR "importRunId" IS NOT NULL
      OR "inTransitVerifiedAt" IS NOT NULL OR "observedAt" IS NOT NULL OR "retailPrice" IS NOT NULL OR "sourceId" IS NOT NULL
      OR "sourceRecordKey" IS NOT NULL OR timezone IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "DataSource" WHERE kind <> 'GOOGLE_SHEETS' OR "sourceKey" IS NOT NULL OR "driveFileId" IS NULL)
  THEN
    RAISE EXCEPTION 'Rollback refused: new merchandising fields are populated';
  END IF;
END $$;
ALTER TABLE "Brand" DROP CONSTRAINT "Brand_commission_rate_check";
ALTER TABLE "Sku" DROP CONSTRAINT "Sku_commission_rate_check";
ALTER TABLE "InventorySnapshot" DROP CONSTRAINT "InventorySnapshot_provenance_check";
ALTER TABLE "InventorySnapshot" DROP CONSTRAINT "InventorySnapshot_prices_check";
ALTER TABLE "DataSource" DROP CONSTRAINT "DataSource_identity_check";
DROP TRIGGER "SyncCursor_successful_run" ON "SyncCursor";
DROP FUNCTION "check_sync_cursor_run"();

-- DropForeignKey
ALTER TABLE "Brand" DROP CONSTRAINT "Brand_supplierId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Sku" DROP CONSTRAINT "Sku_brandId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Sku" DROP CONSTRAINT "Sku_categoryId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Sku" DROP CONSTRAINT "Sku_supplierId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SalesRecord" DROP CONSTRAINT "SalesRecord_skuId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "InventorySnapshot" DROP CONSTRAINT "InventorySnapshot_skuId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "InventorySnapshot" DROP CONSTRAINT "InventorySnapshot_sourceId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "InventorySnapshot" DROP CONSTRAINT "InventorySnapshot_importRunId_sourceId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "DataSource" DROP CONSTRAINT "DataSource_activeImportRunId_id_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "CatalogUpload" DROP CONSTRAINT "CatalogUpload_brandId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "CatalogItem" DROP CONSTRAINT "CatalogItem_catalogId_brandId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "CatalogItem" DROP CONSTRAINT "CatalogItem_brandId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Supplier" DROP CONSTRAINT "Supplier_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SkuAlias" DROP CONSTRAINT "SkuAlias_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SkuAlias" DROP CONSTRAINT "SkuAlias_skuId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SkuAlias" DROP CONSTRAINT "SkuAlias_sourceId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "DataSourceRecord" DROP CONSTRAINT "DataSourceRecord_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "DataSourceRecord" DROP CONSTRAINT "DataSourceRecord_sourceId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "DataSourceRecord" DROP CONSTRAINT "DataSourceRecord_importRunId_sourceId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "OrderLine" DROP CONSTRAINT "OrderLine_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "OrderLine" DROP CONSTRAINT "OrderLine_sourceId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "OrderLine" DROP CONSTRAINT "OrderLine_importRunId_sourceId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "OrderLine" DROP CONSTRAINT "OrderLine_skuId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Receipt" DROP CONSTRAINT "Receipt_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Receipt" DROP CONSTRAINT "Receipt_sourceId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Receipt" DROP CONSTRAINT "Receipt_importRunId_sourceId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Receipt" DROP CONSTRAINT "Receipt_supplierId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ReceiptLine" DROP CONSTRAINT "ReceiptLine_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ReceiptLine" DROP CONSTRAINT "ReceiptLine_receiptId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ReceiptLine" DROP CONSTRAINT "ReceiptLine_skuId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PriceHistory" DROP CONSTRAINT "PriceHistory_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PriceHistory" DROP CONSTRAINT "PriceHistory_skuId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PriceHistory" DROP CONSTRAINT "PriceHistory_sourceId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PriceHistory" DROP CONSTRAINT "PriceHistory_importRunId_sourceId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "MerchandisingConfig" DROP CONSTRAINT "MerchandisingConfig_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "MerchandisingConfig" DROP CONSTRAINT "MerchandisingConfig_approvedById_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SkuDaily" DROP CONSTRAINT "SkuDaily_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SkuDaily" DROP CONSTRAINT "SkuDaily_skuId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SkuDaily" DROP CONSTRAINT "SkuDaily_configId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "MerchandisingAction" DROP CONSTRAINT "MerchandisingAction_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "MerchandisingAction" DROP CONSTRAINT "MerchandisingAction_actorId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "MerchandisingAction" DROP CONSTRAINT "MerchandisingAction_configId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SyncCursor" DROP CONSTRAINT "SyncCursor_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SyncCursor" DROP CONSTRAINT "SyncCursor_sourceId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SyncCursor" DROP CONSTRAINT "SyncCursor_lastSuccessfulRunId_sourceId_tenantId_fkey";

-- DropIndex
DROP INDEX "Brand_id_tenantId_key";

-- DropIndex
DROP INDEX "Sku_tenantId_categoryId_idx";

-- DropIndex
DROP INDEX "Sku_id_tenantId_key";

-- DropIndex
DROP INDEX "DataSource_active_run_scope_key";

-- DropIndex
DROP INDEX "DataSource_tenantId_kind_sourceKey_key";

-- DropIndex
DROP INDEX "DataImportRun_id_sourceId_tenantId_key";

-- DropIndex
DROP INDEX "CatalogUpload_id_brandId_tenantId_key";

-- AlterTable
ALTER TABLE "Brand" DROP COLUMN "commissionRate",
DROP COLUMN "ownership",
DROP COLUMN "supplierId";

-- AlterTable
ALTER TABLE "Sku" DROP COLUMN "barcode",
DROP COLUMN "categoryId",
DROP COLUMN "commissionRateOverride",
DROP COLUMN "firstReceiptAt",
DROP COLUMN "ownershipOverride",
DROP COLUMN "productKind",
DROP COLUMN "supplierId";

-- AlterTable
ALTER TABLE "InventorySnapshot" DROP COLUMN "costPrice",
DROP COLUMN "currency",
DROP COLUMN "importRunId",
DROP COLUMN "inTransitVerifiedAt",
DROP COLUMN "observedAt",
DROP COLUMN "retailPrice",
DROP COLUMN "sourceId",
DROP COLUMN "sourceRecordKey",
DROP COLUMN "timezone";

-- AlterTable
ALTER TABLE "DataSource" DROP COLUMN "kind",
DROP COLUMN "sourceKey",
ALTER COLUMN "driveFileId" SET NOT NULL;

-- DropTable
DROP TABLE "Category";

-- DropTable
DROP TABLE "Supplier";

-- DropTable
DROP TABLE "SkuAlias";

-- DropTable
DROP TABLE "DataSourceRecord";

-- DropTable
DROP TABLE "OrderLine";

-- DropTable
DROP TABLE "Receipt";

-- DropTable
DROP TABLE "ReceiptLine";

-- DropTable
DROP TABLE "PriceHistory";

-- DropTable
DROP TABLE "MerchandisingConfig";

-- DropTable
DROP TABLE "SkuDaily";

-- DropTable
DROP TABLE "MerchandisingAction";

-- DropTable
DROP TABLE "SyncCursor";

-- DropEnum
DROP TYPE "DataSourceKind";

-- DropEnum
DROP TYPE "StockOwnership";

-- DropEnum
DROP TYPE "MerchandiseProductKind";

-- DropEnum
DROP TYPE "SkuAliasType";

-- DropEnum
DROP TYPE "OrderLineKind";

-- DropEnum
DROP TYPE "ReceiptMovementType";

-- DropEnum
DROP TYPE "MerchandisingConfigType";

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_activeImportRunId_fkey" FOREIGN KEY ("activeImportRunId") REFERENCES "DataImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogUpload" ADD CONSTRAINT "CatalogUpload_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "CatalogUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
