import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/prisma",()=>({prisma:{}}));
import type { SqlClient, SqlDatabase } from "@/lib/connectors/database";
import { requestSyncCycle, dispatchSyncCycle, getSyncProgress, resumeSyncCycle, resumeSyncBackfill } from "@/lib/connectors/sync-cycles";
import { processSalesDriveSync, scheduleSalesDriveSyncs } from "@/lib/connectors/sync-worker";
import { enqueueOrderImport } from "@/lib/connectors/order-jobs";
import { claimConnectorJob } from "@/lib/connectors/jobs";
import { reserveRequest } from "@/lib/connectors/budget";
import { SalesDriveConnector } from "@/lib/connectors/salesdrive";
let pg:PGlite,db:SqlDatabase;
function bridge(client:Pick<PGlite,'query'>):SqlClient {return {$queryRaw:async<T,>(q:Prisma.Sql)=>(await client.query(q.text,q.values)).rows as T,$executeRaw:async(q)=>(await client.query(q.text,q.values)).affectedRows??0};}
beforeAll(async()=>{
 pg=new PGlite(); const root=new URL('../../prisma/migrations/',import.meta.url);
 for(const name of (await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name).sort())await pg.exec(await readFile(new URL(`${name}/migration.sql`,root),'utf8'));
 db={...bridge(pg),$transaction:async(cb)=>pg.transaction(async tx=>cb(bridge(tx)))};
},30_000);
afterAll(async()=>pg?.close());
async function tenant(id:string){await pg.query('INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ($1,$1,$1,now())',[id]);await pg.query('INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ($1,$1,\'SALESDRIVE\',$1,now())',[id]);await pg.query('INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId","accountHost","encryptedConfig","hasYmlUrl","updatedAt") VALUES ($1,$1,$1,\'demo.salesdrive.me\',\'synthetic\',true,now())',[id]);}
const xml='<yml_catalog><shop><offers><offer id="1"><vendorCode>A1</vendorCode><name>Item</name><price>100</price><currencyId>UAH</currencyId><quantity_in_stock>2</quantity_in_stock></offer></offers></shop></yml_catalog>';
function runtime(id:string){return async()=>({sourceId:id,revision:1,timezone:'Europe/Kyiv',connector:new SalesDriveConnector({accountHost:'demo.salesdrive.me',ordersApiKey:'synthetic',receiptsApiKey:null,ymlUrl:'https://demo.salesdrive.me/export/yml/export.yml?publicKey=synthetic'},async(url)=>url.pathname.includes('export.yml')?new Response(xml):Response.json({data:[],pagination:{pageCount:1}}))});}
describe('durable sync orchestration',()=>{
 it('completes imports and drains the new phased engine without activating legacy formulas',async()=>{
  await tenant('manual');const id=await requestSyncCycle('manual','both',db);
  expect(await requestSyncCycle('manual','both',db)).toBe(id);
  expect(await dispatchSyncCycle(db,'manual')).toBe(true);
  const jobs=(await pg.query('SELECT id,"importRunId",resource FROM "ConnectorSyncJob" WHERE "tenantId"=\'manual\'')).rows;
  expect(jobs).toHaveLength(2);
  for(let i=0;i<4;i++)await processSalesDriveSync('manual',db,runtime('manual'));
  const progress=await getSyncProgress('manual',db);
  expect(progress.cycle).toMatchObject({id,state:'COMPLETE',completedAt:expect.any(Date)});
  expect(progress.resources).toHaveLength(2);expect(progress.resources.every(r=>r.lastSuccess instanceof Date)).toBe(true);
  expect(progress.calculation).toMatchObject({state:'WAITING_ENGINE'});
  expect((await pg.query('SELECT count(*)::int n FROM "ConnectorRecalculation" WHERE "tenantId"=\'manual\'')).rows).toEqual([{n:2}]);
  expect((await pg.query('SELECT count(*)::int n FROM "ReportCalculationRun"')).rows).toEqual([{n:0}]);
  for(let i=0;i<4;i++)expect(await processSalesDriveSync('manual',db,runtime('manual'))).toMatchObject({processed:true,published:true});
  expect((await getSyncProgress('manual',db)).calculation).toMatchObject({state:'COMPLETE'});
  expect((await pg.query('SELECT "inputProvenance" FROM "ConnectorRecalculation" WHERE "tenantId"=\'manual\'')).rows).toEqual(expect.arrayContaining([expect.objectContaining({inputProvenance:expect.objectContaining({dailyCalculationId:expect.any(String),salesCalculationId:expect.any(String),engine:'salesdrive-v2'})})]));
  expect(await processSalesDriveSync('manual',db,runtime('manual'))).toEqual({processed:false});
  expect((await pg.query('SELECT count(*)::int n FROM "ConnectorSyncJob" WHERE "tenantId"=\'manual\'')).rows).toEqual([{n:2}]);
 });
 it('deduplicates automatic slots, rotates scheduler batches and preserves tenant scope',async()=>{
  await tenant('scheduled');const now=new Date('2026-10-24T00:00:00Z');
  await scheduleSalesDriveSyncs(db,now);await scheduleSalesDriveSyncs(db,now);
  expect((await pg.query('SELECT resource,count(*)::int n FROM "ConnectorSyncCycle" WHERE "tenantId"=\'scheduled\' GROUP BY resource ORDER BY resource')).rows).toEqual([{resource:'inventory',n:1},{resource:'orders',n:1}]);
  await scheduleSalesDriveSyncs(db,new Date(now.getTime()+7_200_000));
  expect((await pg.query('SELECT count(*)::int n FROM "ConnectorSyncCycle" WHERE "tenantId"=\'scheduled\' AND resource=\'orders\'')).rows).toEqual([{n:2}]);
  expect((await getSyncProgress('unknown',db)).cycle).toBeNull();
 });
 it('runs routine work before backfill, permits live sync before baseline and serializes leased writers',async()=>{
  await tenant('priority');const backfill=await enqueueOrderImport('priority','BACKFILL',{},db);
  const live=await enqueueOrderImport('priority','INCREMENTAL',{},db,new Date());
  expect(new Date(live.checkpoint.to).getTime()-new Date(live.checkpoint.from).getTime()).toBe(7_200_000);
  const claimed=await claimConnectorJob('orders',db,'priority');expect(claimed?.id).toBe(live.id);
  expect(await claimConnectorJob(null,db,'priority')).toBeNull();
  await pg.query('UPDATE "ConnectorSyncJob" SET "leaseExpiresAt"=now()-interval \'1 second\' WHERE id=$1',[live.id]);
  expect((await claimConnectorJob(null,db,'priority'))?.id).toBe(live.id);
  await pg.query('UPDATE "ConnectorSyncJob" SET state=\'COMPLETE\' WHERE id=$1',[live.id]);
  expect((await claimConnectorJob(null,db,'priority'))?.id).toBe(backfill.id);
  await pg.query('UPDATE "ConnectorSyncJob" SET state=\'FAILED\' WHERE id=$1',[backfill.id]);
  const webhook=await enqueueOrderImport('priority','WEBHOOK',{orderId:'123',eventKey:'a'.repeat(64)},db);
  expect((await enqueueOrderImport('priority','WEBHOOK',{orderId:'123',eventKey:'a'.repeat(64)},db)).id).toBe(webhook.id);
  expect((await claimConnectorJob(null,db,'priority'))?.id).toBe(webhook.id);
  expect((await getSyncProgress('priority',db)).backfill).toMatchObject({id:backfill.id,state:'FAILED'});
  expect(await resumeSyncBackfill('priority',db)).toBe(1);
  expect((await getSyncProgress('priority',db)).backfill).toMatchObject({id:backfill.id,state:'PENDING'});
 });
 it('keeps dispatch retries durable and does not let a bad source starve other cycles',async()=>{
  await tenant('bad');await tenant('good');
  await requestSyncCycle('bad','orders',db);await requestSyncCycle('good','orders',db);
  await pg.exec(`INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('bad-owner','bad@example.test','test','Owner','ADMIN','bad',now())`);
  await pg.query('INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedAt","approvalReference","approvedById") VALUES (\'bad-config\',\'bad\',\'SOURCE_MAPPING\',\'salesdrive:bad\',1,\'{"statuses":false}\',true,now(),\'test\',\'bad-owner\')');
  expect(await dispatchSyncCycle(db,'bad')).toBe(false);
  expect((await getSyncProgress('bad',db)).cycle).toMatchObject({state:'QUEUED',errorCode:'INVALID_SOURCE_MAPPING'});
  expect(await dispatchSyncCycle(db,'good')).toBe(true);
  expect((await pg.query('SELECT attempts,"availableAt">now() delayed FROM "ConnectorSyncCycle" WHERE "tenantId"=\'bad\'')).rows).toEqual([{attempts:1,delayed:true}]);
 });
 it('resumes only failed jobs of the displayed manual cycle and accepts a new refresh after completion',async()=>{
  await tenant('recovery'); const id=await requestSyncCycle('recovery','both',db); await dispatchSyncCycle(db,'recovery');
  await pg.exec(`UPDATE "ConnectorSyncJob" SET state='PAUSED',"errorCode"='AUTH_FAILED' WHERE "tenantId"='recovery'`);
  expect((await getSyncProgress('recovery',db)).cycle).toMatchObject({id,state:'ACTION_REQUIRED'});
  expect(await resumeSyncCycle('unknown',db)).toBe(0);
  expect(await resumeSyncCycle('recovery',db)).toBe(2);
  expect((await getSyncProgress('recovery',db)).cycle).toMatchObject({id,state:'RUNNING'});
  for(let i=0;i<4;i++)await processSalesDriveSync('recovery',db,runtime('recovery'));
  // Starting again must work even before a GET has reconciled completedAt.
  expect(await requestSyncCycle('recovery','both',db)).not.toBe(id);
 });
 it('rejects cross-tenant cycle and recalculation references at the database boundary',async()=>{
  await expect(pg.exec(`INSERT INTO "ConnectorSyncCycle" (id,"tenantId","sourceId","requestKey",reason,resource) VALUES ('foreign','manual','priority','foreign','MANUAL','orders')`)).rejects.toMatchObject({code:'23503'});
  await expect(pg.exec(`UPDATE "ConnectorSyncCycle" SET "ordersJobId"=(SELECT id FROM "ConnectorSyncJob" WHERE "tenantId"='priority' LIMIT 1) WHERE "tenantId"='manual'`)).rejects.toMatchObject({code:'23503'});
  await expect(pg.exec(`INSERT INTO "ConnectorRecalculation" ("importRunId","tenantId","sourceId","inputProvenance") SELECT "importRunId",'manual','manual','{}' FROM "ConnectorSyncJob" WHERE "tenantId"='priority' LIMIT 1`)).rejects.toMatchObject({code:'23503'});
 });
 it('reserves account request headroom for routine sync without bypassing global limits',async()=>{
  const now=new Date('2026-10-24T12:00:00Z');
  await pg.exec(`INSERT INTO "ConnectorRequestBudget" ("accountKey") VALUES ('headroom');
    INSERT INTO "ConnectorRequestAttempt" (id,"accountKey",at) SELECT 'headroom-'||n,'headroom','2026-10-24T11:30:00Z'::timestamptz FROM generate_series(1,80) n;`);
  expect(await reserveRequest(db,'headroom',now,true)).toBeInstanceOf(Date);
  expect(await reserveRequest(db,'headroom',now)).toBeNull();
  await pg.exec(`INSERT INTO "ConnectorRequestAttempt" (id,"accountKey",at) SELECT 'extra-'||n,'headroom','2026-10-24T11:30:00Z'::timestamptz FROM generate_series(1,19) n;`);
  expect(await reserveRequest(db,'headroom',now)).toBeInstanceOf(Date);
 });
});
