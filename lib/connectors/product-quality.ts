import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { SqlClient } from "./database";
import type { OrderScope } from "./order-storage";

/** Attach per-SKU exceptions to the exact raw catalogue observation, never to guessed zeroes. */
export async function recordCatalogQuality(tx: SqlClient, scope: OrderScope, rawKey: string) {
  const {tenantId,importRunId,sourceId}=scope;
  await tx.$executeRaw(Prisma.sql`INSERT INTO "ImportIssue" (id,"tenantId","importRunId","entityKey",code,severity,message,context)
    SELECT ${randomUUID()}||':'||t."skuId"||':'||q.code,${tenantId},${importRunId},'sku:'||t."skuId",q.code,'WARNING',q.code,
      jsonb_build_object('skuId',t."skuId",'sku',t."canonicalSku",'sourceId',${sourceId}::text,'sourceRecordKey',${rawKey}::text)
    FROM mxmt_catalog_stage t JOIN "Sku" s ON s.id=t."skuId" AND s."tenantId"=${tenantId}
    CROSS JOIN LATERAL (VALUES
      ('MISSING_BRAND',t.vendor IS NULL),('BRAND_IDENTITY_CONFLICT',t.vendor IS NOT NULL AND t."brandId" IS NULL),
      ('ZERO_PRICE_WITH_STOCK',t."retailPrice"=0 AND t.quantity>0 AND s."productKind" NOT IN ('SERVICE','GIFT_CARD')),('MISSING_COST',t."costPrice" IS NULL AND s."productKind"<>'GIFT_CARD'),
      ('MISSING_RECEIPT_DATE',s."firstReceiptAt" IS NULL AND s."productKind" NOT IN ('SERVICE','GIFT_CARD')),('NEGATIVE_STOCK',t.quantity<0),
      ('PRODUCT_KIND_UNVERIFIED',s."productKind"='UNKNOWN'),('NEGATIVE_PRODUCT_AGE',s."firstReceiptAt">(s."catalogAttributes"->>'observedAt')::timestamptz)
    ) q(code,applies) WHERE q.applies
    ON CONFLICT ("importRunId",code,"entityKey") DO UPDATE SET context=EXCLUDED.context`);
}

/** Preserve row-level signed movement exceptions with raw-to-normalized identities. */
export async function recordOrderQuality(tx:SqlClient,scope:OrderScope,orderId:string) {
 await tx.$executeRaw(Prisma.sql`INSERT INTO "ImportIssue" (id,"tenantId","importRunId","entityKey",code,severity,message,context)
  SELECT ${randomUUID()}||':'||l.id||':'||q.code,${scope.tenantId},${scope.importRunId},'order:'||l."externalOrderId"||':'||l."externalLineId",q.code,'WARNING',q.code,
    jsonb_build_object('skuId',l."skuId",'sourceSku',l."sourceSku",'orderId',l."externalOrderId",'lineId',l."externalLineId",'sourceRecordKey',l."sourceRecordKey")
  FROM "OrderLine" l CROSS JOIN LATERAL (VALUES
    ('PROJECT_MAPPING_UNVERIFIED',COALESCE((l.normalization->>'projectMappingUnavailable')::boolean,false)),('EXCLUDED_CHANNEL',l.normalization->>'exclusionReason'='EXCLUDED_CHANNEL'),('EXCLUDED_PROJECT',l.normalization->>'exclusionReason'='EXCLUDED_PROJECT'),('SIGNED_CORRECTION',l.normalization->>'movement'='CORRECTION'),('RETURN_DATE_UNAVAILABLE',l.kind='RETURN' AND l."returnedAt" IS NULL),
    ('MISSING_COST',l."costAmount" IS NULL),('SKU_ALIAS_UNRESOLVED',l."skuId" IS NULL),('INFERRED_PAYMENT_DATE',l."dateInferred")
  ) q(code,applies) WHERE l."tenantId"=${scope.tenantId} AND l."sourceId"=${scope.sourceId} AND l."externalOrderId"=${orderId} AND l."eventKey"='current' AND q.applies
  ON CONFLICT ("importRunId",code,"entityKey") DO UPDATE SET context=EXCLUDED.context`);
}
