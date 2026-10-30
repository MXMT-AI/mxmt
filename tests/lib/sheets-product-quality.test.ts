import { beforeAll, afterAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createMerchandisingDb } from "../helpers/merchandising-db";
import { getProductQuality } from "@/lib/product-quality";
let f: Awaited<ReturnType<typeof createMerchandisingDb>>;
beforeAll(async () => {
  f = await createMerchandisingDb();
  await f.pg.exec(`
    INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','A','a',now()),('b','B','b',now());
    INSERT INTO "User" (id,"tenantId",email,"passwordHash",name,role,"updatedAt") VALUES ('owner','a','owner@test.invalid','unused','Owner','ADMIN',now());
    INSERT INTO "DataSource" (id,"tenantId",kind,"driveFileId","updatedAt") VALUES ('sheet','a','GOOGLE_SHEETS','file',now()),('other','a','GOOGLE_SHEETS','other',now()),('foreign','b','GOOGLE_SHEETS','foreign',now());
    INSERT INTO "ConnectorSelection" ("tenantId","sourceId",revision,"updatedAt") VALUES ('a','sheet',1,now());
    INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES ('run','a','sheet','MANUAL','WARNING','run',current_date,now());
    INSERT INTO "Sku" (id,"tenantId",sku,name,category,"catalogAttributes") VALUES ('sku','a','Z1','Unknown product','Goods','{"importRunId":"run","sourceRecordKey":"catalog-record"}'),('hidden','a','H','Other source','Goods','{}'),('foreign','b','F','Foreign','Goods','{}');
    INSERT INTO "SkuAlias" (id,"tenantId","sourceId","skuId",type,value) VALUES ('alias','a','sheet','sku','SOURCE_PRODUCT_ID','p'),('hidden','a','other','hidden','SKU','H'),('foreign','b','foreign','foreign','SKU','F');
    INSERT INTO "OrderLine" (id,"tenantId","sourceId","importRunId","externalOrderId","externalLineId","skuId",kind,quantity,"netAmount","signedRevenue",currency,"paidAt","observedAt","sourceRecordKey","updatedAt") VALUES ('line','a','sheet','run','order','line','sku','SALE',1,100,100,'UAH',now(),now(),'order-record',now());
    INSERT INTO "ImportIssue" (id,"tenantId","importRunId","entityKey",code,severity,message,context) VALUES ('issue','a','run','order:order:line','MISSING_COST','WARNING','Missing cost','{}');
  `);
}, 30000);
afterAll(async () => f?.pg.close());
it("shows selected Sheets catalogue and missing evidence before any verified stock observation", async () => {
  const q = await getProductQuality('a', {}, f.db);
  expect(q.pagination.totalRows).toBe(1);
  expect(q.rows[0]).toMatchObject({ id: 'sku', sourceId: 'sheet', observedAt: null, quantity: null, currency: null, importRunId: 'run', sourceRecordKey: 'catalog-record' });
  expect(q.rows[0].issues).toEqual(expect.arrayContaining(['PRODUCT_KIND_UNVERIFIED','STOCK_QUANTITY_UNAVAILABLE']));
  expect(q.rows[0].ageReference.basis).toBe('UNAVAILABLE');
  expect(q.components).toContainEqual(expect.objectContaining({ component: 'UNKNOWN', currency: 'UAH', lineCount: 1, revenue: '100.0000' }));
  expect(q.orderExceptions).toContainEqual(expect.objectContaining({ code: 'MISSING_COST', orderId: 'order' }));
  expect(q.normalizationReplayRequired).toBe(1);
  expect((await getProductQuality('b', {}, f.db)).rows).toHaveLength(0);
});
it("retains verified price currency without inventing quantity or stock observation time", async () => {
  await f.pg.exec(`INSERT INTO "PriceHistory" (id,"tenantId","skuId","sourceId","importRunId","sourceRecordKey","observedAt",currency,"retailPrice") VALUES ('price','a','sku','sheet','run','price-record',now(),'UAH',100)`);
  const q = await getProductQuality('a', { code: 'STOCK_QUANTITY_UNAVAILABLE' }, f.db);
  expect(q.pagination.totalRows).toBe(1);
  expect(q.rows[0]).toMatchObject({ currency: 'UAH', quantity: null, costValue: null, observedAt: null });
  expect(q.rows[0].issues).toContain('PRODUCT_KIND_UNVERIFIED');
});
it("does not mix a deselected Sheets catalogue or its movements into another source", async () => {
  await f.pg.exec(`UPDATE "ConnectorSelection" SET "sourceId"='other',revision=revision+1 WHERE "tenantId"='a'`);
  const q = await getProductQuality('a', {}, f.db);
  expect(q.rows.map(r => r.id)).toEqual(['hidden']);
  expect(q.components).toEqual([]);
  expect(q.orderExceptions).toEqual([]);
  expect(q.normalizationReplayRequired).toBe(0);
});
