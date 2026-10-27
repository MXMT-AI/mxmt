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

/** Activate a fully validated observation in one transaction using set-based catalogue writes. */
export async function storeCatalog(tx: SqlClient, scope: OrderScope, snapshot: CatalogSnapshot) {
  const { tenantId, sourceId, importRunId, timezone } = scope;
  const { rows, issues } = normalizeCatalog(snapshot, sourceId, scope.provider);
  const observedAt = new Date(snapshot.observedAt);
  const businessDate = Temporal.Instant.from(snapshot.observedAt).toZonedDateTimeISO(timezone).toPlainDate().toString();
  const [newer] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int n FROM "DataSourceRecord" WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND resource=${scope.provider&&scope.provider!=="salesdrive"?"catalog-json":"catalog-yml"} AND "observedAt">${observedAt}`);
  if (newer.n) return { products: rows.length, snapshots: 0, prices: 0, issues: ["STALE_CATALOG_OBSERVATION"], observedAt: snapshot.observedAt, businessDate };
  const rawKey = await retainRecord(tx, scope, scope.provider&&scope.provider!=="salesdrive"?"catalog-json":"catalog-yml", `feed:${snapshot.observedAt}`, { contentType:scope.provider&&scope.provider!=="salesdrive"?"application/json":"application/xml", body: snapshot.rawResponse }, observedAt);
  // Transaction-local staging never becomes an active catalogue or stock observation.
  await tx.$executeRaw(Prisma.sql`CREATE TEMP TABLE mxmt_catalog_stage ON COMMIT DROP AS
    SELECT x.*, NULL::text AS "skuId", NULL::text AS "canonicalCategoryId", NULL::text AS "brandId", NULL::numeric AS "costPrice", '{}'::jsonb AS "costProvenance"
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x("observedAt" timestamptz,"priceObservedAt" timestamptz,"proposedId" text,"externalId" text,article text,"canonicalSku" text,name text,"categoryId" text,"categoryName" text,vendor text,barcode text,"retailPrice" numeric,"oldPrice" numeric,quantity numeric,currency text,attributes jsonb)`);
  const [conflicts] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int n FROM mxmt_catalog_stage t WHERE
    (SELECT count(DISTINCT id) FROM (SELECT a."skuId" id FROM "SkuAlias" a WHERE a."tenantId"=${tenantId} AND a."sourceId"=${sourceId}
       AND ((a.type='SOURCE_PRODUCT_ID' AND a.value=t."externalId") OR (a.type IN ('SKU','VENDOR_CODE') AND a.value=t.article))
       UNION SELECT s.id FROM "Sku" s WHERE s."tenantId"=${tenantId} AND s.sku=t."canonicalSku") candidates)>1`);
  if (conflicts.n) throw new Error("CATALOG_IDENTITY_CONFLICT");
  await tx.$executeRaw(Prisma.sql`UPDATE mxmt_catalog_stage t SET "skuId"=COALESCE(
    (SELECT a."skuId" FROM "SkuAlias" a WHERE a."tenantId"=${tenantId} AND a."sourceId"=${sourceId} AND ((a.type='SOURCE_PRODUCT_ID' AND a.value=t."externalId") OR (a.type IN ('SKU','VENDOR_CODE') AND a.value=t.article)) LIMIT 1),
    (SELECT s.id FROM "Sku" s WHERE s."tenantId"=${tenantId} AND s.sku=t."canonicalSku"),t."proposedId")`);
  const [duplicates] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int n FROM (SELECT "skuId" FROM mxmt_catalog_stage GROUP BY "skuId" HAVING count(*)>1) d`);
  if (duplicates.n) throw new Error("DUPLICATE_CATALOG_SKU");
  // Category source IDs are namespaced. Vendor names alone do not prove ownership or supplier terms.
  await tx.$executeRaw(Prisma.sql`INSERT INTO "Category" (id,"tenantId",key,name,"updatedAt")
    SELECT ${randomUUID()} || ':' || t."categoryId",${tenantId},${`${scope.provider??"salesdrive"}:${sourceId}:`} || t."categoryId",MAX(COALESCE(t."categoryName",t."categoryId")),now()
    FROM mxmt_catalog_stage t WHERE t."categoryId" IS NOT NULL GROUP BY t."categoryId"
    ON CONFLICT ("tenantId",key) DO UPDATE SET name=EXCLUDED.name,"updatedAt"=now()`);
  await tx.$executeRaw(Prisma.sql`UPDATE mxmt_catalog_stage t SET "canonicalCategoryId"=c.id FROM "Category" c WHERE c."tenantId"=${tenantId} AND c.key=${`${scope.provider??"salesdrive"}:${sourceId}:`} || t."categoryId"`);
  // Serialize tenant identity edits with catalogue activation, without merging financial terms.
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR NO KEY UPDATE`);
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
  // Link retained facts that arrived before their catalogue, using explicit source identities/SKUs.
  await tx.$executeRaw(Prisma.sql`UPDATE "OrderLine" l SET "skuId"=t."skuId" FROM mxmt_catalog_stage t WHERE l."tenantId"=${tenantId} AND l."sourceId"=${sourceId} AND l."skuId" IS NULL AND l."sourceSku"=t.article`);
  await tx.$executeRaw(Prisma.sql`UPDATE "ReceiptLine" l SET "skuId"=t."skuId" FROM mxmt_catalog_stage t,"Receipt" r
    WHERE l."tenantId"=${tenantId} AND r."tenantId"=l."tenantId" AND r.id=l."receiptId" AND r."sourceId"=${sourceId} AND l."skuId" IS NULL
    AND (l."externalProductId"=t."externalId" OR l."sourceSku"=t.article)
    AND NOT EXISTS (SELECT 1 FROM mxmt_catalog_stage other WHERE other."skuId"<>t."skuId" AND (l."externalProductId"=other."externalId" OR l."sourceSku"=other.article))`);
  const skuIds = rows.length ? (await tx.$queryRaw<Array<{ skuId: string }>>(Prisma.sql`SELECT "skuId" FROM mxmt_catalog_stage`)).map((row) => row.skuId) : [];
  await refreshFirstReceipt(tx, tenantId, skuIds);
  // Tied date-only receipts with different prices cannot establish which purchase price was latest.
  await tx.$executeRaw(Prisma.sql`UPDATE mxmt_catalog_stage t SET "costPrice"=c.price,"costProvenance"=jsonb_build_object('type','receipt','receiptIds',c.ids,'rawKeys',c."rawKeys",'importRunIds',c."runIds",'receivedAt',c."receivedAt") FROM (
    SELECT l."skuId",MIN(l."unitCost") price,jsonb_agg(DISTINCT r.id) ids,jsonb_agg(DISTINCT r."sourceRecordKey") "rawKeys",jsonb_agg(DISTINCT r."importRunId") "runIds",MAX(r."receivedAt") "receivedAt" FROM "ReceiptLine" l JOIN "Receipt" r ON r.id=l."receiptId" AND r."tenantId"=l."tenantId" JOIN mxmt_catalog_stage t2 ON t2."skuId"=l."skuId"
    WHERE r."tenantId"=${tenantId} AND r."sourceId"=${sourceId} AND r."movementType"='SUPPLIER_RECEIPT' AND r."postingVerifiedAt" IS NOT NULL AND l.quantity>0 AND r."receivedAt"<=t2."observedAt"
      AND r."receivedAt"=(SELECT MAX(r2."receivedAt") FROM "Receipt" r2 JOIN "ReceiptLine" l2 ON l2."receiptId"=r2.id AND l2."tenantId"=r2."tenantId" WHERE r2."tenantId"=${tenantId} AND r2."sourceId"=${sourceId} AND l2."skuId"=l."skuId" AND l2.quantity>0 AND r2."movementType"='SUPPLIER_RECEIPT' AND r2."postingVerifiedAt" IS NOT NULL AND r2."receivedAt"<=t2."observedAt")
    GROUP BY l."skuId" HAVING count(DISTINCT l."unitCost")=1 AND bool_and(l."costVerifiedAt" IS NOT NULL AND l."unitCost">0 AND l.currency IS NOT NULL AND l.currency=t2.currency)) c WHERE t."skuId"=c."skuId"`);
  await tx.$executeRaw(Prisma.sql`UPDATE mxmt_catalog_stage t SET "costPrice"=s.cost,"costProvenance"=jsonb_build_object('type','sale','orderIds',s.ids,'rawKeys',s."rawKeys",'importRunIds',s."runIds",'paidAt',s."paidAt") FROM (
    SELECT l."skuId",MIN(CASE WHEN (l."sourceAmounts"->>'unitCost') ~ '^[0-9]{1,14}([.][0-9]{1,4})?$' THEN (l."sourceAmounts"->>'unitCost')::numeric END) cost,
      jsonb_agg(DISTINCT l."externalOrderId") ids,jsonb_agg(DISTINCT l."sourceRecordKey") "rawKeys",jsonb_agg(DISTINCT l."importRunId") "runIds",MAX(l."paidAt") "paidAt" FROM "OrderLine" l JOIN mxmt_catalog_stage t2 ON t2."skuId"=l."skuId"
    WHERE l."tenantId"=${tenantId} AND l."sourceId"=${sourceId} AND l.kind='SALE' AND l."eventKey"='current' AND l.quantity>0
      AND l."paidAt"=(SELECT MAX(l2."paidAt") FROM "OrderLine" l2 WHERE l2."tenantId"=${tenantId} AND l2."sourceId"=${sourceId} AND l2."skuId"=l."skuId" AND l2.kind='SALE' AND l2."eventKey"='current' AND l2.quantity>0 AND l2."paidAt"<=t2."observedAt")
    GROUP BY l."skuId" HAVING bool_and(l."costAmount" IS NOT NULL AND l.currency IS NOT NULL AND l.currency=t2.currency AND
      CASE WHEN (l."sourceAmounts"->>'unitCost') ~ '^[0-9]{1,14}([.][0-9]{1,4})?$' THEN (l."sourceAmounts"->>'unitCost')::numeric>0 ELSE false END)
      AND count(DISTINCT l."sourceAmounts"->>'unitCost')=1) s WHERE t."skuId"=s."skuId" AND t."costPrice" IS NULL`);
  const missing = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int n FROM mxmt_catalog_stage WHERE "costPrice" IS NULL`);
  if (missing[0].n) issues.add("COST_UNVERIFIED");
  await tx.$executeRaw(Prisma.sql`UPDATE "Sku" s SET "pricePurchase"=t."costPrice"::double precision FROM mxmt_catalog_stage t WHERE s."tenantId"=${tenantId} AND s.id=t."skuId"`);
  const priceChanges = await tx.$executeRaw(Prisma.sql`INSERT INTO "PriceHistory" (id,"tenantId","skuId","sourceId","importRunId","sourceRecordKey","observedAt","retailPrice","oldPrice","costPrice",currency,"costProvenance")
    SELECT ${randomUUID()} || ':' || t."skuId",${tenantId},t."skuId",${sourceId},${importRunId},${`${rawKey}:${snapshot.observedAt}`},t."priceObservedAt",t."retailPrice",t."oldPrice",t."costPrice",t.currency,t."costProvenance"
    FROM mxmt_catalog_stage t LEFT JOIN LATERAL (SELECT p.* FROM "PriceHistory" p WHERE p."tenantId"=${tenantId} AND p."sourceId"=${sourceId} AND p."skuId"=t."skuId" ORDER BY p."observedAt" DESC,p."createdAt" DESC LIMIT 1) old ON true
    WHERE (old.id IS NULL AND (t."retailPrice" IS NOT NULL OR t."costPrice" IS NOT NULL OR t."oldPrice" IS NOT NULL)) OR (old.id IS NOT NULL AND t."priceObservedAt">=old."observedAt" AND
      (old."retailPrice" IS DISTINCT FROM t."retailPrice" OR old."costPrice" IS DISTINCT FROM t."costPrice" OR old."oldPrice" IS DISTINCT FROM t."oldPrice" OR old.currency IS DISTINCT FROM t.currency))
    ON CONFLICT ("tenantId","sourceId","skuId","sourceRecordKey") DO NOTHING`);
  const snapshots = await tx.$executeRaw(Prisma.sql`INSERT INTO "InventorySnapshot" (id,"tenantId","skuId","qtyOnHand",quantity,"snapshotDate","observedAt",timezone,"costPrice","retailPrice","costValue","retailValue",currency,"sourceId","importRunId","sourceRecordKey","costProvenance",diagnostics)
    SELECT ${randomUUID()} || ':' || t."skuId",${tenantId},t."skuId",CASE WHEN t.quantity=trunc(t.quantity) AND t.quantity BETWEEN -2147483648 AND 2147483647 THEN t.quantity::int ELSE NULL END,t.quantity,(t."observedAt" AT TIME ZONE ${timezone})::date,t."observedAt",${timezone},t."costPrice",t."retailPrice",
      CASE WHEN t.quantity>=0 AND t.quantity*t."costPrice"<100000000000000 THEN t.quantity*t."costPrice" ELSE NULL END,CASE WHEN t.quantity>=0 AND t.quantity*t."retailPrice"<100000000000000 THEN t.quantity*t."retailPrice" ELSE NULL END,t.currency,${sourceId},${importRunId},${rawKey},t."costProvenance",
      jsonb_build_object('historicalStockAvailable',false,'quantityMissing',t.quantity IS NULL,'negativeStock',t.quantity<0,'costMissing',t."costPrice" IS NULL,'retailMissing',t."retailPrice" IS NULL,'valueOverflow',COALESCE(t.quantity*t."costPrice">=100000000000000 OR t.quantity*t."retailPrice">=100000000000000,false)) FROM mxmt_catalog_stage t
    ON CONFLICT ("tenantId","sourceId","skuId","snapshotDate") DO UPDATE SET "qtyOnHand"=EXCLUDED."qtyOnHand",quantity=EXCLUDED.quantity,"observedAt"=EXCLUDED."observedAt",timezone=EXCLUDED.timezone,
      "costPrice"=EXCLUDED."costPrice","retailPrice"=EXCLUDED."retailPrice","costValue"=EXCLUDED."costValue","retailValue"=EXCLUDED."retailValue",currency=EXCLUDED.currency,"sourceId"=EXCLUDED."sourceId","importRunId"=EXCLUDED."importRunId","sourceRecordKey"=EXCLUDED."sourceRecordKey","costProvenance"=EXCLUDED."costProvenance",diagnostics=EXCLUDED.diagnostics
    WHERE "InventorySnapshot"."observedAt" IS NULL OR "InventorySnapshot"."observedAt"<=EXCLUDED."observedAt"`);
  await recordCatalogQuality(tx, scope, rawKey);
  return { products: rows.length, snapshots, prices: priceChanges, issues: [...issues], observedAt: snapshot.observedAt, businessDate };
}
