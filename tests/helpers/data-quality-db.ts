import { createScreenDb } from "./screen-db";
/** Synthetic issue #49 acceptance amounts, independent of customer benchmark sign-off. */
export async function createDataQualityDb() {
  const f = await createScreenDb();
  await f.pg.exec(`UPDATE "Sku" SET "productKind"='SERVICE';
 INSERT INTO "Sku" (id,"tenantId",sku,name,category,"brandId","categoryId","productKind") VALUES ('unbranded','a','NO-BRAND','Unbranded watches','Unknown',NULL,NULL,'MERCHANDISE'),('zero-price','a','ZERO-PRICE','Zero-price watches','Watches','brand-a','cat-a','MERCHANDISE');
 INSERT INTO "InventorySnapshot" (id,"tenantId","skuId","snapshotDate","sourceId","importRunId","sourceRecordKey","observedAt",timezone,quantity,"costPrice","retailPrice","costValue",currency) VALUES ('unbranded-stock','a','unbranded','2026-10-25','source','inventory-run','raw:unbranded','2026-10-25T08:00:00Z','Europe/Kyiv',330,1312.1212,2000,433000,'UAH'),('zero-stock','a','zero-price','2026-10-25','source','inventory-run','raw:zero','2026-10-25T08:00:00Z','Europe/Kyiv',52,8000,0,416000,'UAH');
 INSERT INTO "ImportIssue" (id,"tenantId","importRunId",code,severity,message,context,"entityKey") VALUES ('warning','a','orders-run','MISSING_COST','WARNING','private contact', '{"skuId":"unbranded","sourceRecordKey":"raw:unbranded","apiKey":"secret","customerPhone":"private"}','sku:unbranded');`);
  return f;
}
