import "server-only";
import { readClientSettings } from "./merchandising-settings-store";
import { defaultClientSettings } from "./merchandising-settings";
import { clientOrderFilterFingerprint } from "./merchandising-order-policy";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SqlClient } from "@/lib/connectors/database";
import { productAgeReference,productEligibility } from "@/lib/data-normalization";

/** Current-connection observations and explicit per-product exceptions, retaining input lineage. */
function qualityBase(tenantId:string) {
 const sourceBrand=Prisma.sql`CASE WHEN s."catalogAttributes" ? 'normalization' THEN s."catalogAttributes"->'normalization'->>'brandKey' ELSE NULLIF(btrim(s."catalogAttributes"->>'vendor'),'') END`;
 return Prisma.sql`WITH latest AS (
 SELECT DISTINCT ON (i."skuId") i.* FROM "InventorySnapshot" i JOIN "ConnectorConnection" c ON c."sourceId"=i."sourceId" AND c."tenantId"=i."tenantId" WHERE i."tenantId"=${tenantId} ORDER BY i."skuId",i."observedAt" DESC
), base AS (
 SELECT s.id,s.sku,s.name,s."productKind",s."brandId",s."firstReceiptAt",i.quantity,i."retailPrice",i."costPrice",i."costValue",i."retailValue",i.currency,i."observedAt",i."importRunId",i."sourceRecordKey",i."sourceId",
   COALESCE(b."normalizationKey",NULLIF(upper(btrim(b.name)),''),'UNBRANDED') "brandKey",
   (SELECT MIN(l."paidAt") FROM "OrderLine" l WHERE l."tenantId"=s."tenantId" AND l."skuId"=s.id AND l.kind='SALE' AND l.quantity>0 AND l."netAmount" IS NOT NULL) "firstSaleAt",
   array_remove(ARRAY[
    CASE WHEN (${sourceBrand}) IS NULL THEN 'MISSING_BRAND' END,
    CASE WHEN (${sourceBrand}) IS NOT NULL AND s."brandId" IS NULL THEN 'BRAND_IDENTITY_CONFLICT' END,
    CASE WHEN s."productKind" NOT IN ('SERVICE','GIFT_CARD') AND i.quantity>0 AND i."retailPrice"=0 THEN 'ZERO_PRICE_WITH_STOCK' END,
    CASE WHEN i."costPrice" IS NULL AND s."productKind"<>'GIFT_CARD' THEN 'MISSING_COST' END,
    CASE WHEN s."firstReceiptAt" IS NULL AND s."productKind" NOT IN ('SERVICE','GIFT_CARD') THEN 'MISSING_RECEIPT_DATE' END,
    CASE WHEN i.quantity<0 THEN 'NEGATIVE_STOCK' END,
    CASE WHEN s."firstReceiptAt">i."observedAt" THEN 'NEGATIVE_PRODUCT_AGE' END,
    CASE WHEN s."productKind"='UNKNOWN' THEN 'PRODUCT_KIND_UNVERIFIED' END,
    CASE WHEN EXISTS (SELECT 1 FROM (SELECT d."velocityPerWeek",d."weeksOnHand" FROM "SkuDaily" d WHERE d."tenantId"=s."tenantId" AND d."skuId"=s.id ORDER BY d."businessDate" DESC,d."calculatedAt" DESC LIMIT 1) d WHERE d."velocityPerWeek"<0 OR d."weeksOnHand"<0) THEN 'NEGATIVE_METRIC' END,
    CASE WHEN i.quantity IS NULL THEN 'STOCK_QUANTITY_UNAVAILABLE' END
   ],NULL) issues
 FROM "Sku" s JOIN latest i ON i."skuId"=s.id AND i."tenantId"=s."tenantId" LEFT JOIN "Brand" b ON b.id=s."brandId" AND b."tenantId"=s."tenantId" WHERE s."tenantId"=${tenantId}
)`;}

/** Return bounded diagnostics and currency-separated components, not a replacement financial report. */
export async function getProductQuality(tenantId:string,options:{page?:number;q?:string}={},db:SqlClient=prisma) {
 const currentClient=await readClientSettings(tenantId,db);
 const currentFilter=clientOrderFilterFingerprint(currentClient.values),defaultFilter=clientOrderFilterFingerprint(defaultClientSettings());
 const page=options.page??1,search=options.q?.trim()??'';
 const base=qualityBase(tenantId),filter=Prisma.sql`(${search}='' OR sku ILIKE ${`%${search}%`} OR name ILIKE ${`%${search}%`})`;
 const [rows,total,summary,brands,aliases,components,stock,replay,orderExceptions]=await Promise.all([
  db.$queryRaw<Array<{id:string;sku:string;name:string;productKind:string;firstReceiptAt:Date|null;firstSaleAt:Date|null;observedAt:Date;issues:string[]} & Record<string,unknown>>>(Prisma.sql`${base} SELECT * FROM base WHERE ${filter} ORDER BY cardinality(issues) DESC,sku LIMIT 25 OFFSET ${(page-1)*25}`),
  db.$queryRaw<Array<{n:number}>>(Prisma.sql`${base} SELECT count(*)::int n FROM base WHERE ${filter}`),
  db.$queryRaw<Array<{code:string;currency:string|null;skuCount:number;costValue:string|null;unknownValueCount:number}>>(Prisma.sql`${base} SELECT q.code,b.currency,count(*)::int "skuCount",sum(b."costValue")::text "costValue",count(*) FILTER (WHERE b."costValue" IS NULL)::int "unknownValueCount" FROM base b CROSS JOIN LATERAL unnest(b.issues) q(code) GROUP BY q.code,b.currency ORDER BY q.code,b.currency`),
  db.$queryRaw<Array<{id:string;name:string}>>(Prisma.sql`SELECT id,name FROM "Brand" WHERE "tenantId"=${tenantId} ORDER BY name LIMIT 500`),
  db.$queryRaw<Array<{value:string;brandId:string;name:string;revision:number}>>(Prisma.sql`SELECT a.value,a."brandId",b.name,a.revision FROM "BrandAlias" a JOIN "Brand" b ON b.id=a."brandId" AND b."tenantId"=a."tenantId" WHERE a."tenantId"=${tenantId} ORDER BY a.value LIMIT 100`),
  db.$queryRaw<Array<{component:string;currency:string|null;lineCount:number;revenue:string|null;cost:string|null;missingAmountCount:number}>>(Prisma.sql`SELECT
   CASE WHEN s."productKind"='GIFT_CARD' THEN 'GIFT_CARD' WHEN s."productKind"='SERVICE' THEN 'SERVICE' WHEN l.normalization->>'movement'='CORRECTION' OR l.kind='RETURN' THEN 'RETURNS_CORRECTIONS' WHEN s."productKind"='MERCHANDISE' THEN 'MERCHANDISE' ELSE 'UNKNOWN' END component,
   l.currency,count(*)::int "lineCount",sum(l."signedRevenue")::text revenue,sum(l."signedCost")::text cost,count(*) FILTER(WHERE l."signedRevenue" IS NULL)::int "missingAmountCount"
   FROM "OrderLine" l JOIN "ConnectorConnection" c ON c."sourceId"=l."sourceId" AND c."tenantId"=l."tenantId" LEFT JOIN "Sku" s ON s.id=l."skuId" AND s."tenantId"=l."tenantId"
   WHERE l."tenantId"=${tenantId} AND l."eventKey"='current' AND COALESCE((l.normalization->>'excluded')::boolean,false)=false AND l.kind IN ('SALE','RETURN','CORRECTION') GROUP BY component,l.currency ORDER BY component,l.currency`),
  db.$queryRaw<Array<{brandKey:string;currency:string|null;quantity:string|null;costValue:string|null}>>(Prisma.sql`${base} SELECT "brandKey",currency,sum(quantity)::text quantity,sum("costValue")::text "costValue" FROM base WHERE "productKind"='MERCHANDISE' GROUP BY "brandKey",currency ORDER BY "brandKey",currency`),
  db.$queryRaw<Array<{n:number}>>(Prisma.sql`SELECT count(*)::int n FROM "OrderLine" l JOIN "ConnectorConnection" c ON c."sourceId"=l."sourceId" AND c."tenantId"=l."tenantId" WHERE l."tenantId"=${tenantId} AND (l.normalization='{}'::jsonb OR COALESCE(l.normalization->>'filterFingerprint',${defaultFilter})<>${currentFilter})`),
  db.$queryRaw<Array<{code:string;sourceSku:string|null;orderId:string;lineId:string}>>(Prisma.sql`SELECT q.code,l."sourceSku",l."externalOrderId" "orderId",l."externalLineId" "lineId" FROM "ImportIssue" q
    JOIN "OrderLine" l ON l."tenantId"=q."tenantId" AND l."importRunId"=q."importRunId" AND q."entityKey"='order:'||l."externalOrderId"||':'||l."externalLineId"
    JOIN "ConnectorConnection" c ON c."sourceId"=l."sourceId" AND c."tenantId"=l."tenantId" WHERE q."tenantId"=${tenantId} AND l."eventKey"='current' ORDER BY q."createdAt" DESC,q.id LIMIT 25`)

 ]);
 return {rows:rows.map(row=>({...row,eligibility:{...productEligibility(row.productKind),repricing:row.productKind==='MERCHANDISE' && row.retailPrice!=null && Number(row.retailPrice)>0 && row.quantity!=null && Number(row.quantity)>0},ageReference:productAgeReference(row.firstReceiptAt,row.firstSaleAt,row.observedAt)})),pagination:{page,pageSize:25,totalRows:total[0].n},summary,brands,aliases,components,stock,orderExceptions,normalizationReplayRequired:replay[0].n};
}
