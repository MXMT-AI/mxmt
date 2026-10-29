import {beforeAll,afterAll,beforeEach,expect,it,vi} from "vitest";
import {financialDecimal as D} from "@/lib/financial-decimal.mjs";
import {randomUUID} from "node:crypto";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
import {createStockWorkspaceDb} from "../helpers/stock-workspace-db";
import {screenSelection} from "../helpers/screen-db";
import {createScreenSnapshot} from "@/lib/merchandising-snapshot";
import {createRepricingInputs,getRepricingPreview} from "@/lib/repricing-store";
import {createScenarioExport} from "@/lib/scenario-export-store";
import {previewPriceWriteback,approvePriceWriteback,executePriceWriteback,reconcilePriceWriteback,readPriceWriteback} from "@/lib/price-writeback-store";
import type {PriceTransport,PriceAccessPolicy,RemotePrice} from "@/lib/price-writeback";
let f:Awaited<ReturnType<typeof createStockWorkspaceDb>>,exportId:string,ids:string[],time:Date;
const p={tenantId:"a",userId:"owner"},products=new Map<string,{price:string;version:string}>(),attempts=new Map<string,"APPLIED"|"NOT_APPLIED"|"UNKNOWN">();
const read=vi.fn<PriceTransport["read"]>(async input=>({products:input.productIds.map(productId=>({productId,...products.get(productId)!,currency:"UAH",observedAt:time.toISOString(),exists:true,authoritative:true,basis:"NATIVE_BASE_PRICE",discount:"NONE"} satisfies RemotePrice)),attempts:Object.fromEntries(input.attemptIds.map(id=>[id,attempts.get(id)??"UNKNOWN"]))}));
const cas=vi.fn<PriceTransport["compareAndSet"]>(async input=>{
 if(attempts.get(input.attemptId)==="NOT_APPLIED"||time.getTime()>=Date.parse(input.approvedUntil))return {state:"REJECTED"};const old=products.get(input.productId);if(!old||old.version!==input.expectedVersion||!D(old.price).eq(input.expectedPrice)){attempts.set(input.attemptId,"NOT_APPLIED");return {state:"CONFLICT"};}
 products.set(input.productId,{price:input.newPrice,version:`v-${randomUUID()}`});attempts.set(input.attemptId,"APPLIED");return {state:"APPLIED",receipt:`receipt-${randomUUID()}`,version:products.get(input.productId)!.version};
});
const transport:PriceTransport={capabilities:{atomicExistingOnly:true,authoritativeNativeReads:true,terminalAttemptLookup:true},read,compareAndSet:cas};
const access=():PriceAccessPolicy=>({version:"synthetic-policy",sourceId:"source",connectionRevision:1,approvalReference:"synthetic access/cost/quota approval",canaryReference:"fake transport only; no real canary",quotaKey:"synthetic-account",from:"2026-10-01T00:00:00Z",to:"2026-11-01T00:00:00Z",maxReads:100,maxWrites:100});
const options=()=>({db:f.db,transport,access:access(),now:()=>time});
const preview=(skuIds=ids.slice(0,2))=>previewPriceWriteback(p,{exportId,skuIds,compensatesId:null},options());
async function approved(skuIds=ids.slice(0,2)){const op=await preview(skuIds);return approvePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash,reference:"explicit synthetic item approval"},options());}
beforeAll(async()=>{
 f=await createStockWorkspaceDb();await f.pg.exec(`INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('analyst109','analyst109@test.invalid','test','Analyst','ANALYST','a',now()),('foreign109','foreign109@test.invalid','test','Foreign','ADMIN','b',now());`);
 const s=await createScreenSnapshot("a",screenSelection,f.db),inputs=await createRepricingInputs("a",s.snapshotId,f.db,screenSelection.now),scenario={inputSetId:inputs.inputSetId,pageSize:1},diff=await getRepricingPreview("a",scenario,f.db);exportId=randomUUID();await createScenarioExport("a","owner",{exportId,kind:"reprice",previewId:diff.previewId,scenario},f.db,screenSelection.now);
 ids=(await f.pg.query<{id:string}>(`SELECT r->>'skuId' id FROM "MerchandisingAction",jsonb_array_elements(after->'rows') r WHERE "idempotencyKey"=$1 ORDER BY id`,[`export:${exportId}`])).rows.map(r=>r.id);
},30000);afterAll(async()=>f?.pg.close());
beforeEach(async()=>{
 time=new Date(screenSelection.now);attempts.clear();products.clear();read.mockClear();cas.mockClear();
 await f.pg.exec(`DELETE FROM "MerchandisingAction" WHERE "entityType" IN ('PRICE_WRITEBACK','PRICE_TRANSPORT_ATTEMPT');DELETE FROM "ConnectorSelection";DELETE FROM "SkuAlias" WHERE id='ambiguous109';UPDATE "ConnectorConnection" SET revision=1 WHERE "tenantId"='a';`);
 const rows=(await f.pg.query<{id:string;price:string}>(`SELECT r->>'skuId' id,r->>'oldPrice' price FROM "MerchandisingAction",jsonb_array_elements(after->'rows') r WHERE "idempotencyKey"=$1`,[`export:${exportId}`])).rows;for(const row of rows)products.set(row.id,{price:row.price,version:"v1"});
});
it("keeps production unavailable and performs no request without an approved server transport/policy",async()=>{
 await expect(previewPriceWriteback(p,{exportId,skuIds:[ids[0]],compensatesId:null},{db:f.db})).rejects.toMatchObject({code:"PRICE_WRITEBACK_DISABLED"});expect(read).not.toHaveBeenCalled();expect(cas).not.toHaveBeenCalled();
});
it("separates preview/approval/execute, audits old/new/version and never duplicates a successful write",async()=>{
 const op=await preview();expect(op.state).toBe("DRAFT");expect(cas).not.toHaveBeenCalled();const a=await approvePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash,reference:"checked"},options());expect(a.state).toBe("APPROVED");expect(a.accessPolicy).toMatchObject({approvalReference:"synthetic access/cost/quota approval"});await expect(approvePriceWriteback(p,{operationId:a.id,previewHash:a.previewHash,reference:"different approval"},options())).rejects.toMatchObject({code:"PRICE_APPROVAL_ALREADY_EXISTS"});expect(cas).not.toHaveBeenCalled();const result=await executePriceWriteback(p,{operationId:a.id,previewHash:a.previewHash},options());expect(result.state).toBe("SUCCEEDED");expect(result.items.every(i=>i.state==="SUCCEEDED"&&i.observedPrice===i.newPrice&&i.remoteReceipt)).toBe(true);const calls=cas.mock.calls.length;expect(await executePriceWriteback(p,{operationId:a.id,previewHash:a.previewHash},options())).toEqual(result);expect(cas).toHaveBeenCalledTimes(calls);
});
it("rejects wrong source mapping, foreign exports, non-admins, query values and stale credentials",async()=>{
 await expect(previewPriceWriteback({tenantId:"b",userId:"foreign109"},{exportId,skuIds:[ids[0]],compensatesId:null},options())).rejects.toMatchObject({code:"PRICE_EXPORT_SUBSET_NOT_FOUND"});await expect(previewPriceWriteback({tenantId:"a",userId:"analyst109"},{exportId,skuIds:[ids[0]],compensatesId:null},options())).rejects.toMatchObject({code:"AI_FORBIDDEN"});await expect(previewPriceWriteback(p,{exportId,skuIds:[ids[0]],compensatesId:null,newPrice:"1"},options())).rejects.toMatchObject({code:"INVALID_PRICE_PREVIEW"});
 await f.pg.query(`INSERT INTO "SkuAlias" (id,"tenantId","sourceId","skuId",type,value) VALUES ('ambiguous109','a','source',$1,'SOURCE_PRODUCT_ID','wrong-product')`,[ids[0]]);await expect(preview()).rejects.toMatchObject({code:"PRICE_PRODUCT_MAPPING_UNVERIFIED"});expect(cas).not.toHaveBeenCalled();
});
it("blocks changed remote prices/versions, missing products, discounts and converted currency",async()=>{
 const saved=read.getMockImplementation()!;for(const patch of [{price:"1"},{exists:false},{discount:"ACTIVE"},{currency:"USD"},{authoritative:false}]){
  read.mockImplementationOnce(async input=>{const r=await saved(input);(r.products as Array<Record<string,unknown>>)[0]={...(r.products as Array<Record<string,unknown>>)[0],...patch};return r;});await expect(preview()).rejects.toThrow();
 }expect(cas).not.toHaveBeenCalled();
});
it("expires approval, invalidates a changed preview hash and a rotated connection before writes",async()=>{
 const op=await approved();await expect(executePriceWriteback(p,{operationId:op.id,previewHash:"forged"},options())).rejects.toMatchObject({code:"PRICE_PREVIEW_CHANGED"});time=new Date(time.getTime()+15*60000);await expect(executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},options())).rejects.toMatchObject({code:"PRICE_APPROVAL_EXPIRED"});time=new Date(screenSelection.now);await f.pg.exec(`UPDATE "ConnectorConnection" SET revision=2 WHERE "tenantId"='a'`);await expect(executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},options())).rejects.toMatchObject({code:"PRICE_CONNECTION_CHANGED"});expect(cas).not.toHaveBeenCalled();
});
it("rechecks remote versions before dispatch and preserves concurrent merchant edits atomically",async()=>{
 const op=await approved([ids[0]]),product=op.items[0].productId;products.set(product,{price:op.items[0].oldPrice,version:"merchant-v2"});expect(await executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},options())).toMatchObject({state:"FAILED",items:[{state:"CONFLICT"}]});expect(cas).not.toHaveBeenCalled();
});
it("does not race duplicate execute requests or competing operations for an unresolved product",async()=>{
 const a=await approved([ids[0]]),b=await approved([ids[0]]),original=cas.getMockImplementation()!;let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});cas.mockImplementationOnce(async input=>{entered();await gate;return original(input);});
 const pending=executePriceWriteback(p,{operationId:a.id,previewHash:a.previewHash},options());await ready;expect(await executePriceWriteback(p,{operationId:a.id,previewHash:a.previewHash},options())).toMatchObject({state:"DISPATCHING"});expect(await executePriceWriteback(p,{operationId:b.id,previewHash:b.previewHash},options())).toMatchObject({state:"FAILED",items:[{reason:"PRICE_PRODUCT_OUTCOME_UNRESOLVED"}]});release();expect((await pending).state).toBe("SUCCEEDED");expect(cas).toHaveBeenCalledTimes(1);
});
it("retains timeout-after-remote-success as unknown until explicit terminal-attempt reconciliation",async()=>{
 const op=await approved([ids[0]]),original=cas.getMockImplementation()!;cas.mockImplementationOnce(async input=>{await original(input);return new Promise(()=>{});});
 const result=await executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},{...options(),timeoutMs:1});expect(result).toMatchObject({state:"UNKNOWN",items:[{state:"UNKNOWN"}]});await expect(reconcilePriceWriteback(p,{operationId:op.id},options())).rejects.toMatchObject({code:"PRICE_ATTEMPT_STILL_IN_FLIGHT"});time=new Date(time.getTime()+31000);expect(await reconcilePriceWriteback(p,{operationId:op.id},options())).toMatchObject({state:"RECONCILED",items:[{state:"RECONCILED_APPLIED"}]});expect(cas).toHaveBeenCalledTimes(1);expect((await executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},options())).state).toBe("RECONCILED");expect(cas).toHaveBeenCalledTimes(1);
});
it("never treats unchanged current price as proof that an unknown attempt cannot still apply",async()=>{
 const op=await approved([ids[0]]);cas.mockImplementationOnce(async input=>{attempts.set(input.attemptId,"UNKNOWN");return {state:"UNKNOWN"};});await executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},options());time=new Date(time.getTime()+31000);expect(await reconcilePriceWriteback(p,{operationId:op.id},options())).toMatchObject({state:"UNKNOWN",items:[{reason:"TERMINAL_OUTCOME_UNCONFIRMED"}]});const next=await approved([ids[0]]);expect(await executePriceWriteback(p,{operationId:next.id,previewHash:next.previewHash},options())).toMatchObject({items:[{reason:"PRICE_PRODUCT_OUTCOME_UNRESOLVED"}]});expect(cas).toHaveBeenCalledTimes(1);
});
it("preserves partial success and requires a separately approved compensation preview",async()=>{
 const op=await approved();const original=cas.getMockImplementation()!;cas.mockImplementationOnce(original).mockImplementationOnce(async()=>({state:"REJECTED"}));const done=await executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},options());expect(done.state).toBe("PARTIAL");expect(done.items[0].state).toBe("SUCCEEDED");const restore=await previewPriceWriteback(p,{exportId,skuIds:[op.items[0].skuId],compensatesId:op.id},options());expect(restore).toMatchObject({state:"DRAFT",direction:"RESTORE"});expect(cas).toHaveBeenCalledTimes(2);const approval=await approvePriceWriteback(p,{operationId:restore.id,previewHash:restore.previewHash,reference:"explicit restore approval"},options());expect((await executePriceWriteback(p,{operationId:approval.id,previewHash:approval.previewHash},options())).state).toBe("SUCCEEDED");expect(products.get(op.items[0].productId)!.price).toBe(op.items[0].oldPrice);
});
it("refuses compensation after a later merchant edit even when the same numeric price is restored",async()=>{
 const op=await approved([ids[0]]);await executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},options());products.set(op.items[0].productId,{price:op.items[0].newPrice,version:"later-merchant-edit"});await expect(previewPriceWriteback(p,{exportId,skuIds:[op.items[0].skuId],compensatesId:op.id},options())).rejects.toMatchObject({code:"PRICE_COMPENSATION_CONFLICT"});expect(cas).toHaveBeenCalledTimes(1);
});
it("enforces the shared write-call cap including a partially completed batch",async()=>{
 const o={...options(),access:{...access(),maxWrites:1}},draft=await previewPriceWriteback(p,{exportId,skuIds:ids.slice(0,2),compensatesId:null},o),op=await approvePriceWriteback(p,{operationId:draft.id,previewHash:draft.previewHash,reference:"synthetic quota"},o);expect(await executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},o)).toMatchObject({state:"PARTIAL",items:[{state:"SUCCEEDED"},{state:"FAILED",reason:"PRICE_ACCOUNT_QUOTA_EXCEEDED"}]});expect(cas).toHaveBeenCalledTimes(1);
});
it("recovers a crashed preflight without replaying any write",async()=>{
 const op=await approved([ids[0]]);await f.pg.query(`UPDATE "MerchandisingAction" SET after=after||$2::jsonb WHERE id=$1`,[op.id,JSON.stringify({state:"PREFLIGHT",startedAt:time.toISOString()})]);time=new Date(time.getTime()+31000);expect(await reconcilePriceWriteback(p,{operationId:op.id},options())).toMatchObject({state:"FAILED",items:[{reason:"INTERRUPTED_BEFORE_DISPATCH"}]});expect(cas).not.toHaveBeenCalled();
});
it("can reconcile the original account after import/source freshness changes and credential rotation",async()=>{
 const op=await approved([ids[0]]),original=cas.getMockImplementation()!;cas.mockImplementationOnce(async input=>{await original(input);return {state:"UNKNOWN"};});await executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},options());await f.pg.exec(`INSERT INTO "ConnectorSelection" ("tenantId","sourceId",revision,"updatedAt") VALUES ('a','source',109,now());UPDATE "ConnectorConnection" SET revision=2 WHERE "tenantId"='a'`);time=new Date(time.getTime()+31000);
 const recovered=await reconcilePriceWriteback(p,{operationId:op.id},{...options(),access:{...access(),connectionRevision:2}});expect(recovered).toMatchObject({state:"RECONCILED",reconciliation:{by:"owner"},items:[{state:"RECONCILED_APPLIED"}]});expect(cas).toHaveBeenCalledTimes(1);
});
it("retains a persisted dispatch reservation if audit settlement fails after remote success",async()=>{
 const op=await approved([ids[0]]);let fail=true;const db={...f.db,$transaction:<T>(fn:Parameters<typeof f.db.$transaction<T>>[0])=>f.db.$transaction(tx=>fn({...tx,$executeRaw:async q=>{if(fail&&cas.mock.calls.length&&q.text.includes('UPDATE "MerchandisingAction" SET context=')){fail=false;throw Error("synthetic post-dispatch DB outage");}return tx.$executeRaw(q);}}))};
 await expect(executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},{...options(),db})).rejects.toThrow("synthetic post-dispatch");expect(await readPriceWriteback(p,op.id,f.db)).toMatchObject({state:"DISPATCHING",items:[{state:"DISPATCHING"}]});expect((await executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},options())).state).toBe("DISPATCHING");expect(cas).toHaveBeenCalledTimes(1);time=new Date(time.getTime()+31000);expect((await reconcilePriceWriteback(p,{operationId:op.id},options())).state).toBe("RECONCILED");expect(cas).toHaveBeenCalledTimes(1);
});

it("does not claim a later same-price merchant edit as its own verified write for compensation",async()=>{
 const op=await approved([ids[0]]),original=cas.getMockImplementation()!;cas.mockImplementationOnce(async input=>{const ack=await original(input);products.set(input.productId,{price:input.newPrice,version:"merchant-after-write-before-readback"});return ack;});
 expect(await executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},options())).toMatchObject({state:"UNKNOWN",items:[{state:"UNKNOWN",observedVersion:"merchant-after-write-before-readback"}]});time=new Date(time.getTime()+31000);expect((await reconcilePriceWriteback(p,{operationId:op.id},options())).state).toBe("RECONCILED");await expect(previewPriceWriteback(p,{exportId,skuIds:[ids[0]],compensatesId:op.id},options())).rejects.toMatchObject({code:"PRICE_COMPENSATION_NOT_ELIGIBLE"});
});
it("uses a fresh same-account snapshot for separately approved restoration after a normal source refresh",async()=>{
 const op=await approved([ids[0]]);await executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},options());await f.pg.exec(`INSERT INTO "ConnectorSelection" ("tenantId","sourceId",revision,"updatedAt") VALUES ('a','source',109,now())`);
 const fresh=await createScreenSnapshot("a",screenSelection,f.db);
 await expect(previewPriceWriteback(p,{exportId,skuIds:[ids[0]],compensatesId:op.id},options())).rejects.toMatchObject({code:"AI_CONTEXT_STALE"});
 const restore=await previewPriceWriteback(p,{exportId,skuIds:[ids[0]],compensatesId:op.id,currentSnapshotId:fresh.snapshotId},options());expect(restore.binding.snapshotId).toBe(fresh.snapshotId);const a=await approvePriceWriteback(p,{operationId:restore.id,previewHash:restore.previewHash,reference:"new snapshot restore approval"},options());expect((await executePriceWriteback(p,{operationId:a.id,previewHash:a.previewHash},options())).state).toBe("SUCCEEDED");
});

it("rejects compensation remapped to another product even with a colliding price and version",async()=>{
 const op=await approved([ids[0]]),done=await executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},options()),item=done.items[0],beforeReads=read.mock.calls.length;
 products.set("remapped-product109",{price:item.newPrice,version:item.observedVersion!});
 await f.pg.query(`UPDATE "SkuAlias" SET value='remapped-product109' WHERE "tenantId"='a' AND "sourceId"='source' AND "skuId"=$1 AND type='SOURCE_PRODUCT_ID'`,[item.skuId]);
 try{await expect(previewPriceWriteback(p,{exportId,skuIds:[item.skuId],compensatesId:op.id},options())).rejects.toMatchObject({code:"PRICE_COMPENSATION_PRODUCT_CHANGED"});expect(read).toHaveBeenCalledTimes(beforeReads);expect(cas).toHaveBeenCalledTimes(1);expect(products.get("remapped-product109")).toEqual({price:item.newPrice,version:item.observedVersion});}
 finally{await f.pg.query(`UPDATE "SkuAlias" SET value=$2 WHERE "tenantId"='a' AND "sourceId"='source' AND "skuId"=$1 AND type='SOURCE_PRODUCT_ID'`,[item.skuId,item.productId]);}
});
it("keeps unresolved operations actor-owned when the original actor loses access; recovery cannot impersonate them",async()=>{
 const op=await approved([ids[0]]);cas.mockImplementationOnce(async input=>{attempts.set(input.attemptId,"UNKNOWN");return {state:"UNKNOWN"};});await executePriceWriteback(p,{operationId:op.id,previewHash:op.previewHash},options());time=new Date(time.getTime()+31000);
 await f.pg.exec(`INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('recovery-admin109','recovery-admin109@test.invalid','test','Recovery admin','ADMIN','a',now());UPDATE "User" SET role='VIEWER' WHERE id='owner';`);
 try{
  await expect(readPriceWriteback(p,op.id,f.db)).rejects.toMatchObject({code:"AI_FORBIDDEN"});
  const recovery={tenantId:"a",userId:"recovery-admin109"};await expect(readPriceWriteback(recovery,op.id,f.db)).rejects.toMatchObject({code:"PRICE_OPERATION_NOT_FOUND"});await expect(reconcilePriceWriteback(recovery,{operationId:op.id},options())).rejects.toMatchObject({code:"PRICE_OPERATION_NOT_FOUND"});
  const row=(await f.pg.query<{actorId:string;after:{state:string;actorId:string;items:Array<{state:string}>}}>(`SELECT "actorId",after FROM "MerchandisingAction" WHERE id=$1`,[op.id])).rows[0];expect(row).toMatchObject({actorId:"owner",after:{actorId:"owner",state:"UNKNOWN",items:[{state:"UNKNOWN"}]}});expect(cas).toHaveBeenCalledTimes(1);
 }finally{await f.pg.exec(`UPDATE "User" SET role='ADMIN' WHERE id='owner';`);}
});
