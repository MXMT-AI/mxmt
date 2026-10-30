import "server-only";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { Prisma } from "@prisma/client";
import { recordCatalogQuality } from "./product-quality";
import type { CatalogSnapshot } from "./contract";
import type { SqlClient } from "./database";
import type { OrderScope } from "./order-storage";
import { normalizeCatalog } from "./inventory-normalization";
import { retainRecord, refreshFirstReceipt } from "./receipt-storage";
import { payloadHash } from "./order-storage";
import { linkRetainedCatalogFacts } from "./catalog-linking";
import { retainSheetsSourceIdentity } from "./catalog-identity";

export interface CatalogEvidence {
  exportedCost?: {mappingId:string;reference:string};
  productKinds?:Record<string,string>;
  stockObserved?:boolean;
  stockProductIds?:string[];
  inTransitVerified?:boolean;
}

export async function storeCatalog(tx: SqlClient, scope: OrderScope, snapshot: CatalogSnapshot, evidence:CatalogEvidence = {}) {
  const { tenantId, sourceId, importRunId, timezone } = scope;
  const normalized=normalizeCatalog(snapshot, sourceId, scope.provider),issues=normalized.issues;
  const rows=normalized.rows.map(row=>({...row,attributeHash:payloadHash(row.attributeEvidence)}));
  const observedAt = new Date(snapshot.observedAt);
  const businessDate = Temporal.Instant.from(snapshot.observedAt).toZonedDateTimeISO(timezone).toPlainDate().toString();
  const [newer] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int n FROM "DataSourceRecord" WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND resource=${scope.provider&&scope.provider!=="salesdrive"?"catalog-json":"catalog-yml"} AND "observedAt">${observedAt}`);
  if (newer.n) return { products: rows.length, snapshots: 0, prices: 0, issues: ["STALE_CATALOG_OBSERVATION"], observedAt: snapshot.observedAt, businessDate };
  const rawKey = await retainRecord(tx, scope, scope.provider&&scope.provider!=="salesdrive"?"catalog-json":"catalog-yml", `feed:${snapshot.observedAt}`, { contentType:scope.provider&&scope.provider!=="salesdrive"?"application/json":"application/xml", body: snapshot.rawResponse }, observedAt);
  await tx.$executeRaw(Prisma.sql`CREATE TEMP TABLE mxmt_catalog_stage ON COMMIT DROP AS
    SELECT x.*, NULL::text AS "skuId", NULL::text AS "canonicalCategoryId", NULL::text AS "brandId", NULL::numeric AS "costPrice", '{}'::jsonb AS "costProvenance"
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x("observedAt" timestamptz,"priceObservedAt" timestamptz,"proposedId" text,"externalId" text,article text,"canonicalSku" text,name text,"categoryId" text,"categoryName" text,vendor text,barcode text,"retailPrice" numeric,"oldPrice" numeric,"exportedCost" numeric,"inTransit" numeric,quantity numeric,currency text,attributes jsonb,"attributeEvidence" jsonb,"attributeHash" text)`);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "DataSourceRecord" (id,"tenantId","sourceId","importRunId",resource,"externalId",payload,"payloadHash","observedAt")
    SELECT ${randomUUID()}||':'||t."externalId",${tenantId},${sourceId},${importRunId},'product-attributes',t."externalId"||':'||t."attributeHash",t."attributeEvidence",t."attributeHash",t."priceObservedAt" FROM mxmt_catalog_stage t
    ON CONFLICT ("importRunId",resource,"externalId") DO NOTHING`);
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR NO KEY UPDATE`);
  if (await retainSheetsSourceIdentity(tx, scope, rawKey)) issues.add("CATALOG_LEGACY_SKU_COLLISION");
  const [conflicts] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int n FROM mxmt_catalog_stage t WHERE
    (SELECT count(DISTINCT id) FROM (SELECT a."skuId" id FROM "SkuAlias" a WHERE a."tenantId"=${tenantId} AND a."sourceId"=${sourceId}
       AND ((a.type='SOURCE_PRODUCT_ID' AND a.value=t."externalId") OR (a.type IN ('SKU','VENDOR_CODE') AND a.value=t.article))
       UNION SELECT s.id FROM "Sku" s WHERE s."tenantId"=${tenantId} AND s.sku=t."canonicalSku" AND (t."skuId" IS NULL OR s.id=t."skuId")) candidates)>1`);
  if (conflicts.n) throw new Error("CATALOG_IDENTITY_CONFLICT");
  await tx.$executeRaw(Prisma.sql`UPDATE mxmt_catalog_stage t SET "skuId"=COALESCE(t."skuId",
    (SELECT a."skuId" FROM "SkuAlias" a WHERE a."tenantId"=${tenantId} AND a."sourceId"=${sourceId} AND ((a.type='SOURCE_PRODUCT_ID' AND a.value=t."externalId") OR (a.type IN ('SKU','VENDOR_CODE') AND a.value=t.article)) LIMIT 1),
    (SELECT s.id FROM "Sku" s WHERE s."tenantId"=${tenantId} AND s.sku=t."canonicalSku"),t."proposedId")`);
  const [duplicates] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int n FROM (SELECT "skuId" FROM mxmt_catalog_stage GROUP BY "skuId" HAVING count(*)>1) d`);
  if (duplicates.n) throw new Error("DUPLICATE_CATALOG_SKU");
  await tx.$executeRaw(Prisma.sql`INSERT INTO "Category" (id,"tenantId",key,name,"updatedAt")
    SELECT ${randomUUID()} || ':' || t."categoryId",${tenantId},${`${scope.provider??"salesdrive"}:${sourceId}:`} || t."categoryId",MAX(COALESCE(t."categoryName",t."categoryId")),now()
    FROM mxmt_catalog_stage t WHERE t."categoryId" IS NOT NULL GROUP BY t."categoryId"
    ON CONFLICT ("tenantId",key) DO UPDATE SET name=EXCLUDED.name,"updatedAt"=now()`);
  await tx.$executeRaw(Prisma.sql`UPDATE mxmt_catalog_stage t SET "canonicalCategoryId"=c.id FROM "Category" c WHERE c."tenantId"=${tenantId} AND c.key=${`${scope.provider??"salesdrive"}:${sourceId}:`} || t."categoryId"`);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "Brand" (id,"tenantId",name,"normalizationKey",currency)
    SELECT ${randomUUID()} || ':' || t.vendor,${tenantId},t.vendor,t.vendor,'UNKNOWN' FROM mxmt_catalog_stage t
    WHERE t.vendor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "BrandAlias" a WHERE a."tenantId"=${tenantId} AND a.value=t.vendor)
      AND NOT EXISTS (SELECT 1 FROM "Brand" b WHERE b."tenantId"=${tenantId} AND (b."normalizationKey"=t.vendor OR upper(btrim(b.name))=t.vendor)) GROUP BY t.vendor
    ON CONFLICT ("tenantId","normalizationKey") DO NOTHING`);
  await tx.$executeRaw(Prisma.sql`UPDATE mxmt_catalog_stage t SET "brandId"=COALESCE(
    (SELECT a."brandId" FROM "BrandAlias" a WHERE a."tenantId"=${tenantId} AND a.value=t.vendor),
    (SELECT MIN(b.id) FROM "Brand" b WHERE b."tenantId"=${tenantId} AND (b."normalizationKey"=t.vendor OR upper(btrim(b.name))=t.vendor) HAVING count(*)=1))`);
  await tx.$executeRaw(Prisma.sql`UPDATE mxmt_catalog_stage t SET attributes=attributes||jsonb_build_object('normalization',jsonb_build_object('version',1,'brandKey',t.vendor,'brandId',t."brandId",'aliasRevision',(SELECT a.revision FROM "BrandAlias" a WHERE a."tenantId"=${tenantId} AND a.value=t.vendor)))`);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "Sku" (id,"tenantId",sku,name,category,"categoryId","brandId",barcode,"priceRetail","pricePurchase","catalogAttributes")
    SELECT t."skuId",${tenantId},t."canonicalSku",t.name,COALESCE(t."categoryName",t."categoryId",''),t."canonicalCategoryId",t."brandId",t.barcode,t."retailPrice"::double precision,NULL,
      t.attributes || jsonb_build_object('sourceId',${sourceId}::text,'importRunId',${importRunId}::text,'sourceRecordKey',${rawKey}::text) FROM mxmt_catalog_stage t
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,"categoryId"=EXCLUDED."categoryId","brandId"=EXCLUDED."brandId",
      barcode=EXCLUDED.barcode,"priceRetail"=EXCLUDED."priceRetail","catalogAttributes"=EXCLUDED."catalogAttributes"`);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "SkuAlias" (id,"tenantId","sourceId","skuId",type,value)
    SELECT ${randomUUID()} || ':' || t."externalId" || ':id',${tenantId},${sourceId},t."skuId",'SOURCE_PRODUCT_ID'::"SkuAliasType",t."externalId" FROM mxmt_catalog_stage t
    UNION ALL SELECT ${randomUUID()} || ':' || t."externalId" || ':sku',${tenantId},${sourceId},t."skuId",'SKU'::"SkuAliasType",t.article FROM mxmt_catalog_stage t WHERE t.article IS NOT NULL
    ON CONFLICT ("tenantId","sourceId",type,value) DO NOTHING`);
  await tx.$executeRaw(Prisma.sql`ANALYZE mxmt_catalog_stage`);
  await linkRetainedCatalogFacts(tx, scope);
  const skuIds = rows.length ? (await tx.$queryRaw<Array<{ skuId: string }>>(Prisma.sql`SELECT "skuId" FROM mxmt_catalog_stage`)).map((row) => row.skuId) : [];
  await refreshFirstReceipt(tx, tenantId, skuIds);
  await tx.$executeRaw(Prisma.sql`WITH ranked AS MATERIALIZED (
    SELECT l."skuId",l."unitCost",l."costVerifiedAt",l.currency,t2.currency AS "catalogCurrency",r.id,r."sourceRecordKey",r."importRunId",r."receivedAt",
      dense_rank() OVER (PARTITION BY l."skuId" ORDER BY r."receivedAt" DESC) AS position
    FROM "ReceiptLine" l JOIN "Receipt" r ON r.id=l."receiptId" AND r."tenantId"=l."tenantId" JOIN mxmt_catalog_stage t2 ON t2."skuId"=l."skuId"
    WHERE r."tenantId"=${tenantId} AND r."sourceId"=${sourceId} AND r."movementType"='SUPPLIER_RECEIPT' AND r."postingVerifiedAt" IS NOT NULL AND l.quantity>0 AND r."receivedAt"<=t2."observedAt"
  ), latest AS (
    SELECT "skuId",MIN("unitCost") price,jsonb_agg(DISTINCT id) ids,jsonb_agg(DISTINCT "sourceRecordKey") "rawKeys",jsonb_agg(DISTINCT "importRunId") "runIds",MAX("receivedAt") "receivedAt"
    FROM ranked WHERE position=1 GROUP BY "skuId"
    HAVING count(DISTINCT "unitCost")=1 AND bool_and("costVerifiedAt" IS NOT NULL AND "unitCost">0 AND currency IS NOT NULL AND currency="catalogCurrency")
  ) UPDATE mxmt_catalog_stage t SET "costPrice"=c.price,"costProvenance"=jsonb_build_object('type','receipt','receiptIds',c.ids,'rawKeys',c."rawKeys",'importRunIds',c."runIds",'receivedAt',c."receivedAt") FROM latest c WHERE t."skuId"=c."skuId"`);
  await tx.$executeRaw(Prisma.sql`WITH ranked AS MATERIALIZED (
    SELECT l."skuId",l."sourceAmounts",l."costAmount",l.currency,t2.currency AS "catalogCurrency",l."externalOrderId",l."sourceRecordKey",l."importRunId",l."paidAt",
      dense_rank() OVER (PARTITION BY l."skuId" ORDER BY l."paidAt" DESC) AS position
    FROM "OrderLine" l JOIN mxmt_catalog_stage t2 ON t2."skuId"=l."skuId"
    WHERE l."tenantId"=${tenantId} AND l."sourceId"=${sourceId} AND l.kind='SALE' AND l."eventKey"='current' AND l.quantity>0 AND l."paidAt"<=t2."observedAt"
  ), latest AS (
    SELECT "skuId",MIN(CASE WHEN ("sourceAmounts"->>'unitCost') ~ '^[0-9]{1,14}([.][0-9]{1,4})?$' THEN ("sourceAmounts"->>'unitCost')::numeric END) cost,
      jsonb_agg(DISTINCT "externalOrderId") ids,jsonb_agg(DISTINCT "sourceRecordKey") "rawKeys",jsonb_agg(DISTINCT "importRunId") "runIds",MAX("paidAt") "paidAt"
    FROM ranked WHERE position=1 GROUP BY "skuId"
    HAVING bool_and("costAmount" IS NOT NULL AND currency IS NOT NULL AND currency="catalogCurrency" AND
      CASE WHEN ("sourceAmounts"->>'unitCost') ~ '^[0-9]{1,14}([.][0-9]{1,4})?$' THEN ("sourceAmounts"->>'unitCost')::numeric>0 ELSE false END)
      AND count(DISTINCT "sourceAmounts"->>'unitCost')=1
  ) UPDATE mxmt_catalog_stage t SET "costPrice"=s.cost,"costProvenance"=jsonb_build_object('type','sale','orderIds',s.ids,'rawKeys',s."rawKeys",'importRunIds',s."runIds",'paidAt',s."paidAt") FROM latest s WHERE t."skuId"=s."skuId" AND t."costPrice" IS NULL`);
  if (evidence.exportedCost) await tx.$executeRaw(Prisma.sql`UPDATE mxmt_catalog_stage SET "costPrice"="exportedCost","costProvenance"=jsonb_build_object('type','mapped_catalog','mappingId',${evidence.exportedCost.mappingId}::text,'reference',${evidence.exportedCost.reference}::text,'importRunId',${importRunId}::text,'sourceRecordKey',${rawKey}::text) WHERE "exportedCost">0 AND currency IS NOT NULL`);
  const missing = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int n FROM mxmt_catalog_stage WHERE "costPrice" IS NULL`);
  if (missing[0].n) issues.add("COST_UNVERIFIED");
  await tx.$executeRaw(Prisma.sql`UPDATE "Sku" s SET "pricePurchase"=t."costPrice"::double precision FROM mxmt_catalog_stage t WHERE s."tenantId"=${tenantId} AND s.id=t."skuId"`);
  const priceChanges = await tx.$executeRaw(Prisma.sql`INSERT INTO "PriceHistory" (id,"tenantId","skuId","sourceId","importRunId","sourceRecordKey","observedAt","retailPrice","oldPrice","costPrice",currency,"costProvenance")
    SELECT ${randomUUID()} || ':' || t."skuId",${tenantId},t."skuId",${sourceId},${importRunId},${`${rawKey}:${snapshot.observedAt}`},t."priceObservedAt",t."retailPrice",t."oldPrice",t."costPrice",t.currency,t."costProvenance"
    FROM mxmt_catalog_stage t LEFT JOIN LATERAL (SELECT p.* FROM "PriceHistory" p WHERE p."tenantId"=${tenantId} AND p."sourceId"=${sourceId} AND p."skuId"=t."skuId" ORDER BY p."observedAt" DESC,p."createdAt" DESC LIMIT 1) old ON true
    WHERE (old.id IS NULL AND (t."retailPrice" IS NOT NULL OR t."costPrice" IS NOT NULL OR t."oldPrice" IS NOT NULL)) OR (old.id IS NOT NULL AND t."priceObservedAt">=old."observedAt" AND
      (old."retailPrice" IS DISTINCT FROM t."retailPrice" OR old."costPrice" IS DISTINCT FROM t."costPrice" OR old."oldPrice" IS DISTINCT FROM t."oldPrice" OR old.currency IS DISTINCT FROM t.currency))
    ON CONFLICT ("tenantId","sourceId","skuId","sourceRecordKey") DO NOTHING`);
  const snapshots = evidence.stockObserved === false ? 0 : await tx.$executeRaw(Prisma.sql`INSERT INTO "InventorySnapshot" (id,"tenantId","skuId","qtyOnHand",quantity,"snapshotDate","observedAt",timezone,"costPrice","retailPrice","costValue","retailValue",currency,"sourceId","importRunId","sourceRecordKey","costProvenance",diagnostics,"qtyInTransit","inTransitVerifiedAt")
    SELECT ${randomUUID()} || ':' || t."skuId",${tenantId},t."skuId",CASE WHEN t.quantity=trunc(t.quantity) AND t.quantity BETWEEN -2147483648 AND 2147483647 THEN t.quantity::int ELSE NULL END,t.quantity,(t."observedAt" AT TIME ZONE ${timezone})::date,t."observedAt",${timezone},t."costPrice",t."retailPrice",
      CASE WHEN t.quantity>=0 AND t.quantity*t."costPrice"<100000000000000 THEN t.quantity*t."costPrice" ELSE NULL END,CASE WHEN t.quantity>=0 AND t.quantity*t."retailPrice"<100000000000000 THEN t.quantity*t."retailPrice" ELSE NULL END,t.currency,${sourceId},${importRunId},${rawKey},t."costProvenance",
      jsonb_build_object('historicalStockAvailable',false,'quantityMissing',t.quantity IS NULL,'negativeStock',t.quantity<0,'costMissing',t."costPrice" IS NULL,'retailMissing',t."retailPrice" IS NULL,'valueOverflow',COALESCE(t.quantity*t."costPrice">=100000000000000 OR t.quantity*t."retailPrice">=100000000000000,false)),0,NULL FROM mxmt_catalog_stage t WHERE (${JSON.stringify(evidence.stockProductIds??null)}::jsonb='null'::jsonb OR t."externalId" IN (SELECT jsonb_array_elements_text(CASE WHEN ${JSON.stringify(evidence.stockProductIds??null)}::jsonb='null'::jsonb THEN '[]'::jsonb ELSE ${JSON.stringify(evidence.stockProductIds??null)}::jsonb END)))
    ON CONFLICT ("tenantId","sourceId","skuId","snapshotDate") DO UPDATE SET "qtyOnHand"=EXCLUDED."qtyOnHand",quantity=EXCLUDED.quantity,"observedAt"=EXCLUDED."observedAt",timezone=EXCLUDED.timezone,
      "costPrice"=EXCLUDED."costPrice","retailPrice"=EXCLUDED."retailPrice","costValue"=EXCLUDED."costValue","retailValue"=EXCLUDED."retailValue",currency=EXCLUDED.currency,"sourceId"=EXCLUDED."sourceId","importRunId"=EXCLUDED."importRunId","sourceRecordKey"=EXCLUDED."sourceRecordKey","costProvenance"=EXCLUDED."costProvenance",diagnostics=EXCLUDED.diagnostics,"qtyInTransit"=EXCLUDED."qtyInTransit","inTransitVerifiedAt"=EXCLUDED."inTransitVerifiedAt"
    WHERE "InventorySnapshot"."observedAt" IS NULL OR "InventorySnapshot"."observedAt"<=EXCLUDED."observedAt"`);
  if (evidence.stockObserved !== false && evidence.inTransitVerified) await tx.$executeRaw(Prisma.sql`UPDATE "InventorySnapshot" s SET "qtyInTransit"=CASE WHEN t."inTransit"=trunc(t."inTransit") AND t."inTransit" BETWEEN 0 AND 2147483647 THEN t."inTransit"::int ELSE 0 END,"inTransitVerifiedAt"=CASE WHEN t."inTransit"=trunc(t."inTransit") AND t."inTransit" BETWEEN 0 AND 2147483647 THEN s."observedAt" ELSE NULL END FROM mxmt_catalog_stage t WHERE s."tenantId"=${tenantId} AND s."sourceId"=${sourceId} AND s."importRunId"=${importRunId} AND s."skuId"=t."skuId" AND s."observedAt"=t."observedAt"`);
  if(evidence.productKinds) await tx.$executeRaw(Prisma.sql`UPDATE "Sku" s SET "productKind"=x.kind::"MerchandiseProductKind" FROM jsonb_to_recordset(${JSON.stringify(Object.entries(evidence.productKinds).map(([id,kind])=>({id,kind})))}::jsonb) x(id text,kind text),mxmt_catalog_stage t WHERE t."externalId"=x.id AND s.id=t."skuId" AND s."tenantId"=${tenantId}`);
  await recordCatalogQuality(tx, scope, rawKey);
  return { products: rows.length, snapshots, prices: priceChanges, issues: [...issues], observedAt: snapshot.observedAt, businessDate };
}
