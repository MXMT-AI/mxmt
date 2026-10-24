-- AlterEnum
ALTER TYPE "OrderLineKind" ADD VALUE 'CORRECTION';

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "normalizationKey" TEXT;

-- AlterTable
ALTER TABLE "SourceSaleLine" ALTER COLUMN "quantity" DROP NOT NULL,
ALTER COLUMN "salesAmount" DROP NOT NULL,
ALTER COLUMN "costAmount" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ImportIssue" ADD COLUMN     "entityKey" TEXT;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "normalization" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "signedCost" DECIMAL(18,4),
ADD COLUMN     "signedQuantity" DECIMAL(18,4),
ADD COLUMN     "signedRevenue" DECIMAL(18,4);

-- CreateTable
CREATE TABLE "BrandAlias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BrandAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandAlias_tenantId_value_key" ON "BrandAlias"("tenantId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_tenantId_normalizationKey_key" ON "Brand"("tenantId", "normalizationKey");

-- CreateIndex
CREATE UNIQUE INDEX "ImportIssue_importRunId_code_entityKey_key" ON "ImportIssue"("importRunId", "code", "entityKey");

-- AddForeignKey
ALTER TABLE "BrandAlias" ADD CONSTRAINT "BrandAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandAlias" ADD CONSTRAINT "BrandAlias_brandId_tenantId_fkey" FOREIGN KEY ("brandId", "tenantId") REFERENCES "Brand"("id", "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Existing ambiguous brands retain their IDs, terms and associations for explicit review.
UPDATE "Brand" b SET "normalizationKey"=g.key FROM (
 SELECT upper(btrim(name)) key FROM "Brand" GROUP BY "tenantId",upper(btrim(name)) HAVING count(*)=1 AND upper(btrim(name))<>''
) g WHERE upper(btrim(b.name))=g.key AND (SELECT count(*) FROM "Brand" other WHERE other."tenantId"=b."tenantId" AND upper(btrim(other.name))=g.key)=1;
ALTER TABLE "BrandAlias" ADD CONSTRAINT "BrandAlias_value_check" CHECK (length(value) BETWEEN 1 AND 200 AND value=upper(btrim(value)));
