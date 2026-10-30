import {beforeAll,afterAll,beforeEach,it,expect,vi} from "vitest";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
import {createScreenDb,screenSelection} from "../helpers/screen-db";
import {readSelectedSource,listConnectorSources,selectConnectorSource,assertReportingSourceReady,assertSelectedSource} from "@/lib/connectors/source";
import {readNavigationOptions} from "@/lib/merchandising-navigation-store";
import {getSalesReport} from "@/lib/sales-report";
import {calculateSkuDaily} from "@/lib/sku-daily-store";
let f:Awaited<ReturnType<typeof createScreenDb>>;
beforeAll(async()=>{
 f=await createScreenDb();
 await f.pg.exec(`INSERT INTO "DataSource" (id,"tenantId",kind,"driveFileId","updatedAt",name) VALUES ('sheet','a','GOOGLE_SHEETS','file-a',now(),'Zavod'),('foreign-sheet','b','GOOGLE_SHEETS','file-b',now(),'Other client');INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('analyst','analyst@source.test','test','Analyst','ANALYST','a',now());UPDATE "ConnectorConnection" SET "lastCheck"='{"ok":true}' WHERE id='connection';`);
},30000);
afterAll(async()=>f?.pg.close());
beforeEach(async()=>{await f.pg.exec(`DELETE FROM "ConnectorSelection";DELETE FROM "MerchandisingAction" WHERE action='SOURCE_SELECTED';DELETE FROM "MerchandisingConfig" WHERE key LIKE 'sheets:%';UPDATE "DataSource" SET "activeImportRunId"=NULL WHERE id='sheet';DELETE FROM "DataImportRun" WHERE "sourceId"='sheet';`);});
async function approveMapping(){
 await f.pg.exec(`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedById","approvedAt","approvalReference") VALUES ('sheets-mapping','a','SOURCE_MAPPING','sheets:sheet',1,'{"sheets":{"version":1,"fileId":"file-a"}}',true,'owner',now(),'synthetic owner mapping approval');`);
}
it("lists the existing tenant Sheets source without creating connections or changing the SalesDrive default",async()=>{
 const state=await listConnectorSources("a",f.db);expect(state.sourceId).toBe("source");
 expect(state.connections.find(c=>c.provider==="sheets")).toMatchObject({sourceId:"sheet",accountHost:"Zavod",readiness:"MAPPING_REQUIRED",selectable:false,lastCheck:null});
 expect(state.connections.some(c=>c.sourceId==="foreign-sheet")).toBe(false);
 expect((await f.pg.query(`SELECT count(*)::int n FROM "ConnectorConnection"`)).rows).toEqual([{n:1}]);
 expect((await f.pg.query(`SELECT count(*)::int n FROM "ConnectorSelection"`)).rows).toEqual([{n:0}]);
});
it("rejects selection until mapping is approved for that exact file and tenant",async()=>{
 await expect(selectConnectorSource("a","owner","sheet",0,f.db)).rejects.toMatchObject({code:"SHEETS_MAPPING_REQUIRED"});
 await approveMapping();await f.pg.exec(`UPDATE "MerchandisingConfig" SET "isActive"=false,"approvedAt"=NULL,"approvedById"=NULL,"approvalReference"=NULL WHERE id='sheets-mapping'`);
 await expect(selectConnectorSource("a","owner","sheet",0,f.db)).rejects.toMatchObject({code:"SHEETS_MAPPING_REQUIRED"});
 await f.pg.exec(`UPDATE "MerchandisingConfig" SET "isActive"=true,"approvedAt"=now(),"approvedById"='owner',"approvalReference"='synthetic approval',values='{"sheets":{"version":1,"fileId":"wrong-file"}}' WHERE id='sheets-mapping'`);
 await expect(selectConnectorSource("a","owner","sheet",0,f.db)).rejects.toMatchObject({code:"SHEETS_MAPPING_REQUIRED"});
});
it("requires actual ADMIN membership and tenant ownership even when invoked outside the API",async()=>{
 await approveMapping();
 await expect(selectConnectorSource("a","analyst","sheet",0,f.db)).rejects.toMatchObject({code:"SOURCE_SELECTION_FORBIDDEN",status:403});
 await expect(selectConnectorSource("a","missing","sheet",0,f.db)).rejects.toMatchObject({code:"SOURCE_SELECTION_FORBIDDEN"});
 await expect(selectConnectorSource("a","owner","foreign-sheet",0,f.db)).rejects.toMatchObject({status:404});
});
it("uses explicit optimistic selection and audits switching away and back without importing",async()=>{
 await approveMapping();expect(await selectConnectorSource("a","owner","sheet",0,f.db)).toEqual({sourceId:"sheet",revision:1});
 expect(await readSelectedSource("a",f.db)).toMatchObject({id:"sheet",provider:"sheets",revision:1});
 expect(await selectConnectorSource("a","owner","sheet",1,f.db)).toEqual({sourceId:"sheet",revision:1});
 await expect(selectConnectorSource("a","owner","source",0,f.db)).rejects.toMatchObject({code:"SOURCE_SELECTION_CHANGED"});
 await expect(assertSelectedSource("a","source",0,f.db)).rejects.toMatchObject({code:"CONNECTOR_SOURCE_CHANGED"});
 await selectConnectorSource("a","owner","source",1,f.db);
 expect(await readSelectedSource("a",f.db)).toMatchObject({id:"source",provider:"salesdrive",revision:2});
 expect((await f.pg.query(`SELECT count(*)::int n FROM "DataImportRun" WHERE "sourceId"='sheet'`)).rows).toEqual([{n:0}]);
 expect((await f.pg.query(`SELECT count(*)::int n FROM "MerchandisingAction" WHERE action='SOURCE_SELECTED'`)).rows).toEqual([{n:2}]);
});
it("does not accept a legacy raw import as a ready merchandising projection",async()=>{
 await approveMapping();await selectConnectorSource("a","owner","sheet",0,f.db);
 await f.pg.exec(`INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt",stats) VALUES ('sheet-run','a','sheet','MANUAL','WARNING','sheet-test',current_date,now(),'{"pipelineVersion":9}');UPDATE "DataSource" SET "activeImportRunId"='sheet-run' WHERE id='sheet';`);
 expect((await listConnectorSources("a",f.db)).connections.find(c=>c.sourceId==="sheet")).toMatchObject({readiness:"IMPORT_REQUIRED",selectable:true});
 await expect(getSalesReport("a",screenSelection,f.db)).rejects.toMatchObject({code:"SHEETS_IMPORT_REQUIRED"});
 await expect(calculateSkuDaily("a",screenSelection,f.db)).rejects.toMatchObject({code:"SHEETS_IMPORT_REQUIRED"});
 expect((await readNavigationOptions("a",f.db)).channels).toEqual([]);
});
it("binds projection readiness to the same active import and approved mapping",async()=>{
 await approveMapping();await f.pg.exec(`INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt",stats) VALUES ('sheet-run','a','sheet','MANUAL','SUCCESS','sheet-test',current_date,now(),'{"merchandisingProjection":{"version":1,"sourceId":"sheet","importRunId":"sheet-run","mappingId":"sheets-mapping"}}');UPDATE "DataSource" SET "activeImportRunId"='sheet-run' WHERE id='sheet';`);
 await expect(assertReportingSourceReady("a",{id:"sheet",provider:"sheets"},f.db)).resolves.toBeUndefined();
 await f.pg.exec(`UPDATE "DataImportRun" SET stats=jsonb_set(stats,'{merchandisingProjection,mappingId}','"stale-mapping"') WHERE id='sheet-run'`);
 await expect(assertReportingSourceReady("a",{id:"sheet",provider:"sheets"},f.db)).rejects.toMatchObject({code:"SHEETS_IMPORT_REQUIRED"});
 await f.pg.exec(`UPDATE "MerchandisingConfig" SET "isActive"=false WHERE id='sheets-mapping'`);
 await expect(assertReportingSourceReady("a",{id:"sheet",provider:"sheets"},f.db)).rejects.toMatchObject({code:"SHEETS_MAPPING_REQUIRED"});
});

it("does not automatically choose Sheets for a Sheets-only tenant",async()=>{
 expect(await readSelectedSource("b",f.db)).toBeNull();
 expect(await listConnectorSources("b",f.db)).toMatchObject({sourceId:null,revision:0,connections:[{sourceId:"foreign-sheet",provider:"sheets",selectable:false}]});
});
it("marks checked remote connections with no completed import as import-required",async()=>{
 await f.pg.exec(`INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('csv-draft','a','CSV','manual',now());INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId",provider,"accountHost","encryptedConfig","lastCheck","updatedAt") VALUES ('csv-draft','a','csv-draft','csv','manual','synthetic','{"ok":true}',now())`);
 try{expect((await listConnectorSources("a",f.db)).connections.find(c=>c.sourceId==="csv-draft")).toMatchObject({selectable:true,readiness:"IMPORT_REQUIRED"});}
 finally{await f.pg.exec(`DELETE FROM "ConnectorConnection" WHERE id='csv-draft';DELETE FROM "DataSource" WHERE id='csv-draft'`);}
});
it("uses the same calculators and channels for equivalent synthetic projected Sheets facts",async()=>{
 const sales=await getSalesReport("a",screenSelection,f.db),daily=await calculateSkuDaily("a",screenSelection,f.db),navigation=await readNavigationOptions("a",f.db);
 await f.pg.exec(`UPDATE "DataSource" SET kind='GOOGLE_SHEETS',"sourceKey"=NULL,"driveFileId"='fixture-sheet',"activeImportRunId"='inventory-run' WHERE id='source';UPDATE "MerchandisingConfig" SET key='sheets:source',values=values||'{"sheets":{"version":1,"fileId":"fixture-sheet"}}'::jsonb WHERE id='mapping';UPDATE "DataImportRun" SET stats='{"merchandisingProjection":{"version":1,"sourceId":"source","importRunId":"inventory-run","mappingId":"mapping"}}' WHERE id='inventory-run';`);
 expect(await readSelectedSource("a",f.db)).toBeNull();await selectConnectorSource("a","owner","source",0,f.db);
 expect(await readSelectedSource("a",f.db)).toMatchObject({provider:"sheets",id:"source"});
 expect((await getSalesReport("a",screenSelection,f.db)).summary).toEqual(sales.summary);
 expect((await calculateSkuDaily("a",screenSelection,f.db)).summary).toEqual(daily.summary);
 expect(await readNavigationOptions("a",f.db)).toEqual(navigation);
});
