import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import type { SqlClient, SqlDatabase } from "@/lib/connectors/database";
import type { CatalogSnapshot, ReceiptDto } from "@/lib/connectors/contract";
import { storeCatalog } from "@/lib/connectors/catalog-storage";
import { storeReceipt } from "@/lib/connectors/receipt-storage";
import { SalesDriveConnector } from "@/lib/connectors/salesdrive";
import { enqueueInventoryImport, getInventoryProgress, processInventoryJob } from "@/lib/connectors/inventory-jobs";
import { claimOrderJob, enqueueOrderImport } from "@/lib/connectors/order-jobs";
import type { InventoryPolicy } from "@/lib/connectors/inventory-normalization";

let pg: PGlite, db: SqlDatabase;
function bridge(client: Pick<PGlite, "query">): SqlClient { return { $queryRaw: async <T,>(q: Prisma.Sql) => (await client.query(q.text,q.values)).rows as T,
  $executeRaw: async (q) => (await client.query(q.text,q.values)).affectedRows ?? 0 }; }
const scope = { tenantId: "a", sourceId: "source-a", importRunId: "run-a", timezone: "Europe/Kyiv" };
const credentials = { accountHost: "demo.salesdrive.me", ordersApiKey: "synthetic", receiptsApiKey: "synthetic-receipts", ymlUrl: "https://demo.salesdrive.me/export/yml/export.yml?publicKey=synthetic" };
const xml = '<yml_catalog><shop><categories><category id="c1">Dresses</category></categories><offers><offer id="p1" available="true"><vendorCode>SKU1</vendorCode><name>Dress</name><price>100.1234</price><oldprice>120</oldprice><vendorprice>900</vendorprice><currencyId>UAH</currencyId><quantity_in_stock>2.5</quantity_in_stock><categoryId>c1</categoryId><vendor>Brand</vendor><barcode>4820000000001</barcode></offer></offers></shop></yml_catalog>';
async function catalog(time = "2026-10-24T22:30:00.000Z", text = xml): Promise<CatalogSnapshot> {
  const snapshot = await new SalesDriveConnector(credentials, async () => new Response(text)).getCatalogSnapshot();
  return { ...snapshot, observedAt: time, products: snapshot.products.map((p) => ({ ...p, observedAt: time })), stock: snapshot.stock.map((s) => ({ ...s, observedAt: time })) };
}
const policy: InventoryPolicy = { receipts: { postedStatuses: ["2"], suppliers: { "42": "supplier-a" }, productIdField: "parameter", currency: "UAH", unitCostVerified: true } };
function receipt(id = "1", type: ReceiptDto["movementType"] = "supplier_receipt", price = "40", date = "2026-10-20"): ReceiptDto {
  return { externalId: id, raw: { id, type, price, date }, observedAt: "2026-10-24T20:00:00.000Z", updatedAt: "2026-10-24 22:00:00", receivedAt: date, movementType: type, statusId: "2", supplierId: "42", postingVerified: false,
    lines: [{ externalLineId: null, productId: "internal1", sourceProductId: "p1", sku: "SKU1", quantity: "3", unitCost: price }] };
}
beforeAll(async () => {
  pg = new PGlite(); const root = new URL("../../prisma/migrations/", import.meta.url);
  for (const name of (await readdir(root,{withFileTypes:true})).filter((x)=>x.isDirectory()).map((x)=>x.name).sort()) await pg.exec(await readFile(new URL(`${name}/migration.sql`,root),"utf8"));
  db = { ...bridge(pg), $transaction: async (cb) => pg.transaction(async (tx)=>cb(bridge(tx))) };
  await pg.exec(`INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','A','a',now()),('b','B','b',now());
    INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('source-a','a','SALESDRIVE','demo.salesdrive.me',now()),('source-b','b','SALESDRIVE','other.salesdrive.me',now());
    INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId","accountHost","encryptedConfig","hasYmlUrl","hasReceiptsKey","updatedAt") VALUES ('conn-a','a','source-a','demo.salesdrive.me','encrypted',true,true,now()),('conn-b','b','source-b','other.salesdrive.me','encrypted',true,false,now());
    INSERT INTO "Supplier" (id,"tenantId",key,name,"updatedAt") VALUES ('supplier-a','a','fixture','Supplier',now());
    INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES ('run-a','a','source-a','MANUAL','SUCCESS','fixture',now(),now());`);
},30_000);
afterAll(async ()=>pg?.close());
describe("catalogue observation", () => {
  it("maps native fields, preserves fractional stock and unknown cost, uses the actual business day", async () => {
    const result = await db.$transaction((tx)=>storeCatalog(tx,scope,initialCatalog));
    expect(result).toMatchObject({ products: 1, snapshots: 1, prices: 1, businessDate: "2026-10-25" });
    expect((await pg.query('SELECT "qtyOnHand",quantity,"costPrice","costValue","retailValue",timezone FROM "InventorySnapshot"')).rows).toEqual([{ qtyOnHand:null,quantity:"2.5000",costPrice:null,costValue:null,retailValue:"250.3085",timezone:"Europe/Kyiv" }]);
    expect((await pg.query('SELECT sku,barcode,"pricePurchase","catalogAttributes"->>\'vendor\' vendor FROM "Sku"')).rows).toEqual([{sku:"SKU1",barcode:"4820000000001",pricePurchase:null,vendor:"Brand"}]);
    expect((await pg.query('SELECT name FROM "Category"')).rows).toEqual([{name:"Dresses"}]);
  });
  it("replays unchanged observations without extra price events or daily snapshots", async () => {
    await db.$transaction((tx)=>storeCatalog(tx,scope,initialCatalog));
    await db.$transaction(async(tx)=>storeCatalog(tx,scope,await catalog("2026-10-24T23:00:00.000Z")));
    expect((await pg.query('SELECT count(*)::int n FROM "InventorySnapshot"')).rows).toEqual([{n:1}]);
    expect((await pg.query('SELECT count(*)::int n FROM "PriceHistory"')).rows).toEqual([{n:1}]);
  });
  it("rejects malformed/duplicate YML and rolls back identity conflicts without partial activation", async () => {
    await expect(catalog(undefined,xml.replace('</offers>','<offer id="p1"><name>Duplicate</name></offer></offers>'))).rejects.toMatchObject({code:"INVALID_RESPONSE"});
    await expect(catalog(undefined,xml.replace('<price>100.1234</price>','<price>bad</price>'))).rejects.toMatchObject({code:"INVALID_RESPONSE"});
    await expect(catalog(undefined,xml.replace('</yml_catalog>',''))).rejects.toMatchObject({code:"INVALID_RESPONSE"});
    await expect(catalog(undefined,'<!DOCTYPE yml_catalog [<!ENTITY x "bad">]>'+xml)).rejects.toMatchObject({code:"INVALID_RESPONSE"});
    const bad = await catalog(); bad.products.push({...bad.products[0],externalId:"p2"}); bad.stock.push({...bad.stock[0],productId:"p2"});
    await expect(db.$transaction((tx)=>storeCatalog(tx,scope,bad))).rejects.toThrow("DUPLICATE_CATALOG_SKU");
    expect((await pg.query('SELECT count(*)::int n FROM "Sku"')).rows).toEqual([{n:1}]);
  });
});
let initialCatalog: CatalogSnapshot;
beforeAll(async()=>{ initialCatalog=await catalog(); });
describe("receipt provenance and cost", () => {
  it("deduplicates external documents/lines and excludes internal movements from cost and first receipt", async () => {
    for (const value of [receipt(), receipt(), receipt("2","transfer","1","2026-10-22"),receipt("3","write_off","2","2026-10-23"),receipt("4","inventory_adjustment","3","2026-10-24")]) await db.$transaction((tx)=>storeReceipt(tx,scope,value,policy));
    expect((await pg.query('SELECT count(*)::int n FROM "Receipt"')).rows).toEqual([{n:4}]);
    expect((await pg.query('SELECT count(*)::int n FROM "ReceiptLine"')).rows).toEqual([{n:4}]);
    await db.$transaction(async(tx)=>storeCatalog(tx,scope,await catalog("2026-10-25T00:00:00.000Z")));
    expect((await pg.query('SELECT "costPrice","costValue","costProvenance"->>\'type\' type FROM "InventorySnapshot"')).rows).toEqual([{costPrice:"40.0000",costValue:"100.0000",type:"receipt"}]);
    expect((await pg.query('SELECT "firstReceiptAt" FROM "Sku"')).rows[0]).toMatchObject({firstReceiptAt: new Date("2026-10-19T21:00:00Z")});
  });
  it("does not activate unverified posting and can revoke a previously posted receipt", async () => {
    const value=receipt("5","supplier_receipt","5","2026-10-23"); await db.$transaction((tx)=>storeReceipt(tx,scope,value,{}));
    expect((await pg.query('SELECT "postingVerifiedAt" FROM "Receipt" WHERE "externalId"=\'5\'')).rows).toEqual([{postingVerifiedAt:null}]);
    await db.$transaction((tx)=>storeReceipt(tx,scope,receipt(),{}));
    expect((await pg.query('SELECT "firstReceiptAt" FROM "Sku"')).rows).toEqual([{firstReceiptAt:null}]);
    await db.$transaction((tx)=>storeReceipt(tx,scope,receipt(),policy));
  });
  it("uses the latest verified receipt cost, and records only changed prices", async () => {
    await db.$transaction((tx)=>storeReceipt(tx,scope,receipt("6","supplier_receipt","50","2026-10-24"),policy));
    const first=await db.$transaction(async(tx)=>storeCatalog(tx,scope,await catalog("2026-10-25T01:00:00.000Z")));
    expect(first.prices).toBe(1);
    const unchanged=await db.$transaction(async(tx)=>storeCatalog(tx,scope,await catalog("2026-10-25T02:00:00.000Z")));
    expect(unchanged.prices).toBe(0);
    expect((await pg.query('SELECT "costPrice" FROM "InventorySnapshot"')).rows).toEqual([{costPrice:"50.0000"}]);
  });
  it("falls back to the latest verified sale costPrice without using YML vendorprice", async()=>{
    await pg.exec(`UPDATE "Receipt" SET "postingVerifiedAt"=NULL WHERE "tenantId"='a';
      INSERT INTO "OrderLine" (id,"tenantId","sourceId","importRunId","externalOrderId","externalLineId",kind,"skuId","sourceSku",quantity,"costAmount",currency,"sourceAmounts","sourceRecordKey","paidAt","observedAt","updatedAt")
      SELECT 'sale-cost','a','source-a','run-a','paid-order','line','SALE',id,'SKU1',2,90,'UAH','{"unitCost":"45"}','fixture','2026-10-24T12:00:00Z','2026-10-24T20:00:00Z',now() FROM "Sku" WHERE "tenantId"='a' AND sku='SKU1'`);
    await db.$transaction(async(tx)=>storeCatalog(tx,scope,await catalog("2026-10-25T03:00:00.000Z")));
    expect((await pg.query('SELECT "costPrice","costProvenance"->>\'type\' type FROM "InventorySnapshot"')).rows).toEqual([{costPrice:"45.0000",type:"sale"}]);
  });
  it("retains unknown quantity/price transitions and cannot overwrite them with older observations", async()=>{
    const unknown=await catalog("2026-10-25T04:00:00.000Z"); unknown.stock[0].onHand=null; unknown.products[0].retailPrice=null; unknown.products[0].oldPrice=null;
    await pg.exec(`UPDATE "OrderLine" SET "costAmount"=NULL WHERE id='sale-cost'`);
    await db.$transaction((tx)=>storeCatalog(tx,scope,unknown));
    const stale=await db.$transaction(async(tx)=>storeCatalog(tx,scope,await catalog("2026-10-25T03:30:00.000Z")));
    expect(stale.issues).toContain("STALE_CATALOG_OBSERVATION");
    expect((await pg.query('SELECT quantity,"qtyOnHand","costPrice","retailPrice","costValue","retailValue" FROM "InventorySnapshot"')).rows).toEqual([{quantity:null,qtyOnHand:null,costPrice:null,retailPrice:null,costValue:null,retailValue:null}]);
    expect((await pg.query('SELECT "costPrice","retailPrice" FROM "PriceHistory" ORDER BY "observedAt" DESC LIMIT 1')).rows).toEqual([{costPrice:null,retailPrice:null}]);
  });
  it("enforces tenant/source provenance", async()=>{
    await expect(db.$transaction((tx)=>storeReceipt(tx,{...scope,tenantId:"b"},receipt("foreign"),policy))).rejects.toMatchObject({code:"23503"});
  });
});
describe("shared queue resources",()=>{
  it("keeps inventory jobs separate from order workers and commits receipt cursors only with a complete catalog",async()=>{
    const id=await enqueueInventoryImport("a",db);
    expect(await claimOrderJob(db,"a")).toBeNull();
    expect((await enqueueOrderImport("a","BACKFILL",{},db)).state).toBe("PENDING");
    const connector=new SalesDriveConnector(credentials,async(url)=>url.pathname.includes('export.yml')?new Response(xml):Response.json({data:[],pagination:{pageCount:1}}));
    const load=async()=>({sourceId:"source-a",revision:1,timezone:"Europe/Kyiv",connector});
    await processInventoryJob("a",db,load);
    expect((await pg.query('SELECT * FROM "SyncCursor" WHERE resource=\'receipts\'')).rows).toEqual([]);
    await processInventoryJob("a",db,load);
    expect((await getInventoryProgress("a",db)).job).toMatchObject({id,state:"COMPLETE"});
    expect((await getInventoryProgress("b",db)).job).toBeNull();
    expect((await pg.query('SELECT count(*)::int n FROM "SyncCursor" WHERE resource=\'receipts\'')).rows).toEqual([{n:1}]);
  });
});

describe("catalogue volume and rollback",()=>{
  it("atomically activates 10,000 catalogue items and leaves no partial snapshot on a late transaction failure",async()=>{
    await pg.exec(`INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES ('run-b','b','source-b','MANUAL','SUCCESS','volume',now(),now())`);
    const source={tenantId:"b",sourceId:"source-b",importRunId:"run-b",timezone:"Europe/Kyiv"};
    const template=await catalog();
    const snapshot={...template,products:Array.from({length:10000},(_,i)=>({...template.products[0],externalId:String(i),sku:`VOL${i}`})),stock:Array.from({length:10000},(_,i)=>({...template.stock[0],externalId:String(i),productId:String(i)}))};
    const result=await db.$transaction((tx)=>storeCatalog(tx,source,snapshot));
    expect(result).toMatchObject({products:10000,snapshots:10000,prices:10000});
    expect((await pg.query('SELECT count(*)::int n FROM "InventorySnapshot" WHERE "tenantId"=\'b\'')).rows).toEqual([{n:10000}]);
    const changed={...template,observedAt:"2026-10-26T00:00:00Z",products:template.products.map((p)=>({...p,observedAt:"2026-10-26T00:00:00Z",externalId:"new",sku:"NEW"})),stock:template.stock.map((p)=>({...p,observedAt:"2026-10-26T00:00:00Z",productId:"new",externalId:"new"}))};
    await expect(db.$transaction(async(tx)=>{await storeCatalog(tx,source,changed);throw new Error('late failure');})).rejects.toThrow('late failure');
    expect((await pg.query('SELECT count(*)::int n FROM "Sku" WHERE "tenantId"=\'b\' AND sku=\'NEW\'')).rows).toEqual([{n:0}]);
    expect((await pg.query('SELECT count(*)::int n FROM "InventorySnapshot" WHERE "tenantId"=\'b\'')).rows).toEqual([{n:10000}]);
  },60_000);
});

describe("inventory recovery and policy changes",()=>{
  it("preserves the active catalogue on malformed YML and resumes the same checkpoint",async()=>{
    await pg.exec(`INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('c','C','c',now());
      INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('source-c','c','SALESDRIVE','third.salesdrive.me',now());
      INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId","accountHost","encryptedConfig","hasYmlUrl","updatedAt") VALUES ('conn-c','c','source-c','third.salesdrive.me','encrypted',true,now());`);
    let malformed=false;
    const load=async()=>({sourceId:"source-c",revision:1,timezone:"Europe/Kyiv",connector:new SalesDriveConnector(credentials,async()=>new Response(malformed?'<broken>':xml))});
    const first=await enqueueInventoryImport("c",db); await processInventoryJob("c",db,load);
    const before=(await pg.query('SELECT "activeImportRunId" FROM "DataSource" WHERE id=\'source-c\'')).rows;
    expect(before[0]).toMatchObject({activeImportRunId:expect.any(String)});
    const second=await enqueueInventoryImport("c",db); expect(second).not.toBe(first);
    malformed=true; await processInventoryJob("c",db,load);
    expect((await getInventoryProgress("c",db)).job).toMatchObject({id:second,state:"RETRY",errorCode:"INVALID_RESPONSE"});
    expect((await pg.query('SELECT "activeImportRunId" FROM "DataSource" WHERE id=\'source-c\'')).rows).toEqual(before);
    await pg.query('UPDATE "ConnectorSyncJob" SET "availableAt"=now() WHERE id=$1',[second]); malformed=false;
    await processInventoryJob("c",db,load);
    expect((await getInventoryProgress("c",db)).job).toMatchObject({id:second,state:"COMPLETE"});
    expect((await pg.query('SELECT count(*)::int n FROM "InventorySnapshot" WHERE "tenantId"=\'c\'')).rows).toEqual([{n:1}]);
    const orderJob=await enqueueOrderImport("c","BACKFILL",{},db);
    expect(await processInventoryJob("c",db,load)).toEqual({processed:false});
    expect(orderJob.resource).toBe('orders');
  });
  it("replays receipts after an approved mapping change instead of skipping old unverified documents",async()=>{
    await pg.exec(`INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('approver','fixture@example.test','test','Owner','ADMIN','a',now());
      INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedById","approvedAt","approvalReference") VALUES ('receipt-policy','a','SOURCE_MAPPING','salesdrive:source-a',1,'{"receipts":{"postedStatuses":["2"],"suppliers":{"42":"supplier-a"},"productIdField":"parameter","currency":"UAH","unitCostVerified":true}}',true,'approver',now(),'fixture approval');`);
    const id=await enqueueInventoryImport('a',db);
    const row=(await pg.query('SELECT checkpoint FROM "ConnectorSyncJob" WHERE id=$1',[id])).rows[0] as {checkpoint:{from?:string;policyHash:string}};
    expect(row.checkpoint.from).toBeUndefined(); expect(row.checkpoint.policyHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("retains negative observed stock as an explicit exception without creating negative inventory values",async()=>{
    const latest=(await pg.query<{observedAt:Date|null}>(`SELECT max("observedAt") AS "observedAt" FROM "DataSourceRecord" WHERE "tenantId"='a' AND "sourceId"='source-a' AND resource='catalog-yml'`)).rows[0].observedAt;
    const observedAt=new Date(Math.max(Date.parse('2026-10-26T04:00:00.000Z'),(latest?.getTime()??0)+1000)).toISOString();
    const snapshot=await catalog(observedAt,xml.replace('<quantity_in_stock>2.5</quantity_in_stock>','<quantity_in_stock>-2.5</quantity_in_stock>'));
    const result=await db.$transaction((tx)=>storeCatalog(tx,scope,snapshot));
    expect(result.issues).toContain('NEGATIVE_SOURCE_STOCK');
    expect((await pg.query('SELECT quantity,"costValue","retailValue",diagnostics->>\'negativeStock\' negative FROM "InventorySnapshot" WHERE "tenantId"=\'a\' ORDER BY "snapshotDate" DESC LIMIT 1')).rows).toEqual([{quantity:'-2.5000',costValue:null,retailValue:null,negative:'true'}]);
  });
});

describe("invalid receipt quarantine", () => {
  it("retains invalid raw documents without replacing current receipts or partially importing lines", async () => {
    const base = receipt("1");
    const before = (await pg.query('SELECT * FROM "ReceiptLine" WHERE "receiptId" IN (SELECT id FROM "Receipt" WHERE "externalId"=\'1\' AND "tenantId"=\'a\')')).rows;
    const invalid = [
      { quantity: null }, { quantity: "invalid" }, { quantity: "100000000000000" }, { quantity: "1.00001" },
      { unitCost: "invalid" }, { unitCost: "-1" }, { unitCost: "100000000000000" }, { unitCost: "1.00001" },
    ];
    for (const [index, fields] of invalid.entries()) {
      const value = { ...base, externalId: `invalid-${index}`, lines: [base.lines[0], { ...base.lines[0], ...fields }], raw: { id: `invalid-${index}`, fields } };
      expect(await db.$transaction((tx) => storeReceipt(tx, scope, value, policy))).toEqual({ imported: 0, issues: ["INVALID_RECEIPT_LINE"] });
    }
    const duplicate = { ...base, lines: [base.lines[0], base.lines[0]].map((line) => ({ ...line, externalLineId: "same" })), raw: { id: "1", duplicate: true }, updatedAt: "2026-10-27 12:00:00" };
    expect(await db.$transaction((tx) => storeReceipt(tx, scope, duplicate, policy))).toEqual({ imported: 0, issues: ["INVALID_RECEIPT_LINE"] });
    expect((await pg.query('SELECT * FROM "ReceiptLine" WHERE "receiptId" IN (SELECT id FROM "Receipt" WHERE "externalId"=\'1\' AND "tenantId"=\'a\')')).rows).toEqual(before);
    expect((await pg.query('SELECT count(*)::int n FROM "Receipt" WHERE "externalId" LIKE \'invalid-%\'')).rows).toEqual([{ n: 0 }]);
    expect((await pg.query('SELECT count(*)::int n FROM "DataSourceRecord" WHERE resource=\'receipts\' AND (payload ? \'fields\' OR payload ? \'duplicate\')')).rows).toEqual([{ n: 9 }]);
  });

  it("completes the catalogue after a page containing both invalid and valid receipts", async () => {
    await pg.exec(`INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('d','D','d',now());
      INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('source-d','d','SALESDRIVE','fourth.salesdrive.me',now());
      INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId","accountHost","encryptedConfig","hasYmlUrl","hasReceiptsKey","updatedAt") VALUES ('conn-d','d','source-d','fourth.salesdrive.me','encrypted',true,true,now());`);
    const connector = new SalesDriveConnector(credentials, async (url) => url.pathname.includes('export.yml') ? new Response(xml) : Response.json({
      data: [null, 2].map((count, i) => ({ id: i + 1, date: "2026-10-20", updatedAt: "2026-10-24 12:00:00", type: 1, status: { id: 2 }, counterparty: { id: 42 }, documentItems: [{ count, price: 40, product: { id: 1, parameter: "p1", sku: "SKU1" } }] })), pagination: { pageCount: 1 },
    }));
    const load = async () => ({ sourceId: "source-d", revision: 1, timezone: "Europe/Kyiv", connector });
    await enqueueInventoryImport("d", db);
    await processInventoryJob("d", db, load);
    expect((await getInventoryProgress("d", db)).job).toMatchObject({ state: "PENDING", stats: { receipts: 1 }, issues: expect.arrayContaining(["INVALID_RECEIPT_LINE"]) });
    await processInventoryJob("d", db, load);
    expect((await getInventoryProgress("d", db)).job).toMatchObject({ state: "COMPLETE", stats: { snapshots: 1 } });
    expect((await pg.query('SELECT count(*)::int n FROM "DataSourceRecord" WHERE "tenantId"=\'d\' AND resource=\'receipts\'')).rows).toEqual([{ n: 2 }]);
    expect((await pg.query('SELECT count(*)::int n FROM "Receipt" WHERE "tenantId"=\'d\'')).rows).toEqual([{ n: 1 }]);
  });
});
