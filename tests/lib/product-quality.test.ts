import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {Prisma} from '@prisma/client';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));vi.mock('@/lib/prisma',()=>({prisma:{}}));
import type {SqlClient,SqlDatabase} from '@/lib/connectors/database';
import type {CatalogSnapshot,OrderDto} from '@/lib/connectors/contract';
import {storeCatalog} from '@/lib/connectors/catalog-storage';
import {storeOrder} from '@/lib/connectors/order-storage';
import {saveBrandAlias,saveProductKind} from '@/lib/product-normalization';
import {getProductQuality} from '@/lib/product-quality';
let pg:PGlite,db:SqlDatabase;
function bridge(client:Pick<PGlite,'query'>):SqlClient{return{$queryRaw:async<T,>(q:Prisma.Sql)=>(await client.query(q.text,q.values)).rows as T,$executeRaw:async q=>(await client.query(q.text,q.values)).affectedRows??0};}
const scope={tenantId:'a',sourceId:'a',importRunId:'run-a',timezone:'Europe/Kyiv'};
function catalog(brands:Array<string|null>,observedAt='2026-10-24T12:00:00Z'):CatalogSnapshot{return{observedAt,rawResponse:'synthetic YML '+JSON.stringify(brands),products:brands.map((brand,i)=>({externalId:String(i),observedAt,updatedAt:null,sku:'SKU'+i,name:'Product '+i,barcode:null,brand,categoryId:null,retailPrice:i===0?'0':'100',costPrice:null,currency:'UAH'})),stock:brands.map((_,i)=>({externalId:String(i),productId:String(i),observedAt,updatedAt:null,onHand:'2',inTransit:null}))};}
function order(id:string,sku:string,kind='5',quantity='1'):OrderDto{return{externalId:id,observedAt:'2026-10-24T13:00:00Z',updatedAt:'2026-10-24T12:00:00Z',orderedAt:'2026-10-20',paidAt:'2026-10-21',returnedAt:kind==='7'?'2026-10-23':undefined,statusId:kind,channelId:'1',raw:{id,sku,kind,quantity},lines:[{externalLineId:'1',productId:null,sku,quantity,unitPrice:'100',discount:'0',discountUnit:'amount',costPrice:'40',commission:null,commissionUnit:'unknown'}]};}
const policy={statuses:{'5':'SALE' as const,'7':'RETURN' as const},amounts:{price:'gross_unit' as const,absoluteDiscount:'line' as const,currency:'UAH',cost:'unit' as const}};
beforeAll(async()=>{pg=new PGlite();const root=new URL('../../prisma/migrations/',import.meta.url);for(const name of(await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name).sort()){
 if(name==='20261024030000_product_normalization')await pg.exec(`INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('legacy','Legacy','legacy',now()); INSERT INTO "Brand" (id,"tenantId",name,currency) VALUES ('legacy-1','legacy','Seiko','UAH'),('legacy-2','legacy',' SEIKO ','EUR')`);
 await pg.exec(await readFile(new URL(`${name}/migration.sql`,root),'utf8'));
}db={...bridge(pg),$transaction:async cb=>pg.transaction(tx=>cb(bridge(tx)))};
 await pg.exec(`INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','A','a',now()),('b','B','b',now());
 INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('owner-a','a@example.test','test','Owner','ADMIN','a',now()),('owner-b','b@example.test','test','Other','ADMIN','b',now());
 INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('a','a','SALESDRIVE','demo.salesdrive.me',now()),('b','b','SALESDRIVE','other.salesdrive.me',now());
 INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId","accountHost","encryptedConfig","hasYmlUrl","updatedAt") VALUES ('a','a','a','demo.salesdrive.me','test',true,now()),('b','b','b','other.salesdrive.me','test',true,now());
 INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES ('run-a','a','a','MANUAL','SUCCESS','fixture',now(),now());`);
},30000);afterAll(async()=>pg?.close());
describe('tenant product normalization and diagnostics',()=>{
 it('preserves ambiguous existing brands and their different financial terms during migration',async()=>{
  expect((await pg.query('SELECT id,currency,"normalizationKey" FROM "Brand" WHERE "tenantId"=\'legacy\' ORDER BY id')).rows).toEqual([{id:'legacy-1',currency:'UAH',normalizationKey:null},{id:'legacy-2',currency:'EUR',normalizationKey:null}]);
 });
 it('deduplicates brand spelling variants and retains SKU-specific source lineage',async()=>{
  await db.$transaction(tx=>storeCatalog(tx,scope,catalog(['SEIKO',' Seiko ','   ','Gift provider','Repair','Other'])));
  expect((await pg.query('SELECT name,count(*)::int n FROM "Brand" WHERE "tenantId"=\'a\' GROUP BY name ORDER BY name')).rows).toEqual([{name:'GIFT PROVIDER',n:1},{name:'OTHER',n:1},{name:'REPAIR',n:1},{name:'SEIKO',n:1}]);
  const quality=await getProductQuality('a',{},db);expect(quality.rows).toHaveLength(6);expect(quality.summary).toContainEqual(expect.objectContaining({code:'ZERO_PRICE_WITH_STOCK',skuCount:1}));expect(quality.summary).toContainEqual(expect.objectContaining({code:'MISSING_BRAND',skuCount:1}));
  expect((await pg.query('SELECT context FROM "ImportIssue" WHERE code=\'ZERO_PRICE_WITH_STOCK\'')).rows[0]).toMatchObject({context:{sku:'SKU0',skuId:expect.any(String),sourceRecordKey:expect.any(String)}});
 });
 it('supports audited alias updates without merging brands or losing raw spellings',async()=>{
  const [seiko]=(await pg.query('SELECT id FROM "Brand" WHERE name=\'SEIKO\'')).rows as Array<{id:string}>;
  await saveBrandAlias('a','owner-a',' Other ',seiko.id,db);
  await db.$transaction(tx=>storeCatalog(tx,scope,catalog(['SEIKO','Seiko',null,'Gift provider','Repair','Other'],'2026-10-24T14:00:00Z')));
  expect((await pg.query('SELECT s."brandId",s."catalogAttributes"->>\'vendor\' raw FROM "Sku" s WHERE s.sku=\'SKU5\'')).rows).toEqual([{brandId:seiko.id,raw:'Other'}]);
  expect((await pg.query('SELECT count(*)::int n FROM "Brand" WHERE name=\'OTHER\'')).rows).toEqual([{n:1}]);
  expect((await pg.query('SELECT action FROM "MerchandisingAction"')).rows).toContainEqual({action:'BRAND_ALIAS_CHANGED'});
  await expect(saveBrandAlias('b','owner-b','Other',seiko.id,db)).rejects.toThrow('BRAND_NOT_FOUND');
 });
 it('keeps services and gift cards out of merchandise stock and separates their signed movements',async()=>{
  const rows=(await pg.query('SELECT id,sku FROM "Sku" WHERE "tenantId"=\'a\'')).rows as Array<{id:string;sku:string}>;
  for(const row of rows)await saveProductKind('a','owner-a',row.id,row.sku==='SKU3'?'GIFT_CARD':row.sku==='SKU4'?'SERVICE':'MERCHANDISE',db);
  for(const value of [order('goods','SKU1'),order('gift','SKU3'),order('service','SKU4'),order('return','SKU1','7'),order('correction','unmatched','5','-2')])await db.$transaction(tx=>storeOrder(tx,scope,value,policy));
  const quality=await getProductQuality('a',{},db);
  expect(quality.components).toEqual(expect.arrayContaining([{component:'GIFT_CARD',currency:'UAH',lineCount:1,revenue:'100.0000',cost:'40.0000',missingAmountCount:0},{component:'SERVICE',currency:'UAH',lineCount:1,revenue:'100.0000',cost:'40.0000',missingAmountCount:0},{component:'RETURNS_CORRECTIONS',currency:'UAH',lineCount:2,revenue:'-300.0000',cost:'-120.0000',missingAmountCount:0}]));
  expect(quality.stock.some(s=>s.brandKey==='GIFT PROVIDER'||s.brandKey==='REPAIR')).toBe(false);
  expect(quality.stock.some(s=>s.brandKey==='UNBRANDED')).toBe(true);
  expect(quality.rows.find(r=>r.sku==='SKU1')?.ageReference.basis).toBe('FIRST_SALE_PROXY');
  expect((await pg.query('SELECT "firstReceiptAt" FROM "Sku" WHERE sku=\'SKU1\'')).rows).toEqual([{firstReceiptAt:null}]);
  expect((await getProductQuality('b',{},db)).rows).toHaveLength(0);
  const ordinary=rows.find(row=>row.sku==='SKU1')!;
  await expect(saveProductKind('a','owner-b',ordinary.id,'SERVICE',db)).rejects.toMatchObject({code:'23503'});
  expect((await pg.query('SELECT "productKind" FROM "Sku" WHERE id=$1',[ordinary.id])).rows).toEqual([{productKind:'MERCHANDISE'}]);

 });
 it('preserves explicit product types on reimport and paginates/filter diagnostics by tenant',async()=>{
  await db.$transaction(tx=>storeCatalog(tx,scope,catalog(['SEIKO','Seiko',null,'Gift provider','Repair','Other'],'2026-10-24T15:00:00Z')));
  const quality=await getProductQuality('a',{q:'SKU3'},db);expect(quality.rows).toHaveLength(1);expect(quality.rows[0]).toMatchObject({productKind:'GIFT_CARD',eligibility:{stock:false,merchandiseRevenue:false}});
  expect((await getProductQuality('a',{page:2},db)).rows).toHaveLength(0);
  const [sku]=(await pg.query('SELECT id FROM "Sku" LIMIT 1')).rows as Array<{id:string}>;await expect(saveProductKind('b','owner-b',sku.id,'SERVICE',db)).rejects.toThrow('SKU_NOT_FOUND');
 });
});
