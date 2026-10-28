import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({prisma: {}}));
import {createScreenDb, screenSelection} from "../helpers/screen-db";
import {createScreenSnapshot, type ScreenSnapshot} from "@/lib/merchandising-snapshot";
import {executeAiCapability, type AiAttemptTransport} from "@/lib/ai-execution/execute";
import {createAiBudgetPeriod, setAiBudgetEnabled, aiTransaction, executionById, beginAiAttempt, settleAiAttempt,
  recoverAiExecution, reconcileAiAttempt} from "@/lib/ai-execution/budget";
import {resolveAiEvidence} from "@/lib/ai-execution/context";
import {attemptAllowance, usageCost, type AiBudgetPolicy, type TokenUsage} from "@/lib/ai-execution/contracts";
import {parseAiAdvice, evidenceReferences} from "@/lib/ai-execution/output";
let f: Awaited<ReturnType<typeof createScreenDb>>, snapshot: ScreenSnapshot, period: string;
const p = {tenantId: "a", userId: "owner"};
const now = () => screenSelection.now;
const capability = {id: "advice", version: "1", promptVersion: "1", systemPrompt: "Explain the supplied facts in Ukrainian."};
const policy = (): AiBudgetPolicy => ({version: 1, currency: "USD", provider: "openai", model: "test-model",
  pricingRevision: "fixture-rates-v1", rates: {input: "2",output: "4",cacheRead: "1",cacheWrite: "3"},periodCap: "1",
  capabilities: {advice: {periodCap: "1",requestCap: "1",maxInputTokens: 40000,maxOutputTokens: 300,maxAttempts: 2}}});
const usage: TokenUsage = {input: 100, output: 20, cacheRead: 10, cacheWrite: 5};
const text = JSON.stringify({summary: "Підсумки містяться у збереженому розрахунку.", recommendations: []});
const transport = vi.fn<AiAttemptTransport>(async () => ({text, usage, quality: "EXACT", requestId: "req-test",model: "served-revision"}));
const input = (key = "request") => ({requestKey: key, snapshotId: snapshot.snapshotId, messages: [{role: "user" as const, content: "Поясни показники"}]});
const execute = (key = "request", provider: AiAttemptTransport = transport) => executeAiCapability(p,capability,input(key),{db:f.db,now,transport:provider});
const balance = async () => (await f.pg.query<{spent: string;reserved: string}>(`SELECT spent::text,reserved::text FROM "AiBudgetPeriod" WHERE id=$1`,[period])).rows[0];
const executions = async () => (await f.pg.query<{id: string;state: string;errorCode: string;metadata: unknown}>(`SELECT id,state,"errorCode",metadata FROM "AiExecution" ORDER BY "createdAt"`)).rows;
async function provision(value = policy(), enabled = true) {
  period = await createAiBudgetPeriod(p,{startsAt: "2026-10-01T00:00:00Z", endsAt:"2026-11-01T00:00:00Z",policy:value,approvalReference:"synthetic owner decision"},f.db);
  if(enabled) await setAiBudgetEnabled(p,period,true,"synthetic activation",f.db);
}
beforeAll(async () => {
  f = await createScreenDb();
  snapshot = await createScreenSnapshot("a",screenSelection,f.db);
  await f.pg.exec(`INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('viewer','viewer@test.invalid','test','Viewer','VIEWER','a',now()),('other','other@test.invalid','test','Other','ADMIN','b',now());`);
},30000);
beforeEach(async () => {
  transport.mockClear();
  await f.pg.exec(`DELETE FROM "AiBudgetPeriod"; DELETE FROM "AgentRun" WHERE "agentType" LIKE 'v2:%';`);
});
afterEach(async () => {
  await f.pg.exec(`DELETE FROM "ConnectorSelection"; UPDATE "SyncCursor" SET checkpoint='{"through":"2026-10-25T09:00:00Z"}' WHERE id='orders-cursor';`);
});
afterAll(async () => await f?.pg.close());

describe("versioned AI execution", () => {
  it.each([{channelId:""},{currency:"usd"},{brandId:"x".repeat(201)}])("reports invalid screen filter values as AI 400 errors without reserving money: %j",async filters=>{
    await provision();
    await expect(executeAiCapability(p,capability,{...input(),filters},{db:f.db,now,transport})).rejects.toMatchObject({code:"AI_INVALID_FILTER",status:400});
    expect(transport).not.toHaveBeenCalled();expect(await executions()).toHaveLength(0);
    expect(await balance()).toEqual({spent:"0.00000000",reserved:"0.00000000"});
  });
  it("creates all five AI foreign keys with Prisma-compatible update/delete cascade actions",async()=>{
    const rows=(await f.pg.query<{update:string;deletion:string}>(`SELECT confupdtype::text AS update,confdeltype::text AS deletion FROM pg_constraint WHERE contype='f' AND conrelid IN ('"AiBudgetPeriod"'::regclass,'"AiExecution"'::regclass,'"AiUsageAttempt"'::regclass)`)).rows;
    expect(rows).toHaveLength(5);
    expect(rows.every(row=>row.update==="c"&&row.deletion==="c")).toBe(true);
  });
  it("distinguishes unsupported legacy context, cross-tenant requests and missing budgets before any provider call", async () => {
    await expect(execute()).rejects.toMatchObject({code:"AI_POLICY_REQUIRED"});
    await expect(executeAiCapability({tenantId:"b",userId:"owner"},capability,input(),{db:f.db,now,transport})).rejects.toMatchObject({code:"AI_FORBIDDEN"});
    await expect(executeAiCapability({tenantId:"b",userId:"other"},capability,input(),{db:f.db,now,transport})).rejects.toMatchObject({code:"AI_CONTEXT_UNSUPPORTED"});
    await expect(executeAiCapability({tenantId:"a",userId:"viewer"},capability,input(),{db:f.db,now,transport})).rejects.toMatchObject({code:"AI_FORBIDDEN"});
    expect(transport).not.toHaveBeenCalled();
  });
  it("requires an explicit activation and rejects overlapping periods without resetting spent", async () => {
    await provision(policy(),false);
    await expect(execute()).rejects.toMatchObject({code:"AI_POLICY_REQUIRED"});
    await expect(createAiBudgetPeriod(p,{startsAt:"2026-10-15T00:00:00Z",endsAt:"2026-11-15T00:00:00Z",policy:policy(),approvalReference:"test"},f.db)).rejects.toMatchObject({code:"AI_PERIOD_OVERLAP"});
    await expect(setAiBudgetEnabled({tenantId:"a",userId:"viewer"},period,true,"test",f.db)).rejects.toMatchObject({code:"AI_FORBIDDEN"});
    expect(transport).not.toHaveBeenCalled();
  });
  it("rejects missing provider configuration before dispatch without billing a nonexistent attempt",async()=>{
    await provision();
    const key=process.env.OPENAI_API_KEY;
    try {
      delete process.env.OPENAI_API_KEY;
      await expect(executeAiCapability(p,capability,input(),{db:f.db,now})).rejects.toMatchObject({code:"AI_CONFIGURATION_ERROR"});
      expect((await f.pg.query(`SELECT id FROM "AiUsageAttempt"`)).rows).toHaveLength(0);
      expect(await balance()).toEqual({spent:"0.00000000",reserved:"0.00000000"});
    } finally {if(key!==undefined)process.env.OPENAI_API_KEY=key;}
  });
  it("pins context/facts/config and model versions, prices separate token categories and replays without a second charge", async () => {
    await provision();
    const result = await execute();
    expect(result.evidence.envelope.sales.id).toBe(snapshot.sales.calculationId);
    expect(result.evidence.envelope.daily.id).toBe(snapshot.stock.calculationId);
    expect(result.evidence.envelope.settings).toEqual(snapshot.settings);
    expect(result.evidence.envelope.stockObservation.observations.missing).toBe(0);
    expect(result.generatedIsAuthoritative).toBe(false);
    expect(await balance()).toEqual({spent:"0.00030500",reserved:"0.00000000"});
    expect(await execute()).toEqual(result);
    expect(transport).toHaveBeenCalledTimes(1);
    const [attempt] = (await f.pg.query(`SELECT usage,quality,"responseModel","requestId" FROM "AiUsageAttempt"`)).rows;
    expect(attempt).toMatchObject({usage,quality:"EXACT",responseModel:"served-revision",requestId:"req-test"});
    const [run] = (await f.pg.query(`SELECT input,status FROM "AgentRun" WHERE id=$1`,[result.runId])).rows;
    expect(run).toMatchObject({status:"done",input:{promptVersion:"1",schemaVersion:"evidence-advice-v1",policy:{pricingRevision:"fixture-rates-v1"}}});
    expect(JSON.stringify(run)).not.toContain("Поясни показники");
    await expect(executeAiCapability(p,{...capability,promptVersion:"2"},input(),{db:f.db,now,transport})).rejects.toMatchObject({code:"AI_IDEMPOTENCY_CONFLICT"});
  });
  it("rejects stale source selection before paid execution and before persisting an otherwise valid answer", async () => {
    await provision();
    const changed: AiAttemptTransport = async () => {
      await f.pg.exec(`INSERT INTO "ConnectorSelection" ("tenantId","sourceId",revision) VALUES ('a','source',1)`);
      return {text,usage,quality:"EXACT"};
    };
    await expect(execute("stale",changed)).rejects.toMatchObject({code:"AI_CONTEXT_STALE"});
    expect((await executions())[0]).toMatchObject({state:"ERROR",errorCode:"AI_CONTEXT_STALE"});
    expect((await balance()).spent).toBe("0.00030500");
    await expect(execute("after-change")).rejects.toMatchObject({code:"AI_CONTEXT_STALE"});
    expect(transport).not.toHaveBeenCalled();
  });
  it("preserves stock scope under channel filters and returns only saved server facts", async () => {
    const all = await f.db.$transaction(tx => resolveAiEvidence(p,snapshot.snapshotId,{},tx));
    const channel = await f.db.$transaction(tx => resolveAiEvidence(p,snapshot.snapshotId,{channelId:"1"},tx));
    expect(channel.facts.stock).toEqual(all.facts.stock);
    expect(channel.facts.sales).not.toEqual(all.facts.sales);
    expect(channel.fingerprint).not.toEqual(all.fingerprint);
  });
  it("charges unknown attempts conservatively and counts explicit retries independently", async () => {
    await provision();
    let count=0;
    const retry: AiAttemptTransport = async () => { if(++count===1) throw new Error("secret upstream prompt contents"); return {text,usage,quality:"EXACT"}; };
    await execute("retry",retry);
    const allowance=attemptAllowance(policy(),policy().capabilities.advice);
    expect((await balance()).spent).toBe(new Prisma.Decimal(allowance).plus("0.000305").toFixed(8));
    expect((await f.pg.query(`SELECT quality FROM "AiUsageAttempt" ORDER BY ordinal`)).rows).toEqual([{quality:"UNKNOWN"},{quality:"EXACT"}]);
    expect(JSON.stringify(await executions())).not.toContain("secret upstream");
  });
  it("retains estimates until verified reconciliation and makes reconciliation idempotent", async () => {
    await provision();
    await execute("estimate",async () => ({text,usage,quality:"ESTIMATED"}));
    const row=(await executions())[0], attempt=(await f.pg.query<{id:string}>(`SELECT id FROM "AiUsageAttempt"`)).rows[0];
    expect((await balance()).spent).toBe(attemptAllowance(policy(),policy().capabilities.advice));
    await reconcileAiAttempt(p,row.id,attempt.id,usage,"verified provider export",f.db);
    await reconcileAiAttempt(p,row.id,attempt.id,usage,"same verified export",f.db);
    expect((await balance()).spent).toBe("0.00030500");
    await expect(reconcileAiAttempt(p,row.id,attempt.id,{...usage,input:101},"different",f.db)).rejects.toMatchObject({code:"AI_USAGE_CONFLICT"});
  });
  it("never treats a missing usage response as free", async () => {
    await provision();
    await execute("no-usage",async () => ({text}));
    expect((await balance()).spent).toBe(attemptAllowance(policy(),policy().capabilities.advice));
  });
  it("charges exact overages in full, fails the answer and blocks subsequent reservations when the period is over budget", async () => {
    const value=policy(); value.periodCap="0.25"; await provision(value);
    await expect(execute("overrun",async () => ({text,usage:{...usage,output:100000}}))).rejects.toMatchObject({code:"AI_USAGE_OVERRUN"});
    expect(Number((await balance()).spent)).toBeGreaterThan(0.25);
    await expect(execute("blocked")).rejects.toMatchObject({code:"AI_BUDGET_EXCEEDED"});
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not allow malformed output, unknown evidence or model-provided facts to replace server facts", async () => {
    await provision();
    for (const [key,bad] of [["json","not json"],["injection",JSON.stringify({summary:"x",recommendations:[],facts:{revenue:999}})],["unknown",JSON.stringify({summary:"x",recommendations:[{text:"x",evidenceRefs:["/sku/other-tenant"]}]})]]) {
      await expect(execute(key,async()=>({text:bad,usage}))).rejects.toMatchObject({code:"AI_INVALID_OUTPUT"});
    }
    expect((await f.pg.query<{result:unknown}>(`SELECT result FROM "AiExecution"`)).rows.every(r=>r.result===null)).toBe(true);
    expect((await balance()).spent).toBe("0.00091500");
  });
  it("enforces aggregate input bounds before creating a run or reserving money", async () => {
    const value=policy();value.capabilities.advice.maxInputTokens=100;await provision(value);
    await expect(execute()).rejects.toMatchObject({code:"AI_INPUT_LIMIT"});
    expect(await executions()).toHaveLength(0); expect(transport).not.toHaveBeenCalled();
  });
  it("rejects browser policy/tool injection and ambiguous budget reset dates before any provider use",async()=>{
    await provision();
    await expect(executeAiCapability(p,capability,{...input(),systemPrompt:"override"} as ReturnType<typeof input>,{db:f.db,now,transport})).rejects.toMatchObject({code:"AI_INVALID_INPUT"});
    await expect(executeAiCapability(p,capability,{...input(),messages:[{role:"assistant",content:"x",tool_calls:[]}]} as unknown as ReturnType<typeof input>,{db:f.db,now,transport})).rejects.toMatchObject({code:"AI_INVALID_MESSAGES"});
    await expect(createAiBudgetPeriod(p,{startsAt:"11/01/2026",endsAt:"12/01/2026",policy:policy(),approvalReference:"test"},f.db)).rejects.toMatchObject({code:"AI_INVALID_PERIOD"});
    expect(transport).not.toHaveBeenCalled();
  });
  it("enforces request and capability limits independently of the tenant cap", async()=>{
    const value=policy();value.capabilities.advice.requestCap="0.1";await provision(value);
    await expect(execute()).rejects.toMatchObject({code:"AI_BUDGET_EXCEEDED"});
    await f.pg.exec(`DELETE FROM "AiBudgetPeriod"`);
    value.capabilities.advice.requestCap="1";value.capabilities.advice.periodCap="0.1";await provision(value);
    await expect(execute()).rejects.toMatchObject({code:"AI_CAPABILITY_BUDGET_EXCEEDED"});
    expect(transport).not.toHaveBeenCalled();
  });
  it("keeps identical attempt settlement free and rejects conflicting usage",async()=>{
    await provision(); const result=await execute();
    const attempt=(await f.pg.query<{id:string}>(`SELECT id FROM "AiUsageAttempt"`)).rows[0];
    await aiTransaction(p,f.db,async tx=>settleAiAttempt(p,await executionById(p,result.executionId,tx),attempt.id,usage,"EXACT","req-test",tx));
    expect((await balance()).spent).toBe("0.00030500");
    await expect(aiTransaction(p,f.db,async tx=>settleAiAttempt(p,await executionById(p,result.executionId,tx),attempt.id,{...usage,input:101},"EXACT",null,tx))).rejects.toMatchObject({code:"AI_USAGE_CONFLICT"});
  });
  it("rejects a mismatched saved calculation header before reserving or calling a provider",async()=>{
    await provision();
    const invalid={...snapshot,snapshotId:"mismatched-ai-snapshot",sales:{...snapshot.sales,inputKey:"wrong-input"}};
    await f.pg.query(`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive") VALUES ('mismatched-ai-snapshot','a','GENERAL','mismatched-ai',1,$1,false)`,[JSON.stringify({kind:"SCREEN_SNAPSHOT_V1",snapshot:invalid})]);
    await expect(executeAiCapability(p,capability,{...input(),snapshotId:invalid.snapshotId},{db:f.db,now,transport})).rejects.toMatchObject({code:"AI_CONTEXT_INCOMPLETE"});
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not turn malformed or truncated provider output into successful authoritative results",async()=>{
    await provision();
    await expect(execute("usage-error",async()=>({text,usage:{...usage,input:-1}}))).rejects.toMatchObject({code:"AI_INVALID_USAGE"});
    await expect(execute("truncated",async()=>({text,usage,complete:false}))).rejects.toMatchObject({code:"AI_OUTPUT_TRUNCATED"});
    expect((await f.pg.query(`SELECT state FROM "AiExecution"`)).rows).toEqual([{state:"ERROR"},{state:"ERROR"}]);
    expect(Number((await balance()).spent)).toBeGreaterThan(Number(attemptAllowance(policy(),policy().capabilities.advice)));
  });
  it("keeps charges in the original period and stops retrying when its explicit UTC end is reached",async()=>{
    await provision(); let calls=0;
    let clock=now();
    await expect(executeAiCapability(p,capability,input("period-end"),{db:f.db,now:()=>clock,transport:async()=>{
      calls++;clock=new Date("2026-11-01T00:00:00Z");throw new Error("unknown outcome");
    }})).rejects.toMatchObject({code:"AI_POLICY_REQUIRED"});
    expect(calls).toBe(1);
    expect(await balance()).toEqual({spent:attemptAllowance(policy(),policy().capabilities.advice),reserved:"0.00000000"});
  });
  it("rolls back run creation and reservations together if the ledger counter write fails",async()=>{
    await provision();
    const broken={...f.db,$transaction:<T>(fn:Parameters<typeof f.db.$transaction<T>>[0])=>f.db.$transaction(tx=>fn({...tx,$executeRaw:async(q:Prisma.Sql)=>{
      if(q.text.startsWith('UPDATE "AiBudgetPeriod" SET reserved=reserved+'))throw new Error("synthetic reserve failure"); return tx.$executeRaw(q);
    }}))};
    await expect(executeAiCapability(p,capability,input(),{db:broken,now,transport})).rejects.toMatchObject({code:"AI_EXECUTION_FAILED"});
    expect(await executions()).toHaveLength(0);expect(transport).not.toHaveBeenCalled();
    expect(await balance()).toEqual({spent:"0.00000000",reserved:"0.00000000"});
    expect((await f.pg.query(`SELECT id FROM "AgentRun" WHERE "agentType" LIKE 'v2:%'`)).rows).toHaveLength(0);
  });
  it("rejects concurrent same-capability requests and idempotency replays while the first provider call is active", async () => {
    await provision();
    let release!:()=>void, entered!:()=>void;
    const ready=new Promise<void>(r=>{entered=r;}), gate=new Promise<void>(r=>{release=r;});
    const running=execute("first",async()=>{entered(); await gate; return {text,usage};});
    await ready;
    await expect(execute("first")).rejects.toMatchObject({code:"AI_EXECUTION_IN_PROGRESS"});
    await expect(execute("second")).rejects.toMatchObject({code:"AGENT_RUN_ALREADY_RUNNING"});
    release(); await running;
    expect(await executions()).toHaveLength(1);
  });
  it("shares the tenant cap across concurrent independent capabilities", async () => {
    const value=policy();value.capabilities.other={...value.capabilities.advice}; value.periodCap="0.3"; await provision(value);
    let release!:()=>void,entered!:()=>void;
    const ready=new Promise<void>(r=>{entered=r;}), gate=new Promise<void>(r=>{release=r;});
    const first=execute("budget-one",async()=>{entered(); await gate; return {text,usage};});
    await ready;
    await expect(executeAiCapability(p,{...capability,id:"other"},input("budget-two"),{db:f.db,now,transport})).rejects.toMatchObject({code:"AI_BUDGET_EXCEEDED"});
    release(); await first;
  });
  it("retains in-flight reservations on interrupted settlement, then recovers unknown usage without replaying the provider", async () => {
    await provision();
    const broken={...f.db,$transaction:<T>(fn:Parameters<typeof f.db.$transaction<T>>[0])=>f.db.$transaction(tx=>fn({...tx,$executeRaw:async(q:Prisma.Sql)=>{
      if(q.text.startsWith('UPDATE "AiUsageAttempt"'))throw new Error("synthetic write failure"); return tx.$executeRaw(q);
    }}))};
    await expect(executeAiCapability(p,capability,input("crash"),{db:broken,now,transport})).rejects.toMatchObject({code:"AI_USAGE_PENDING"});
    const row=(await executions())[0];
    expect(Number((await balance()).reserved)).toBeGreaterThan(0);
    await recoverAiExecution(p,row.id,"operator confirmed dead worker",f.db,new Date(now().getTime()+301000));
    expect((await executions())[0].state).toBe("ERROR");
    expect(await balance()).toEqual({spent:attemptAllowance(policy(),policy().capabilities.advice),reserved:"0.00000000"});
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

it("validates evidence schema and computes exact category prices without floating point rounding",()=>{
  expect(usageCost(usage,policy())).toBe("0.00030500");
  const refs=new Set(evidenceReferences({sales:{revenue:"10.01"}}));
  expect(parseAiAdvice(JSON.stringify({summary:"x",recommendations:[{text:"x",evidenceRefs:["/sales/revenue"]}]}),refs).summary).toBe("x");
});
