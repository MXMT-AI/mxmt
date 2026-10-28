import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
import {createScreenDb,screenSelection} from "../helpers/screen-db";
import {createScreenSnapshot,type ScreenSnapshot} from "@/lib/merchandising-snapshot";
import {generateMarketingBrief,approveMarketingBrief} from "@/lib/marketing-briefs";
import {parseMarketingBrief} from "@/lib/marketing-brief-contract";
import {createAiBudgetPeriod,setAiBudgetEnabled} from "@/lib/ai-execution/budget";
import type {AiAttemptTransport} from "@/lib/ai-execution/execute";
import {parseMarketingOutput} from "@/lib/marketing-brief-output";
let f:Awaited<ReturnType<typeof createScreenDb>>,snapshot:ScreenSnapshot;
const p={tenantId:"a",userId:"owner"},exportId="95aabbcc-1122-4123-8123-001122334455";
const copy=()=>({objective:"Показати добірку бренду.",message:"Знайдіть речі для власного стилю.",cta:"Переглянути добірку",assets:["Фото товарів","Макет повідомлення"],evidenceRefs:["/scenario/receipt/previewId"]});
const output=()=>({drafts:{paid_social:copy(),smm:copy(),website:copy()}});
const transport=vi.fn<AiAttemptTransport>(async()=>({text:JSON.stringify(output()),usage:{input:100,output:100,cacheRead:0,cacheWrite:0}}));
const request=()=>({mode:"marketing_v2",briefId:"launch",revision:1,snapshotId:snapshot.snapshotId,scenarioExportId:exportId,kind:"reprice",brandId:"brand-a",channels:["paid_social","smm","website"],audience:"Покупці бренду",brandVoice:"Спокійний і конкретний",campaign:{from:"2026-11-01",to:"2026-11-07"},budget:{amount:"1000.00",currency:"UAH"}});
const generate=(value:unknown=request(),provider:AiAttemptTransport=transport)=>generateMarketingBrief(p,value,{db:f.db,now:()=>screenSelection.now,transport:provider});
const approve=(draftId:string,phase="offer",actor=p)=>approveMarketingBrief(actor,{briefId:"launch",draftId,phase},f.db,screenSelection.now);
async function enable(requestCap="10"){
 const id=await createAiBudgetPeriod(p,{startsAt:"2026-10-01T00:00:00Z",endsAt:"2026-11-01T00:00:00Z",approvalReference:"synthetic owner decision",policy:{version:1,currency:"USD",provider:"openai",model:"fixture",pricingRevision:"fixture",rates:{input:"2",output:"4",cacheRead:"1",cacheWrite:"3"},periodCap:"10",capabilities:{marketing_briefs:{periodCap:"10",requestCap,maxInputTokens:40000,maxOutputTokens:6000,maxAttempts:2}}}},f.db);
 await setAiBudgetEnabled(p,id,true,"synthetic activation",f.db);
}
beforeAll(async()=>{
 f=await createScreenDb();snapshot=await createScreenSnapshot("a",screenSelection,f.db);
 await f.pg.exec(`INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('analyst','analyst95@test.invalid','test','Analyst','ANALYST','a',now()),('other','other95@test.invalid','test','Other','ADMIN','b',now());`);
},30000);
beforeEach(async()=>{
 transport.mockClear();
 await f.pg.exec(`DELETE FROM "MarketingEvent";DELETE FROM "AiBudgetPeriod";DELETE FROM "AgentRun" WHERE "agentType" LIKE 'v2:%';DELETE FROM "MerchandisingAction";`);
 await f.pg.query(`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId",action,"entityType","entityId","idempotencyKey",after,context) VALUES ('export','a','owner','reprice','SCENARIO_EXPORT',$1,$2,$3,$4)`,[exportId,`export:${exportId}`,JSON.stringify({receipt:{exportId,kind:"reprice",actionId:"export",previewId:"frozen-preview",actorId:"owner",createdAt:"2026-10-25T09:00:00Z",files:[{id:"file"}]},totals:[{currency:"UAH",sum:"123.4500"}],files:[{content:"private-csv"}],rows:[{skuId:"sku-a",sku:"A",name:"Alpha",quantity:"12.0000",oldPrice:"20.0000",newPrice:"15.0000",effectiveDiscount:"0.2500",currency:"UAH",unitCost:"private-cost"}]}),JSON.stringify({kind:"SCENARIO_EXPORT_V1",request:{scenario:{snapshotId:snapshot.snapshotId,filters:{brandId:"brand-a"}}},dataVersion:{snapshotId:snapshot.snapshotId,calculationVersion:1}})]);
});
afterEach(async()=>{await f.pg.exec(`DELETE FROM "ConnectorSelection";`);});
afterAll(async()=>f?.pg.close());
it("returns a labeled factual draft when AI is disabled without a provider call or approved offer",async()=>{
 const d=await generate();expect(d.status).toBe("draft");expect(d.approvalRequired).toBe(true);expect(d.channels).toHaveLength(3);
 expect(d.channels.every(c=>c.mode==="factual_fallback"&&c.reason==="AI_POLICY_REQUIRED")).toBe(true);expect(d.usage).toBeNull();expect(transport).not.toHaveBeenCalled();
 expect(d.offer.offerRows![0]).toMatchObject({oldPrice:"20.0000",newPrice:"15.0000",effectiveDiscount:"0.2500"});expect(JSON.stringify(d)).not.toContain("private-csv");expect(JSON.stringify(d)).not.toContain("private-cost");
});
it("reserves the entire selected channel request once, records actual usage and reuses the same revision",async()=>{
 await enable();const d=await generate(),replayed=await generate();expect(replayed).toEqual(d);expect(transport).toHaveBeenCalledTimes(1);
 expect(d.usage).toMatchObject({state:"DONE",charged:"0.00060000",held:"0.00000000",currency:"USD"});expect(d.channels.every(c=>c.mode==="generated")).toBe(true);
 expect(d.channels.map(c=>c.timing)).toEqual([request().campaign,request().campaign,request().campaign]);
 const [options]=transport.mock.calls[0];expect(options.systemPrompt).toContain("website");expect(options.messages[0].content).toContain('"newPrice":"15.0000"');expect(options.maxTokens).toBe(6000);
 expect((await f.pg.query(`SELECT id FROM "AiExecution"`)).rows).toHaveLength(1);
});
it("preserves good channels and their incurred usage when another channel invents a discount",async()=>{
 await enable();const o=output();o.drafts.paid_social.message="Знижка 90% гарантована";
 const d=await generate(request(),async()=>({text:JSON.stringify(o),usage:{input:100,output:100,cacheRead:0,cacheWrite:0}}));
 expect(d.channels.find(c=>c.channel==="paid_social")).toMatchObject({mode:"factual_fallback",reason:"AI_INVALID_CHANNEL_OUTPUT"});
 expect(d.channels.filter(c=>c.channel!=="paid_social").every(c=>c.mode==="generated")).toBe(true);expect(d.usage?.charged).toBe("0.00060000");expect(JSON.stringify(d)).not.toContain("90%");
});
it("finishes a pending draft from a terminal saved execution without another paid call",async()=>{
 await enable();const original=await generate();
 await f.pg.query(`UPDATE "MerchandisingAction" SET after=after-'draft'||'{"state":"PENDING"}'::jsonb WHERE id=$1`,[original.draftId]);
 const resumed=await generate();expect(resumed).toEqual(original);expect(transport).toHaveBeenCalledTimes(1);
});
it("rejects an in-flight duplicate without charging a second request",async()=>{
 await enable();let release!:()=>void,entered!:()=>void;
 const ready=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 const provider=vi.fn<AiAttemptTransport>(async()=>{entered();await gate;return {text:JSON.stringify(output()),usage:{input:100,output:100,cacheRead:0,cacheWrite:0}};});
 const running=generate(request(),provider);await ready;
 try{await expect(generate(request(),provider)).rejects.toMatchObject({code:"AI_EXECUTION_IN_PROGRESS"});}finally{release();}
 expect((await running).usage?.state).toBe("DONE");expect(provider).toHaveBeenCalledTimes(1);
});
it("checks the whole request including all retry allowances before any channel is generated",async()=>{
 await enable("0.1");const d=await generate();expect(d.channels.every(c=>c.mode==="factual_fallback")).toBe(true);expect(transport).not.toHaveBeenCalled();expect((await f.pg.query(`SELECT id FROM "AiUsageAttempt"`)).rows).toHaveLength(0);
});
it("uses factual fallbacks after an invalid whole response while retaining the charged execution",async()=>{
 await enable();const d=await generate(request(),async()=>({text:"not-json",usage:{input:100,output:100,cacheRead:0,cacheWrite:0}}));
 expect(d.channels.every(c=>c.reason==="AI_INVALID_OUTPUT")).toBe(true);expect(d.usage).toMatchObject({state:"ERROR",charged:"0.00060000"});expect(d.executionId).toBeTruthy();
});
it("conservatively records failed provider attempts without inventing generated drafts",async()=>{
 await enable();const provider=vi.fn<AiAttemptTransport>(async()=>{throw Error("private failure");});const d=await generate(request(),provider);
 expect(provider).toHaveBeenCalledTimes(2);expect(d.channels.every(c=>c.mode==="factual_fallback")).toBe(true);expect(Number(d.usage!.charged)).toBeGreaterThan(0);expect(d.usage?.state).toBe("ERROR");expect(JSON.stringify(d)).not.toContain("private failure");
});
it("requires a new sequential revision after a budget, date, audience or channel change",async()=>{
 const d=await generate();await approve(d.draftId);
 await expect(generate({...request(),audience:"Інша аудиторія"})).rejects.toMatchObject({code:"AI_MARKETING_REVISION_CONFLICT"});
 const next=await generate({...request(),revision:2,audience:"Інша аудиторія"});expect(next.draftId).not.toBe(d.draftId);
 await expect(approve(d.draftId,"calendar")).rejects.toMatchObject({code:"AI_MARKETING_DRAFT_STALE"});
 await expect(approve(next.draftId,"calendar")).rejects.toMatchObject({code:"AI_MARKETING_OFFER_NOT_APPROVED"});
 await expect(generate({...request(),revision:4})).rejects.toMatchObject({code:"AI_MARKETING_REVISION_CONFLICT"});
});
it("requires owner approval and schedules website/paid social/SMM once without publication",async()=>{
 const d=await generate();await expect(approve(d.draftId,"offer",{tenantId:"a",userId:"analyst"})).rejects.toMatchObject({code:"AI_FORBIDDEN"});
 const approval=await approve(d.draftId);expect(await approve(d.draftId)).toEqual(approval);
 const a=await approve(d.draftId,"calendar"),b=await approve(d.draftId,"calendar");expect(a).toMatchObject({created:3});expect(b).toMatchObject({created:0});
 const events=(await f.pg.query<{rowKey:string;source:string}>(`SELECT "rowKey",source FROM "MarketingEvent"`)).rows;expect(events.map(e=>e.rowKey).sort()).toEqual(["ads1","ban1","smm1"]);expect(events.every(e=>e.source==="agent")).toBe(true);
});
it("marks old calendar tasks stale when a new draft revision is claimed",async()=>{
 const d=await generate();await approve(d.draftId);await approve(d.draftId,"calendar");await generate({...request(),revision:2});
 const events=(await f.pg.query<{source:string;approvedAt:null;label:string}>(`SELECT source,"approvedAt",label FROM "MarketingEvent"`)).rows;
 expect(events).toHaveLength(3);expect(events.every(e=>e.source==="agent_stale"&&e.approvedAt===null&&e.label.startsWith("[Застарілий бриф]"))).toBe(true);
});
it("discloses missing budget and blocks paid-social calendar handoff without one",async()=>{
 const d=await generate({...request(),budget:null});expect(d.constraints).toContain("BUDGET_NOT_APPROVED");await approve(d.draftId);
 await expect(approve(d.draftId,"calendar")).rejects.toMatchObject({code:"AI_MARKETING_BUDGET_REQUIRED"});expect((await f.pg.query(`SELECT id FROM "MarketingEvent"`)).rows).toHaveLength(0);
});
it("does not describe a reorder as an arrival or silently fill unknown stock",async()=>{
 await f.pg.query(`UPDATE "MerchandisingAction" SET after=jsonb_set(after,'{receipt,kind}','"reorder"')||jsonb_build_object('rows',$1::jsonb) WHERE id='export'`,[JSON.stringify([{skuId:"sku-a",quantity:"8.0000",stock:null,currency:"UAH"}])]);
 const d=await generate({...request(),kind:"reorder"});expect(d.constraints).toEqual(expect.arrayContaining(["STOCK_UNKNOWN","REORDER_IS_NOT_RECEIVED_STOCK"]));expect(d.offer.offerRows![0]).toMatchObject({quantity:"8.0000",stock:null});
 expect(d.channels.find(c=>c.channel==="smm")?.message).toContain("Не публікувати");expect(await approve(d.draftId)).toMatchObject({receivedDelivery:false});
});
it("rejects mismatched scenario brands, foreign tenants and forged approval fields before AI",async()=>{
 await expect(generate({...request(),brandId:"brand-b"})).rejects.toMatchObject({code:"AI_SCENARIO_BRAND_MISMATCH"});
 await expect(generateMarketingBrief({tenantId:"b",userId:"other"},request(),{db:f.db,transport})).rejects.toMatchObject({code:"AI_CONTEXT_UNSUPPORTED"});
 expect(()=>parseMarketingBrief({...request(),approved:true})).toThrow();expect(transport).not.toHaveBeenCalled();
});
it("rejects drafts after source changes, including existing approvals and cached generation",async()=>{
 const d=await generate();await approve(d.draftId);
 await f.pg.exec(`INSERT INTO "ConnectorSelection" ("tenantId","sourceId",revision,"updatedAt") VALUES ('a','source',7,now());`);
 await expect(approve(d.draftId,"calendar")).rejects.toMatchObject({code:"AI_CONTEXT_STALE"});await expect(generate()).rejects.toMatchObject({code:"AI_CONTEXT_STALE"});
});
it.each([{channels:["website","website"]},{campaign:{from:"2026-02-30",to:"2026-03-01"}},{campaign:{from:"2026-11-07",to:"2026-11-01"}},{budget:{amount:"-1",currency:"UAH"}},{budget:{amount:"100",currency:"usd"}},{revision:0},{audience:"x".repeat(501)}])("bounds campaign inputs and rejects invalid revisions: %j",change=>{expect(()=>parseMarketingBrief({...request(),...change})).toThrow();});
it("does not let a channel supply its own evidence URL, numeric offer or unsupported source",()=>{
 const d=output();d.drafts.website.evidenceRefs=["https://evil.invalid"];const result=parseMarketingOutput(JSON.stringify(d),new Set(["/scenario/receipt/previewId"]));
 expect(result.invalidChannels).toContain("website");expect(result.drafts.smm).toBeDefined();expect(result.drafts.website).toBeUndefined();
});
