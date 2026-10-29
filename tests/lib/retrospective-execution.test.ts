import {beforeAll,afterAll,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
import {createStockWorkspaceDb} from "../helpers/stock-workspace-db";
import {screenSelection} from "../helpers/screen-db";
import {createScreenSnapshot,type ScreenSnapshot} from "@/lib/merchandising-snapshot";
import {createRepricingInputs,getRepricingPreview} from "@/lib/repricing-store";
import {getReorderingPreview} from "@/lib/reordering-store";
import {createScenarioExport} from "@/lib/scenario-export-store";
import {confirmScenarioExecution} from "@/lib/retrospective-execution-store";
import {calculateScenarioRetrospective} from "@/lib/retrospective-report";
import {randomUUID} from "node:crypto";
let f:Awaited<ReturnType<typeof createStockWorkspaceDb>>,origin:ScreenSnapshot,before:ScreenSnapshot,after:ScreenSnapshot,skuIds:string[],exportId:string;
const p={tenantId:"a",userId:"owner"},now=new Date("2026-10-29T10:00:00Z");
const command=()=>({requestKey:randomUUID(),exportId,kind:"reprice",event:"APPLIED",occurredAt:"2026-10-25T09:00:00Z",evidenceReference:"Synthetic owner confirmation; no remote write",skuIds:[skuIds[0]],previousExecutionId:null,receiptIds:[]});
beforeAll(async()=>{
 f=await createStockWorkspaceDb();await f.pg.exec(`INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('analyst108','analyst108@test.invalid','test','Analyst','ANALYST','a',now()),('viewer108','viewer108@test.invalid','test','Viewer','VIEWER','a',now()),('foreign108','foreign108@test.invalid','test','Foreign','ADMIN','b',now());UPDATE "Brand" SET "supplierId"='supplier' WHERE id='brand-active';UPDATE "InventorySnapshot" SET "qtyInTransit"=0,"inTransitVerifiedAt"='2026-10-25T05:00:00Z';`);
 origin=await createScreenSnapshot("a",screenSelection,f.db);const inputs=await createRepricingInputs("a",origin.snapshotId,f.db,screenSelection.now),scenario={inputSetId:inputs.inputSetId,pageSize:1},preview=await getRepricingPreview("a",scenario,f.db);exportId=randomUUID();await createScenarioExport("a","owner",{exportId,kind:"reprice",previewId:preview.previewId,scenario},f.db,new Date("2026-10-25T08:00:00Z"));
 skuIds=(await f.pg.query<{id:string}>(`SELECT row->>'skuId' id FROM "MerchandisingAction",jsonb_array_elements(after->'rows') row WHERE "idempotencyKey"=$1`,[`export:${exportId}`])).rows.map(r=>r.id);
 await f.pg.exec(`INSERT INTO "InventorySnapshot" (id,"tenantId","skuId","snapshotDate","sourceId","importRunId","sourceRecordKey","observedAt",timezone,quantity,"costPrice","retailPrice",currency)
 SELECT s.id||':'||d::date,'a',s.id,d::date,'source','inventory-run','raw:'||s.id||':'||d::date,(d::date+time '03:00') AT TIME ZONE 'Europe/Kyiv','Europe/Kyiv',3,10,20,'UAH' FROM "Sku" s CROSS JOIN generate_series('2026-10-26'::date,'2026-10-29'::date,'1 day') d WHERE s."tenantId"='a';
 UPDATE "SyncCursor" SET checkpoint=jsonb_set(checkpoint,'{through}','"2026-10-29T09:00:00Z"') WHERE "sourceId"='source';UPDATE "ConnectorSyncJob" SET checkpoint=jsonb_set(checkpoint,'{to}','"2026-10-29T09:00:00Z"') WHERE id='orders-job';`);
 before=await createScreenSnapshot("a",{dateFrom:"2026-10-22",dateTo:"2026-10-24",asOf:"2026-10-29",now},f.db);after=await createScreenSnapshot("a",{dateFrom:"2026-10-26",dateTo:"2026-10-28",asOf:"2026-10-29",now},f.db);
},30000);afterAll(async()=>f?.pg.close());
let executionId:string;
it("pins exact applied export rows and makes replay idempotent without any remote write",async()=>{
 const q=command(),a=await confirmScenarioExecution(p,q,f.db,now),b=await confirmScenarioExecution(p,q,f.db,now);executionId=a.executionId;expect(b).toEqual(a);expect(a.exportRows).toHaveLength(1);expect(a).toMatchObject({policyVersion:"retrospective-v1",evidenceKind:"OWNER_ATTESTATION",sourceId:"source",command:{skuIds:q.skuIds,event:"APPLIED"}});expect(a.exportRows[0]).toHaveProperty("newPrice");expect(a.exportParameters).toMatchObject({kind:"reprice",scenario:{inputSetId:expect.any(String)}});await expect(confirmScenarioExecution(p,{...q,evidenceReference:"changed"},f.db,now)).rejects.toMatchObject({code:"EXECUTION_REQUEST_CONFLICT"});await expect(confirmScenarioExecution(p,command(),f.db,now)).rejects.toMatchObject({code:"EXECUTION_SUBSET_ALREADY_CONFIRMED"});
});
it("requires owner membership, actual subset and valid event time, preserving tenant boundaries",async()=>{
 await expect(confirmScenarioExecution({tenantId:"a",userId:"analyst108"},command(),f.db,now)).rejects.toMatchObject({code:"AI_FORBIDDEN"});await expect(confirmScenarioExecution({tenantId:"b",userId:"foreign108"},command(),f.db,now)).rejects.toMatchObject({code:"EXECUTION_EXPORT_NOT_FOUND"});await expect(confirmScenarioExecution(p,{...command(),skuIds:["foreign"]},f.db,now)).rejects.toMatchObject({code:"EXECUTION_SUBSET_MISMATCH"});await expect(confirmScenarioExecution(p,{...command(),occurredAt:"2026-10-24T00:00:00Z"},f.db,now)).rejects.toMatchObject({code:"EXECUTION_TIME_INVALID"});
});
it("calculates a frozen fixed-subset comparison from saved facts, with observed zero sales and no annualization/causal claim",async()=>{
 const q={executionId,beforeSnapshotId:before.snapshotId,afterSnapshotId:after.snapshotId,days:3},a=await calculateScenarioRetrospective(p,q,f.db,now),b=await calculateScenarioRetrospective(p,q,f.db,now);expect(a).toMatchObject({state:"AVAILABLE",policyVersion:"retrospective-v1",annualized:false,causalUplift:null,externalActionExecuted:false,after:{results:[{grossProfit:"0",gmroi:{value:"0",basis:"DAILY_OBSERVATION_APPROXIMATION"}}]}});expect(b).toEqual(a);
});
it("blocks incomplete windows, forged snapshot IDs, viewers and changed source selection",async()=>{
 const q={executionId,beforeSnapshotId:before.snapshotId,afterSnapshotId:after.snapshotId,days:3};await expect(calculateScenarioRetrospective(p,q,f.db,new Date("2026-10-27T10:00:00Z"))).rejects.toMatchObject({code:"RETROSPECTIVE_WINDOW_NOT_COMPLETE"});await expect(calculateScenarioRetrospective({tenantId:"a",userId:"viewer108"},q,f.db,now)).rejects.toMatchObject({code:"AI_FORBIDDEN"});await expect(calculateScenarioRetrospective({tenantId:"b",userId:"foreign108"},q,f.db,now)).rejects.toMatchObject({code:"EXECUTION_NOT_FOUND"});await expect(calculateScenarioRetrospective(p,{...q,afterSnapshotId:origin.snapshotId},f.db,now)).rejects.toMatchObject({code:"RETROSPECTIVE_SNAPSHOT_SCOPE_MISMATCH"});
 await f.pg.exec(`INSERT INTO "ConnectorSelection" ("tenantId","sourceId",revision,"updatedAt") VALUES ('a','source',108,now());`);try{await expect(calculateScenarioRetrospective(p,q,f.db,now)).rejects.toMatchObject({code:"RETROSPECTIVE_SOURCE_CHANGED"});}finally{await f.pg.exec(`DELETE FROM "ConnectorSelection"`);}
});
it("does not invent zero GMROI when one observed cost is missing; frozen prior reports remain unchanged",async()=>{
 const q={executionId,beforeSnapshotId:before.snapshotId,afterSnapshotId:after.snapshotId,days:3};await f.pg.query(`UPDATE "InventorySnapshot" SET "costPrice"=NULL WHERE "skuId"=$1 AND "snapshotDate"='2026-10-27'`,[skuIds[0]]);try{expect(await calculateScenarioRetrospective(p,q,f.db,now)).toMatchObject({state:"PARTIAL_OR_UNAVAILABLE",after:{results:[{gmroi:{value:null,reason:"INVENTORY_INCOMPLETE"}}]}});}finally{await f.pg.query(`UPDATE "InventorySnapshot" SET "costPrice"=10 WHERE "skuId"=$1 AND "snapshotDate"='2026-10-27'`,[skuIds[0]]);}
});
it("preserves signed returns/negative gross profit and requires complete profit coverage",async()=>{
 const q={executionId,beforeSnapshotId:before.snapshotId,afterSnapshotId:after.snapshotId,days:3};
 await f.pg.query(`INSERT INTO "MerchandisingScreenFact" ("snapshotId","tenantId","lineId","sourceId","orderId","skuId",currency,"productKind",kind,"inCurrent","inPriorYear","businessDate",quantity,revenue,"grossProfit") VALUES ($1,'a','return108','source','return108',$2,'UAH','MERCHANDISE','RETURN',true,false,'2026-10-27',-1,-20,-10)`,[after.snapshotId,skuIds[0]]);
 try{
  expect(await calculateScenarioRetrospective(p,q,f.db,now)).toMatchObject({after:{results:[{grossProfit:"-10",units:"-1",returnLines:1,gmroi:{value:"-0.333333333333333333333333333333333333333333333333"}}]}});
  await f.pg.query(`UPDATE "MerchandisingScreenFact" SET "grossProfit"=NULL WHERE "snapshotId"=$1 AND "lineId"='return108'`,[after.snapshotId]);expect(await calculateScenarioRetrospective(p,q,f.db,now)).toMatchObject({state:"PARTIAL_OR_UNAVAILABLE",after:{results:[{grossProfit:null,gmroi:{value:null,reason:"SALES_OR_PROFIT_INCOMPLETE"}}]}});
 }finally{await f.pg.query(`DELETE FROM "MerchandisingScreenFact" WHERE "snapshotId"=$1 AND "lineId"='return108'`,[after.snapshotId]);}
});
it("rejects altered publication headers and unverified ownership instead of mixing calculation versions",async()=>{
 const q={executionId,beforeSnapshotId:before.snapshotId,afterSnapshotId:after.snapshotId,days:3};
 await f.pg.query(`UPDATE "ReportCalculationRun" SET "financialResult"=jsonb_set("financialResult",'{provenance,sourceId}','"wrong"') WHERE id=$1`,[after.sales.calculationId]);try{await expect(calculateScenarioRetrospective(p,q,f.db,now)).rejects.toMatchObject({code:"RETROSPECTIVE_PUBLICATION_MISMATCH"});}finally{await f.pg.query(`UPDATE "ReportCalculationRun" SET "financialResult"=jsonb_set("financialResult",'{provenance,sourceId}','"source"') WHERE id=$1`,[after.sales.calculationId]);}
 await f.pg.query(`UPDATE "SkuDaily" SET metrics=jsonb_set(metrics,'{ownership}','"UNKNOWN"') WHERE "configId"=$1 AND "skuId"=$2`,[after.stock.calculationId,skuIds[0]]);try{expect(await calculateScenarioRetrospective(p,q,f.db,now)).toMatchObject({state:"PARTIAL_OR_UNAVAILABLE",after:{exclusions:[{reason:"OWNERSHIP_PRODUCT_OR_CURRENCY_UNVERIFIED"}],results:[{grossProfit:null,gmroi:{value:null}}]}});}finally{await f.pg.query(`UPDATE "SkuDaily" SET metrics=jsonb_set(metrics,'{ownership}','"OWN"') WHERE "configId"=$1 AND "skuId"=$2`,[after.stock.calculationId,skuIds[0]]);}
});
it("keeps SENT/ACCEPTED/RECEIVED distinct and requires verified supplier receipt evidence before evaluation",async()=>{
 const scenario={snapshotId:origin.snapshotId,mode:"brand",filters:{brandId:"brand-active"},overrides:[{skuId:"sku-oos",inTransitQuantity:"0"},{skuId:"sku-healthy",inTransitQuantity:"0"},{skuId:"sku-risk",inTransitQuantity:"0"}]},preview=await getReorderingPreview("a",scenario,f.db),id=randomUUID();
 await createScenarioExport("a","owner",{exportId:id,kind:"reorder",previewId:preview.previewId,scenario,target:{supplierId:"supplier",currency:"UAH"}},f.db,new Date("2026-10-25T08:00:00Z"));
 const target=(await f.pg.query<{skuId:string}>(`SELECT after->'rows'->0->>'skuId' "skuId" FROM "MerchandisingAction" WHERE "idempotencyKey"=$1`,[`export:${id}`])).rows[0].skuId;
 const base={requestKey:randomUUID(),exportId:id,kind:"reorder",event:"SENT",occurredAt:"2026-10-25T09:00:00Z",evidenceReference:"synthetic dispatch confirmation",skuIds:[target],previousExecutionId:null,receiptIds:[]},sent=await confirmScenarioExecution(p,base,f.db,now);
 expect(await calculateScenarioRetrospective(p,{executionId:sent.executionId,beforeSnapshotId:before.snapshotId,afterSnapshotId:after.snapshotId,days:3},f.db,now)).toMatchObject({state:"UNAVAILABLE",reason:"ACTUAL_APPLICATION_OR_RECEIPT_REQUIRED"});
 await expect(confirmScenarioExecution(p,{...base,requestKey:randomUUID(),event:"RECEIVED",previousExecutionId:sent.executionId,receiptIds:["receipt"]},f.db,now)).rejects.toMatchObject({code:"EXECUTION_TRANSITION_INVALID"});
 const accepted=await confirmScenarioExecution(p,{...base,requestKey:randomUUID(),event:"ACCEPTED",previousExecutionId:sent.executionId},f.db,now);
 const received={...base,requestKey:randomUUID(),event:"RECEIVED",previousExecutionId:accepted.executionId,receiptIds:["receipt"]};await expect(confirmScenarioExecution(p,received,f.db,now)).rejects.toMatchObject({code:"EXECUTION_RECEIPTS_UNVERIFIED"});
 await f.pg.query(`INSERT INTO "Receipt" (id,"tenantId","sourceId","importRunId","externalId","movementType","postingVerifiedAt","receivedAt","observedAt","sourceRecordKey","supplierId","updatedAt") VALUES ('receipt108','a','source','inventory-run','receipt108','SUPPLIER_RECEIPT','2026-10-25T09:00:00Z','2026-10-25T09:00:00Z','2026-10-25T09:00:00Z','receipt108','supplier',now())`);
 await f.pg.query(`INSERT INTO "ReceiptLine" (id,"tenantId","receiptId","externalLineId","skuId",quantity) VALUES ('receipt108','a','receipt108','receipt108',$1,1)`,[target]);
 await expect(confirmScenarioExecution(p,{...received,requestKey:randomUUID(),receiptIds:["receipt108"],occurredAt:"2026-10-26T09:00:00Z"},f.db,now)).rejects.toMatchObject({code:"EXECUTION_RECEIPT_TIME_MISMATCH"});
 expect(await confirmScenarioExecution(p,{...received,receiptIds:["receipt108"]},f.db,now)).toMatchObject({command:{event:"RECEIVED"},receiptEvidence:[{receiptId:"receipt108",skuId:target,supplierId:"supplier"}]});
});
it("does not treat an unexpected sales currency or zero inventory investment as a valid return",async()=>{
 const q={executionId,beforeSnapshotId:before.snapshotId,afterSnapshotId:after.snapshotId,days:3};
 await f.pg.query(`INSERT INTO "MerchandisingScreenFact" ("snapshotId","tenantId","lineId","sourceId","orderId","skuId",currency,"productKind",kind,"inCurrent","inPriorYear","businessDate",quantity,revenue,"grossProfit") VALUES ($1,'a','currency108','source','currency108',$2,'USD','MERCHANDISE','SALE',true,false,'2026-10-27',1,20,10)`,[after.snapshotId,skuIds[0]]);
 try{expect(await calculateScenarioRetrospective(p,q,f.db,now)).toMatchObject({state:"PARTIAL_OR_UNAVAILABLE",after:{results:[{grossProfit:null,gmroi:{value:null}}]}});}finally{await f.pg.query(`DELETE FROM "MerchandisingScreenFact" WHERE "snapshotId"=$1 AND "lineId"='currency108'`,[after.snapshotId]);}
 await f.pg.query(`UPDATE "InventorySnapshot" SET quantity=0 WHERE "skuId"=$1 AND "snapshotDate" BETWEEN '2026-10-26' AND '2026-10-28'`,[skuIds[0]]);try{expect(await calculateScenarioRetrospective(p,q,f.db,now)).toMatchObject({after:{results:[{gmroi:{value:null,reason:"ZERO_INVENTORY_DENOMINATOR"}}]}});}finally{await f.pg.query(`UPDATE "InventorySnapshot" SET quantity=3 WHERE "skuId"=$1 AND "snapshotDate" BETWEEN '2026-10-26' AND '2026-10-28'`,[skuIds[0]]);}
});
