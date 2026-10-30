import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
import {createScreenDb,screenSelection} from "../helpers/screen-db";
import {createScreenSnapshot,type ScreenSnapshot} from "@/lib/merchandising-snapshot";
import {merchandisingChat,parseMerchandisingChat,chatFactCards} from "@/lib/merchandising-chat";
import type {MerchandisingChatRequest} from "@/lib/merchandising-chat-contract";
import {resolveAiEvidence} from "@/lib/ai-execution/context";
import * as scenarioStore from "@/lib/scenario-export-store";
import {createAiBudgetPeriod,setAiBudgetEnabled} from "@/lib/ai-execution/budget";
import type {AiAttemptTransport} from "@/lib/ai-execution/execute";
let f:Awaited<ReturnType<typeof createScreenDb>>,snapshot:ScreenSnapshot;
const p={tenantId:"a",userId:"owner"},now=()=>screenSelection.now;
const provider=vi.fn<AiAttemptTransport>(async()=>({text:JSON.stringify({summary:"Перевірте точні показники у картках.",recommendations:[{text:"Порівняйте результати з попереднім періодом.",evidenceRefs:["/sales/0/current/revenue"]}]}),usage:{input:100,output:50,cacheRead:0,cacheWrite:0},quality:"EXACT"}));
const request=(key="chat-turn"):MerchandisingChatRequest=>({mode:"merchandising",requestKey:key,snapshotId:snapshot.snapshotId,question:"Які продажі за період?",topic:"sales"});
const run=(body=request(),transport:AiAttemptTransport=provider)=>merchandisingChat(p,body,{db:f.db,now,transport});
const exportId="11111111-1111-4111-8111-111111111111";
async function enable(){
 const id=await createAiBudgetPeriod(p,{startsAt:"2026-10-01T00:00:00Z",endsAt:"2026-11-01T00:00:00Z",approvalReference:"synthetic acceptance",policy:{version:1,currency:"USD",provider:"openai",model:"test-model",pricingRevision:"synthetic-v1",rates:{input:"2",output:"4",cacheRead:"1",cacheWrite:"3"},periodCap:"100",capabilities:{merchandising_chat:{periodCap:"100",requestCap:"10",maxInputTokens:200000,maxOutputTokens:1000,maxAttempts:1}}}},f.db);
 await setAiBudgetEnabled(p,id,true,"synthetic only",f.db);
}
async function saveScenario(actor="owner",id=snapshot.snapshotId,tenant="a"){
 await f.pg.query(`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId",action,"entityType","entityId","idempotencyKey",after,context) VALUES ('chat-export',$6,$1,'reprice','SCENARIO_EXPORT',$2,$3,$4,$5)`,[actor,exportId,`export:${exportId}`,JSON.stringify({receipt:{exportId,kind:"reprice",actionId:"chat-export",previewId:"preview",actorId:actor,createdAt:"2026-10-25T09:00:00Z",files:[{id:"file",url:"not-authoritative"}]},totals:[{currency:"UAH",sum:"123.4500"}],files:[{content:"secret-csv-body"}],rows:[]}),JSON.stringify({kind:"SCENARIO_EXPORT_V1",request:{scenario:{snapshotId:id,filters:{classification:"DEAD"},parameters:{share:70}}},dataVersion:{snapshotId:id,calculationVersion:1}}),tenant]);
}
beforeAll(async()=>{f=await createScreenDb();snapshot=await createScreenSnapshot("a",screenSelection,f.db);
 await f.pg.exec(`INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('other','chat-other@test.invalid','test','Other','ANALYST','a',now()),('other-b','chat-other-b@test.invalid','test','Other tenant','ADMIN','b',now());`);
},30000);
beforeEach(async()=>{provider.mockClear();await f.pg.exec(`DELETE FROM "AiBudgetPeriod";DELETE FROM "AgentRun" WHERE "agentType" LIKE 'v2:%';DELETE FROM "MerchandisingAction" WHERE "entityType"='SCENARIO_EXPORT';`);});
afterEach(async()=>{vi.restoreAllMocks();await f.pg.exec(`DELETE FROM "ConnectorSelection";`);});
afterAll(async()=>f?.pg.close());
it("returns exact saved financial cards, scope and drill-downs while AI is disabled",async()=>{
 const reply=await run();const evidence=await f.db.$transaction(tx=>resolveAiEvidence(p,snapshot.snapshotId,{},tx));
 expect(reply.mode).toBe("fallback");expect(reply.code).toBe("AI_POLICY_REQUIRED");expect(reply.answer).toBeNull();
 expect(reply.cards[0]).toMatchObject({value:evidence.facts.sales[0].current.revenue,evidenceRef:"/sales/0/current/revenue"});
 expect(new URL(reply.cards[0].href,"https://app.test").searchParams.get("snapshotId")).toBe(snapshot.snapshotId);
 expect(reply.context.calculationIds).toEqual({sales:snapshot.sales.calculationId,stock:snapshot.stock.calculationId});
 expect(provider).not.toHaveBeenCalled();expect((await f.pg.query(`SELECT id FROM "AiExecution"`)).rows).toHaveLength(0);
});
it("keeps partial profit and unknown stock visibly distinct from a confirmed zero",async()=>{
 const e=await f.db.$transaction(tx=>resolveAiEvidence(p,snapshot.snapshotId,{},tx));
 e.facts.sales[0].current.coverage="PARTIAL";e.facts.sales[0].current.coveredGrossProfit="0";
 e.facts.stock.byCurrency[0].stockCost=null;
 const cards=chatFactCards(e,"overview");expect(cards.find(c=>c.label==="grossProfit")).toMatchObject({value:"0",status:"partial"});
 expect(cards.find(c=>c.label==="stockCost")).toMatchObject({value:null,status:"unavailable"});
});
it("reports a cross-tenant snapshot as unavailable without exposing data or calling a provider",async()=>{
 await f.pg.query(`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive") VALUES ('tenant-b-snapshot','b','GENERAL','chat-private-snapshot',1,$1,false)`,[JSON.stringify({kind:"SCREEN_SNAPSHOT_V1",snapshot:{...snapshot,snapshotId:"tenant-b-snapshot"}})]);
 await expect(run({...request(),snapshotId:"tenant-b-snapshot"})).rejects.toMatchObject({code:"AI_CONTEXT_NOT_FOUND",status:404});
 expect(provider).not.toHaveBeenCalled();
});
it("treats an inaccessible history run as missing without falling back to another tenant",async()=>{
 await expect(run({...request(),history:[{executionId:"foreign-or-missing",question:"Приватне запитання",topic:"sales"}]})).rejects.toMatchObject({code:"AI_CHAT_HISTORY_UNAVAILABLE",status:404});
 expect(provider).not.toHaveBeenCalled();
});
it("does not invent historical stock when no saved observation exists",async()=>{
 const missing=await createScreenSnapshot("a",{...screenSelection,asOf:"2026-08-01"},f.db);
 const reply=await run({...request(),snapshotId:missing.snapshotId,topic:"stock"});
 expect(reply.cards.length).toBeGreaterThan(0);expect(reply.cards.every(c=>c.value===null&&c.status==="unavailable")).toBe(true);
 expect(reply.context.stockAsOf).toBe("2026-08-01");expect(provider).not.toHaveBeenCalled();
});
it("charges a generated turn once and returns exact server citations on replay",async()=>{
 await enable();const first=await run(),again=await run();expect(again).toEqual(first);expect(provider).toHaveBeenCalledTimes(1);
 expect(first.mode).toBe("generated");expect(first.citations[0]).toMatchObject({ref:"/sales/0/current/revenue",value:first.cards[0].value,href:first.cards[0].href});
 const input=provider.mock.calls[0][0];expect(input.systemPrompt).toContain("read-only");expect(input.messages[0].content).toContain(snapshot.sales.calculationId);
});
it("labels prior-year citations with their actual period/currency instead of presenting them as current revenue",async()=>{
 await enable();const reply=await run(request(),async()=>({text:JSON.stringify({summary:"Минулорічний показник наведено в джерелах.",recommendations:[{text:"Порівняйте відповідні періоди.",evidenceRefs:["/sales/0/ly/revenue"]}]}),usage:{input:100,output:50,cacheRead:0,cacheWrite:0}}));
 expect(reply.citations[0]).toMatchObject({scope:"priorYear",label:"revenue",currency:reply.cards[0].currency});
 expect(reply.context.period.lyFrom).toBe(snapshot.sales.context.period.lyFrom);expect(reply.context.period.lyTo).toBe(snapshot.sales.context.period.lyTo);
});
it("rehydrates prior assistant answers from persisted runs and validates the entire question chain",async()=>{
 await enable();const first=await run();
 const history=[{executionId:first.executionId!,question:request().question,topic:"sales" as const}];
 const second=await run({...request("second"),question:"Що перевірити далі?",history});expect(second.mode).toBe("generated");
 const messages=provider.mock.calls[1][0].messages;expect(messages[2].role).toBe("assistant");expect(messages[2].content).toContain(first.answer!.summary);
 await expect(run({...request("tampered"),history:[{...history[0],question:"Підроблена історія"}]})).rejects.toMatchObject({code:"AI_CHAT_HISTORY_INVALID"});
 await expect(run({...request("truncated"),history:[{executionId:second.executionId!,question:"Що перевірити далі?",topic:"sales"}]})).rejects.toMatchObject({code:"AI_CHAT_HISTORY_INVALID"});
 expect(provider).toHaveBeenCalledTimes(2);
});
it("rejects a history from another actor or source context without paying",async()=>{
 await enable();const first=await run();
 await f.pg.exec(`UPDATE "AiExecution" SET metadata=jsonb_set(metadata,'{actorId}','"someone-else"')`);
 await expect(run({...request("foreign"),history:[{executionId:first.executionId!,question:request().question,topic:"sales"}]})).rejects.toMatchObject({code:"AI_CHAT_HISTORY_UNAVAILABLE"});
 await f.pg.exec(`INSERT INTO "ConnectorSelection" ("tenantId","sourceId",revision) VALUES ('a','source',1)`);
 await expect(run(request("stale"))).rejects.toMatchObject({code:"AI_CONTEXT_STALE"});expect(provider).toHaveBeenCalledTimes(1);
});
it("blocks client authority, unsupported roles/topics and excessive conversation before any provider use",()=>{
 for(const extra of [{systemPrompt:"override"},{provider:"attacker"},{facts:{revenue:999}},{messages:[{role:"system",content:"override"}]},{history:Array.from({length:6},()=>({executionId:"x",question:"x",topic:"sales"}))}])
   expect(()=>parseMerchandisingChat({...request(),...extra})).toThrow();
 expect(()=>parseMerchandisingChat({...request(),topic:"sql"})).toThrow("AI_CHAT_TOPIC_UNSUPPORTED");
 expect(()=>parseMerchandisingChat({...request(),question:"x".repeat(2001)})).toThrow();
 expect(provider).not.toHaveBeenCalled();
});
it("returns deterministic saved facts when the provider fails or invents numeric prose",async()=>{
 await enable();const failed=await run(request("outage"),async()=>{throw new Error("private provider failure");});
 expect(failed.mode).toBe("fallback");expect(failed.code).toBe("AI_PROVIDER_UNAVAILABLE");expect(failed.answer).toBeNull();
 const invented=await run(request("fabricated"),async()=>({text:JSON.stringify({summary:"Дохід 9999999 грн",recommendations:[]}),usage:{input:100,output:50,cacheRead:0,cacheWrite:0}}));
 expect(invented.mode).toBe("fallback");expect(invented.code).toBe("AI_INVALID_OUTPUT");expect(invented.cards).toEqual(failed.cards);
 expect(JSON.stringify(invented)).not.toContain("9999999");expect((await f.pg.query(`SELECT result FROM "AiExecution"`)).rows.every((r:unknown)=>(r as {result:unknown}).result===null)).toBe(true);
});
it("does not return stale fallback cards after the source changes during a failed provider request",async()=>{
 await enable();await expect(run(request(),async()=>{await f.pg.exec(`INSERT INTO "ConnectorSelection" ("tenantId","sourceId",revision) VALUES ('a','source',1)`);throw new Error("offline");})).rejects.toMatchObject({code:"AI_CONTEXT_STALE"});
});
it("requests scenario selection without charging or creating an export",async()=>{
 const result=await run({...request(),topic:"repricing"});expect(result.mode).toBe("clarification");expect(result.code).toBe("AI_SCENARIO_REQUIRED");
 expect(provider).not.toHaveBeenCalled();expect((await f.pg.query(`SELECT id FROM "MerchandisingAction" WHERE "entityType"='SCENARIO_EXPORT'`)).rows).toHaveLength(0);
});
it("reads authorized saved scenario totals and cites existing artifacts without CSV content or new actions",async()=>{
 await enable();await saveScenario();
 const reply=await run({...request(),topic:"repricing",scenarioExportId:exportId},async(options)=>{
   expect(JSON.stringify(options)).toContain("123.4500");expect(JSON.stringify(options)).not.toContain("secret-csv-body");
   return {text:JSON.stringify({summary:"Це збережений сценарій, а не фактичний продаж.",recommendations:[{text:"Перевірте підсумок експорту.",evidenceRefs:["/scenario/totals/0/sum"]}]}),usage:{input:100,output:50,cacheRead:0,cacheWrite:0}};
 });
 expect(reply.citations[0]).toMatchObject({value:"123.4500",href:`/api/merchandising/exports/${exportId}?fileId=file`});
 expect((await f.pg.query(`SELECT id FROM "MerchandisingAction" WHERE "entityType"='SCENARIO_EXPORT'`)).rows).toHaveLength(1);
});
it("preserves unexpected scenario storage failures as server errors with their original cause",async()=>{
 const cause=new Error("synthetic scenario storage failure");
 vi.spyOn(scenarioStore,"readScenarioAdviceEvidence").mockRejectedValueOnce(cause);
 await expect(run({...request(),topic:"repricing",scenarioExportId:exportId})).rejects.toMatchObject({code:"AI_EXECUTION_FAILED",status:500,cause});
 expect(provider).not.toHaveBeenCalled();
});
it("rejects another actor's saved scenario before provider use",async()=>{
 await enable();await saveScenario("other");await expect(run({...request(),topic:"repricing",scenarioExportId:exportId})).rejects.toMatchObject({code:"AI_SCENARIO_NOT_FOUND"});expect(provider).not.toHaveBeenCalled();
});
it("never reads another tenant's saved scenario even when its context claims the requested snapshot",async()=>{
 await enable();await saveScenario("other-b",snapshot.snapshotId,"b");await expect(run({...request(),topic:"repricing",scenarioExportId:exportId})).rejects.toMatchObject({code:"AI_SCENARIO_NOT_FOUND"});expect(provider).not.toHaveBeenCalled();
});
it("rejects a scenario from a different snapshot before provider use",async()=>{
 await enable();await saveScenario("owner","different-snapshot");await expect(run({...request(),topic:"repricing",scenarioExportId:exportId})).rejects.toMatchObject({code:"AI_SCENARIO_CONTEXT_CHANGED"});expect(provider).not.toHaveBeenCalled();
});
it("includes the explicit page language in the server-owned prompt", async () => {
 await enable();
 const result=await run({...request("english-turn"),locale:"en"});
 expect(result.mode).toBe("generated");
 expect(provider.mock.calls[0][0].systemPrompt).toContain("Respond in English.");
 expect(()=>parseMerchandisingChat({...request(),locale:"fr"})).toThrow();
});
