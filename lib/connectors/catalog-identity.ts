import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { SqlClient } from "./database";
import type { OrderScope } from "./order-storage";

/** Keep an established Sheets fallback identity; never merge its facts into a legacy SKU. */
export async function retainSheetsSourceIdentity(tx: SqlClient, scope: OrderScope, rawKey: string) {
  if (scope.provider !== "sheets") return 0;
  const { tenantId, sourceId, importRunId } = scope;
  const rows = await tx.$queryRaw<Array<{ externalId: string; skuId: string; legacySkuId: string; sourceSku: string }>>(Prisma.sql`
    SELECT t."externalId",anchor.id "skuId",legacy.id "legacySkuId",t.article "sourceSku"
    FROM mxmt_catalog_stage t
    JOIN "SkuAlias" a ON a."tenantId"=${tenantId} AND a."sourceId"=${sourceId}
      AND a.type='SOURCE_PRODUCT_ID' AND a.value=t."externalId"
    JOIN "Sku" anchor ON anchor."tenantId"=${tenantId} AND anchor.id=a."skuId"
      AND anchor.sku=${`@sheets:${sourceId}:`}||t."externalId"
    JOIN "Sku" legacy ON legacy."tenantId"=${tenantId} AND legacy.sku=t."canonicalSku" AND legacy.id<>anchor.id
    WHERE t.article IS NOT NULL AND legacy."catalogAttributes"->>'sourceId' IS NULL
      AND NOT EXISTS (SELECT 1 FROM "SkuAlias" x WHERE x."tenantId"=${tenantId} AND x."skuId"=legacy.id)
      AND NOT EXISTS (SELECT 1 FROM "OrderLine" x WHERE x."tenantId"=${tenantId} AND x."skuId"=legacy.id)
      AND NOT EXISTS (SELECT 1 FROM "ReceiptLine" x WHERE x."tenantId"=${tenantId} AND x."skuId"=legacy.id)
      AND NOT EXISTS (SELECT 1 FROM "PriceHistory" x WHERE x."tenantId"=${tenantId} AND x."skuId"=legacy.id)
      AND NOT EXISTS (SELECT 1 FROM "InventorySnapshot" x WHERE x."tenantId"=${tenantId} AND x."skuId"=legacy.id AND x."sourceId" IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM "SkuAlias" x WHERE x."tenantId"=${tenantId} AND x."sourceId"=${sourceId}
        AND x.type IN ('SKU','VENDOR_CODE') AND x.value=t.article AND x."skuId"<>anchor.id)`);
  if (!rows.length) return 0;
  await tx.$executeRaw(Prisma.sql`UPDATE mxmt_catalog_stage t SET "skuId"=x."skuId"
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) x("externalId" text,"skuId" text)
    WHERE t."externalId"=x."externalId"`);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "ImportIssue" (id,"tenantId","importRunId","entityKey",code,severity,message,context)
    SELECT ${randomUUID()}||':'||x."skuId",${tenantId},${importRunId},'sku:'||x."skuId",'CATALOG_LEGACY_SKU_COLLISION','WARNING',
      'An established Sheets identity is retained separately from an unbound legacy SKU; review before merging.',
      jsonb_build_object('skuId',x."skuId",'legacySkuId',x."legacySkuId",'sourceSku',x."sourceSku",'externalProductId',x."externalId",'sourceId',${sourceId}::text,'sourceRecordKey',${rawKey}::text)
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) x("externalId" text,"skuId" text,"legacySkuId" text,"sourceSku" text)
    ON CONFLICT ("importRunId",code,"entityKey") DO UPDATE SET context=EXCLUDED.context`);
  return rows.length;
}
