import {beforeEach,afterEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
import {createScreenDb,screenSelection} from "../helpers/screen-db";
import {createScreenSnapshot,type ScreenSnapshot} from "@/lib/merchandising-snapshot";
import {saveAttributeDictionary,approveAttributeDictionary} from "@/lib/product-attribute-store";
import {productAttributeEvidence,type AttributeDictionary} from "@/lib/product-attributes";
import {payloadHash} from "@/lib/connectors/order-storage";
import {saveAnalogPolicy,readAnalogPolicy,createAnalogPreview,evaluateAnalogForecasts} from "@/lib/analog-forecast-store";
import {analogPolicy} from "../fixtures/analog-forecast";
let f:Awaited<ReturnType<typeof createScreenDb>>,snapshot:ScreenSnapshot,dictionaryId:string;
const p={tenantId:"a",userId:"owner"},now=screenSelection.now;
const request=()=>({profileId:"watch",snapshotId:snapshot.snapshotId,targetId:"sku-c",preview:true});
const policy=()=>({...analogPolicy(),dictionaryConfigId:dictionaryId,horizonDays:3,maxAnalogs:1});
const save=()=>saveAnalogPolicy(p,"watch",{expectedRevision:0,policy:policy()},f.db);
beforeEach(async()=>{
 f=await createScreenDb();
 await f.pg.exec(`DELETE FROM "ReceiptLine" WHERE "skuId"='sku-c';
 UPDATE "InventorySnapshot" SET quantity=0 WHERE "skuId"='sku-c' AND "snapshotDate"<'2026-10-24';
 INSERT INTO "Receipt" (id,"tenantId","sourceId","importRunId","externalId","movementType","postingVerifiedAt","receivedAt","observedAt","sourceRecordKey","supplierId","updatedAt") VALUES ('target-receipt','a','source','inventory-run','r-target','SUPPLIER_RECEIPT','2026-10-24T08:00:00Z','2026-10-24T00:00:00Z','2026-10-24T08:00:00Z','r-target','supplier',now());
 INSERT INTO "ReceiptLine" (id,"tenantId","receiptId","externalLineId","skuId",quantity) VALUES ('target-line','a','target-receipt','target-line','sku-c',3);
 INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('viewer99','viewer99@test.invalid','test','Viewer','VIEWER','a',now()),('other99','other99@test.invalid','test','Other','ADMIN','b',now());`);
 const dictionary:AttributeDictionary={version:1,sourceId:"source",attribution:"exclusive_bucket",rubric:{kind:"coverage_only",minGroupSize:1},dimensions:[{id:"color",label:"Color",cardinality:"single",selectors:[{path:["attributes","color"]}],values:[{id:"blue",label:"Blue",aliases:["blue"]}]}]};
 const d=await saveAttributeDictionary(p,"watch",{dictionary,expectedRevision:0},f.db);dictionaryId=d.configId;
 for(const skuId of ["sku-a","sku-c"]){const payload=productAttributeEvidence(skuId,{attributes:{color:"blue"},name:"untrusted raw name"});await f.pg.query(`INSERT INTO "DataSourceRecord" (id,"tenantId","sourceId","importRunId",resource,"externalId",payload,"payloadHash","observedAt") VALUES ($1,'a','source','inventory-run','product-attributes',$1,$2,$3,'2026-10-24T10:00:00Z')`,[`attr-${skuId}`,JSON.stringify(payload),payloadHash(payload)]);}
 await approveAttributeDictionary(p,"watch",{configId:dictionaryId,approvalReference:"synthetic",rubricApprovalReference:"synthetic",samples:[{skuId:"sku-a",dimensionId:"color",recordId:"attr-sku-a",valueIds:["blue"]}]},f.db,now);
 snapshot=await createScreenSnapshot("a",screenSelection,f.db);
},30000);
afterEach(async()=>f?.pg.close());
it("stores inactive versioned policy drafts without approving customer rules",async()=>{
 expect(await save()).toMatchObject({state:"draft",businessRulesApproved:false});const read=await readAnalogPolicy(p,"watch",f.db);expect(read.values.horizonDays).toBe(3);expect((await f.pg.query<{isActive:boolean;approvedAt:unknown}>(`SELECT "isActive","approvedAt" FROM "MerchandisingConfig" WHERE id=$1`,[read.id])).rows[0]).toEqual({isActive:false,approvedAt:null});await expect(save()).rejects.toMatchObject({code:"ANALOG_REVISION_CONFLICT"});
});
it("freezes reproducible bounded server evidence and reuses the identical preview",async()=>{
 await save();const a=await createAnalogPreview(p,request(),f.db,now),b=await createAnalogPreview(p,request(),f.db,now);
 expect(a).toMatchObject({state:"draft_preview",businessRulesApproved:false,result:{status:"estimated",reason:null,analogs:[{skuId:"sku-a"}],uncertainty:{kind:"unevaluated",interval:null}}});expect(b.forecastId).toBe(a.forecastId);expect(b.cached).toBe(true);
 const row=(await f.pg.query<{context:Record<string,unknown>}>(`SELECT context FROM "MerchandisingAction" WHERE id=$1`,[a.forecastId])).rows[0];expect(row.context).toHaveProperty("packet");expect(JSON.stringify(row.context)).not.toContain("untrusted raw name");expect((await f.pg.query(`SELECT id FROM "AiExecution"`)).rows).toHaveLength(0);
});
it("requires approved current attributes, current origin and explicit preview mode",async()=>{
 await save();await expect(createAnalogPreview(p,{...request(),preview:false},f.db,now)).rejects.toMatchObject({code:"ANALOG_PREVIEW_ONLY"});
 await expect(createAnalogPreview(p,request(),f.db,new Date("2026-10-26T10:00:00Z"))).rejects.toMatchObject({code:"ANALOG_ORIGIN_NOT_CURRENT"});
 await f.pg.query(`UPDATE "MerchandisingConfig" SET "approvedAt"=NULL,"approvedById"=NULL,"approvalReference"=NULL WHERE id=$1`,[dictionaryId]);await expect(createAnalogPreview(p,request(),f.db,now)).rejects.toMatchObject({code:"ANALOG_DICTIONARY_NOT_APPROVED"});
});
it("isolates signed tenant membership and source/config freshness",async()=>{
 await save();await expect(createAnalogPreview({tenantId:"b",userId:"other99"},request(),f.db,now)).rejects.toMatchObject({code:"ANALOG_POLICY_NOT_CONFIGURED"});await expect(createAnalogPreview({tenantId:"a",userId:"viewer99"},request(),f.db,now)).rejects.toMatchObject({code:"AI_FORBIDDEN"});
 await f.pg.exec(`INSERT INTO "ConnectorSelection" ("tenantId","sourceId",revision,"updatedAt") VALUES ('a','source',12,now());`);await expect(createAnalogPreview(p,request(),f.db,now)).rejects.toMatchObject({code:"AI_CONTEXT_STALE"});
});
it("refuses time leakage, client actuals, duplicate evaluation cases and foreign forecast IDs",async()=>{
 await save();const a=await createAnalogPreview(p,request(),f.db,now),cases=[{forecastId:a.forecastId,outcomeSnapshotId:snapshot.snapshotId}];
 await expect(evaluateAnalogForecasts(p,{profileId:"watch",cases},f.db,now)).rejects.toMatchObject({code:"FORECAST_TIME_SPLIT_REQUIRED"});await expect(evaluateAnalogForecasts(p,{profileId:"watch",cases:[...cases,...cases]},f.db,now)).rejects.toMatchObject({code:"INVALID_FORECAST_EVALUATION"});await expect(evaluateAnalogForecasts(p,{profileId:"watch",cases:[{...cases[0],actualUnits:"100"}]},f.db,now)).rejects.toMatchObject({code:"INVALID_FORECAST_EVALUATION"});await expect(evaluateAnalogForecasts(p,{profileId:"watch",cases:[{...cases[0],forecastId:"foreign"}]},f.db,now)).rejects.toMatchObject({code:"FORECAST_CASE_NOT_FOUND_OR_POLICY_CHANGED"});
});
async function outcome(){
 await f.pg.exec(`INSERT INTO "InventorySnapshot" (id,"tenantId","skuId","snapshotDate","sourceId","importRunId","sourceRecordKey","observedAt",timezone,quantity,"costPrice","retailPrice",currency)
 SELECT s.id||':'||d::date,'a',s.id,d::date,'source','inventory-run','raw:'||s.id||':'||d::date,(d::date+time '03:00') AT TIME ZONE 'Europe/Kyiv','Europe/Kyiv',3,7,20,'UAH' FROM "Sku" s CROSS JOIN generate_series('2026-10-26'::date,'2026-10-29'::date,'1 day') d WHERE s."tenantId"='a';
 UPDATE "SyncCursor" SET checkpoint=jsonb_set(checkpoint,'{through}','"2026-10-29T09:00:00Z"') WHERE "sourceId"='source';
 UPDATE "ConnectorSyncJob" SET checkpoint=jsonb_set(checkpoint,'{to}','"2026-10-29T09:00:00Z"') WHERE id='orders-job';`);
 return createScreenSnapshot("a",{dateFrom:"2026-10-26",dateTo:"2026-10-28",asOf:"2026-10-29",now:new Date("2026-10-29T10:00:00Z")},f.db);
}
it("scores a real saved zero outcome without pretending a draft score approves release",async()=>{
 await save();const a=await createAnalogPreview(p,request(),f.db,now),later=await outcome(),body={profileId:"watch",cases:[{forecastId:a.forecastId,outcomeSnapshotId:later.snapshotId}]},time=new Date("2026-10-29T10:00:00Z");
 const r=await evaluateAnalogForecasts(p,body,f.db,time);expect(r).toMatchObject({state:"draft_evaluation",businessRulesApproved:false,scored:1,releaseApproved:false,metrics:{forecast:{wape:null}},cases:[{actualUnits:"0",exclusion:null}]});expect((await evaluateAnalogForecasts(p,body,f.db,time)).evaluationId).toBe(r.evaluationId);
});
it("excludes censored future outcomes and detects forecasts recorded after their horizon began",async()=>{
 await save();const a=await createAnalogPreview(p,request(),f.db,now),later=await outcome();await f.pg.exec(`UPDATE "InventorySnapshot" SET quantity=0 WHERE "skuId"='sku-c' AND "snapshotDate"='2026-10-27'`);
 const body={profileId:"watch",cases:[{forecastId:a.forecastId,outcomeSnapshotId:later.snapshotId}]},time=new Date("2026-10-29T10:00:00Z");expect(await evaluateAnalogForecasts(p,body,f.db,time)).toMatchObject({scored:0,cases:[{exclusion:"OUTCOME_STOCK_CENSORED_OR_MISSING"}]});
 await f.pg.query(`UPDATE "MerchandisingAction" SET "createdAt"='2026-10-27T00:00:00Z' WHERE id=$1`,[a.forecastId]);await expect(evaluateAnalogForecasts(p,body,f.db,time)).rejects.toMatchObject({code:"FORECAST_TIME_SPLIT_REQUIRED"});
});
it("invalidates dictionary/profile revisions instead of mixing them into existing forecasts",async()=>{
 await save();const a=await createAnalogPreview(p,request(),f.db,now);await saveAnalogPolicy(p,"watch",{expectedRevision:1,policy:{...policy(),rationale:"new draft thresholds"}},f.db);
 await expect(evaluateAnalogForecasts(p,{profileId:"watch",cases:[{forecastId:a.forecastId,outcomeSnapshotId:snapshot.snapshotId}]},f.db,now)).rejects.toMatchObject({code:"FORECAST_CASE_NOT_FOUND_OR_POLICY_CHANGED"});
 await f.pg.exec(`INSERT INTO "MerchandisingConfig" SELECT (jsonb_populate_record(NULL::"MerchandisingConfig",to_jsonb(c)||'{"id":"new-dictionary-99","revision":2,"approvedAt":null,"approvedById":null,"approvalReference":null}'::jsonb)).* FROM "MerchandisingConfig" c WHERE key='attributes:watch'`);
 await expect(createAnalogPreview(p,request(),f.db,now)).rejects.toMatchObject({code:"ANALOG_DICTIONARY_NOT_APPROVED"});
});
it("records uncertain analog prices as exclusions and bounds candidates before attribute reads",async()=>{
 await save();await f.pg.exec(`UPDATE "InventorySnapshot" SET "retailPrice"=30 WHERE "skuId"='sku-a' AND "snapshotDate"='2026-09-01'`);
 expect((await createAnalogPreview(p,request(),f.db,now)).result).toMatchObject({status:"manual_review",reason:"INSUFFICIENT_ANALOGS",forecastUnits:null,exclusions:[{skuId:"sku-a",reason:"PRICE_NOT_COMPARABLE"}]});
 const narrow={...policy(),candidateLimit:2};await saveAnalogPolicy(p,"watch",{expectedRevision:1,policy:narrow},f.db);
 await f.pg.exec(`UPDATE "SkuDaily" SET metrics=jsonb_set(metrics,'{categoryId}','"cat-a"') WHERE "skuId"='sku-b'`);
 await expect(createAnalogPreview(p,request(),f.db,now)).rejects.toMatchObject({code:"ANALOG_CANDIDATE_LIMIT"});
});
it("does not overweight duplicate target/origin cases with different receipt IDs",async()=>{
 await save();const a=await createAnalogPreview(p,request(),f.db,now),later=await outcome();
 await f.pg.query(`INSERT INTO "MerchandisingAction" SELECT (jsonb_populate_record(NULL::"MerchandisingAction",to_jsonb(r)||'{"id":"duplicate-origin-99","idempotencyKey":"duplicate-origin-99"}'::jsonb)).* FROM "MerchandisingAction" r WHERE id=$1`,[a.forecastId]);
 await expect(evaluateAnalogForecasts(p,{profileId:"watch",cases:[{forecastId:a.forecastId,outcomeSnapshotId:later.snapshotId},{forecastId:"duplicate-origin-99",outcomeSnapshotId:later.snapshotId}]},f.db,new Date("2026-10-29T10:00:00Z"))).rejects.toMatchObject({code:"FORECAST_DUPLICATE_ORIGIN"});
});

it("does not combine a saved UAH target with a changed raw currency or price",async()=>{
 await save();await f.pg.query(`UPDATE "InventorySnapshot" SET currency='USD' WHERE id=(SELECT metrics->>'snapshotId' FROM "SkuDaily" WHERE "configId"=$1 AND "skuId"='sku-c')`,[snapshot.stock.calculationId]);
 expect((await createAnalogPreview(p,request(),f.db,now)).result).toMatchObject({status:"manual_review",reason:"TARGET_SCOPE_OR_PRICE_UNAVAILABLE",forecastUnits:null});
 await f.pg.query(`UPDATE "InventorySnapshot" SET currency='UAH',"retailPrice"=30 WHERE id=(SELECT metrics->>'snapshotId' FROM "SkuDaily" WHERE "configId"=$1 AND "skuId"='sku-c')`,[snapshot.stock.calculationId]);
 expect((await createAnalogPreview(p,request(),f.db,now)).result).toMatchObject({status:"manual_review",reason:"TARGET_SCOPE_OR_PRICE_UNAVAILABLE"});
});

it("does not turn missing quantities or return-dominated actuals into zero demand",async()=>{
 await save();const a=await createAnalogPreview(p,request(),f.db,now),later=await outcome(),body={profileId:"watch",cases:[{forecastId:a.forecastId,outcomeSnapshotId:later.snapshotId}]},time=new Date("2026-10-29T10:00:00Z");
 await f.pg.query(`INSERT INTO "MerchandisingScreenFact" ("snapshotId","tenantId","lineId","sourceId","orderId","skuId",currency,"categoryId","productKind",kind,"inCurrent","inPriorYear","businessDate",quantity) VALUES ($1,'a','actual-test-99','source','outcome-order','sku-c','UAH','cat-a','MERCHANDISE','SALE',true,false,'2026-10-27',NULL)`,[later.snapshotId]);
 expect(await evaluateAnalogForecasts(p,body,f.db,time)).toMatchObject({scored:0,cases:[{actualUnits:null,exclusion:"OUTCOME_SALES_INCOMPLETE"}]});
 await f.pg.query(`UPDATE "MerchandisingScreenFact" SET kind='RETURN',quantity=-1 WHERE "snapshotId"=$1 AND "lineId"='actual-test-99'`,[later.snapshotId]);
 expect(await evaluateAnalogForecasts(p,body,f.db,time)).toMatchObject({scored:0,cases:[{actualUnits:null,exclusion:"OUTCOME_RETURN_DOMINATED"}]});
});

it("keeps changed future retail prices out of the constant-price evaluation cohort",async()=>{
 await save();const a=await createAnalogPreview(p,request(),f.db,now),later=await outcome();
 await f.pg.exec(`UPDATE "InventorySnapshot" SET "retailPrice"=10 WHERE "skuId"='sku-c' AND "snapshotDate"='2026-10-27'`);
 expect(await evaluateAnalogForecasts(p,{profileId:"watch",cases:[{forecastId:a.forecastId,outcomeSnapshotId:later.snapshotId}]},f.db,new Date("2026-10-29T10:00:00Z"))).toMatchObject({scored:0,cases:[{exclusion:"OUTCOME_PRICE_NOT_COMPARABLE"}]});
});

it("rejects evaluation batches above the shared policy/scoring bound before loading cases",async()=>{
 const cases=Array.from({length:21},(_,i)=>({forecastId:`case-${i}`,outcomeSnapshotId:snapshot.snapshotId}));
 await expect(evaluateAnalogForecasts(p,{profileId:"watch",cases},f.db,now)).rejects.toMatchObject({code:"INVALID_FORECAST_EVALUATION"});
});
