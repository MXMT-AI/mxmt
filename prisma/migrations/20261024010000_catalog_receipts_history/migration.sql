-- AlterTable
ALTER TABLE "Sku" ADD COLUMN     "catalogAttributes" JSONB NOT NULL DEFAULT '{}',
ALTER COLUMN "priceRetail" DROP NOT NULL,
ALTER COLUMN "pricePurchase" DROP NOT NULL;

-- AlterTable
ALTER TABLE "InventorySnapshot" ADD COLUMN     "costProvenance" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "costValue" DECIMAL(18,4),
ADD COLUMN     "diagnostics" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "quantity" DECIMAL(18,4),
ADD COLUMN     "retailValue" DECIMAL(18,4),
ALTER COLUMN "qtyOnHand" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "datePrecision" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "sourceCounterpartyId" TEXT,
ADD COLUMN     "sourceCounterpartyName" TEXT;

-- AlterTable
ALTER TABLE "ReceiptLine" ADD COLUMN     "costVerifiedAt" TIMESTAMPTZ(3),
ADD COLUMN     "identityDerived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sourceSku" TEXT;

-- AlterTable
ALTER TABLE "PriceHistory" ADD COLUMN     "costProvenance" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "oldPrice" DECIMAL(18,4);

-- AlterTable
ALTER TABLE "ConnectorSyncJob" ADD COLUMN     "resource" TEXT NOT NULL DEFAULT 'orders';


ALTER TABLE "ConnectorSyncJob" DROP CONSTRAINT "ConnectorSyncJob_mode_check";
ALTER TABLE "ConnectorSyncJob" ADD CONSTRAINT "ConnectorSyncJob_mode_check" CHECK (mode IN ('BACKFILL','INCREMENTAL','WEBHOOK','REFRESH'));
ALTER TABLE "ConnectorSyncJob" ADD CONSTRAINT "ConnectorSyncJob_resource_check" CHECK (resource IN ('orders','inventory'));
ALTER TABLE "InventorySnapshot" ADD CONSTRAINT "InventorySnapshot_observed_values_check" CHECK (
  ("costValue" IS NULL OR "costValue" >= 0) AND ("retailValue" IS NULL OR "retailValue" >= 0));
-- Unknown price transitions must remain visible after a previously known observation.
ALTER TABLE "PriceHistory" DROP CONSTRAINT "PriceHistory_prices_check";
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_prices_check" CHECK (
  ("costPrice" IS NULL OR "costPrice" >= 0) AND ("retailPrice" IS NULL OR "retailPrice" >= 0) AND ("oldPrice" IS NULL OR "oldPrice" >= 0));

