import "server-only";
import {randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {prisma} from "./prisma";
import type {SqlClient,SqlDatabase} from "./connectors/database";
import {payloadHash} from "./connectors/order-storage";
import {financialDecimal as D} from "./financial-decimal.mjs";
import {aiTransaction} from "./ai-execution/budget";
import {AiExecutionError,type AiPrincipal} from "./ai-execution/contracts";
import {resolveCustomLabelEvidence} from "./custom-label-evidence";
import {CustomLabelError} from "./custom-labels";
import {ProductAttributeError} from "./product-attributes";
import {marketSourceInTx,validateMarketRights,validateMarketAttribute,purgeMarketEvidenceInTx,type MarketSourceRecord} from "./market-source-store";
import {MarketEvidenceError,parseMarketQuery,normalizeMarketObservation,marketObservationSummary,marketMoney,marketId,type MarketPolicy,type MarketQuery,type MarketObservation} from "./market-evidence";

export interface MarketSourceAdapter {
 /** Implement only after a real source contract/access decision; never construct transports from browser URLs. */
 read(input:{query:MarketQuery;policy:MarketPolicy;signal:AbortSignal}):Promise<{observation:unknown;charge?:{amount:string;currency:string}}>;
}
interface RequestRecord {id:string;actorId:string;createdAt:Date|string;context:{kind:string;requestHash:string;state:"STARTED"|"DONE"|"FAILED"|"RECOVERED";code?:string;maxCharge:string;chargedAmount?:string;quality?:string;quotaKey:string;budgetFrom:string;budgetTo:string}}
interface EvidenceReceipt {evidenceId:string;cacheKey:string;sourceName:string;sourceUrl:string;publishedAt:string;retrievedAt:string;expiresAt:string;hardRetainUntil:string;profileId:string;configId:string;revision:number;rightsReference:string;redistribution:string;query:Omit<MarketQuery,"requestKey"|"refresh">;metric:MarketPolicy["metric"];provenance:unknown}
interface StoredEvidence {id:string;context:{kind:string;cacheKey:string;expiresAt:string;receipt:EvidenceReceipt};after:{observation?:MarketObservation;summary?:ReturnType<typeof marketObservationSummary>;purged?:boolean}}
const unavailable=(reason:string)=>({version:1 as const,status:"unavailable" as const,reason,externalEvidence:null,internalSales:{status:"not_computed"},hypotheses:[],causality:"not_established",forecastInput:false});
const known=(error:unknown)=>error instanceof MarketEvidenceError||error instanceof CustomLabelError||error instanceof ProductAttributeError||error instanceof AiExecutionError&&error.code!=="AI_FORBIDDEN";
const reason=(error:unknown)=>error instanceof Error&&"code" in error?String(error.code):"SOURCE_CONTEXT_UNAVAILABLE";
/** Budget accounting is independent from AI tokens and includes conservative outstanding request exposure. */
export async function marketSourceUsage(p:AiPrincipal,budget:MarketPolicy["budget"],tx:SqlClient){
 const [row]=await tx.$queryRaw<Array<{requests:number;requestExposure:string}>>(Prisma.sql`SELECT count(*)::int requests,COALESCE(sum(COALESCE(context->>'chargedAmount',context->>'maxCharge')::numeric),0)::text "requestExposure"
  FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "entityType"='MARKET_REQUEST' AND context->>'kind'='MARKET_REQUEST_V1' AND context->>'quotaKey'=${budget.key} AND context->>'budgetFrom'=${budget.from} AND context->>'budgetTo'=${budget.to}`);
 return {requests:row.requests,requestExposure:D(row.requestExposure).toFixed(8),approvedSubscriptionAmount:budget.subscriptionAmount,totalExposure:D(row.requestExposure).plus(budget.subscriptionAmount).toFixed(8),currency:budget.currency,resetsAt:budget.to};
}
/** Pin source policy, geographic/category scope and optional approved physical mapping to the current MVP envelope. */
async function sourceContext(p:AiPrincipal,q:MarketQuery,tx:SqlClient,now:Date){
 const source=await marketSourceInTx(p,q.profileId,tx);if(!source.approvedAt)throw new MarketEvidenceError("SOURCE_NOT_APPROVED",409);
 const policy=source.values;validateMarketRights(policy,now);await validateMarketAttribute(p,policy,tx);
 if(q.geography!==policy.scope.geography||q.categoryId!==policy.scope.categoryId)throw new MarketEvidenceError("SOURCE_SCOPE_MISMATCH",409);
 const base=await resolveCustomLabelEvidence(p,{profileId:q.profileId,snapshotId:q.snapshotId,filters:{categoryId:q.categoryId}},policy.internalSourceId,tx);
 if(base.envelope.period.from!==q.from||base.envelope.period.to!==q.to)throw new MarketEvidenceError("SOURCE_PERIOD_MISMATCH",409);
 const fingerprint=payloadHash({configId:source.id,revision:source.revision,policy,internal:base.fingerprint});
 return {source,base,fingerprint,cacheKey:payloadHash({version:1,fingerprint,geography:q.geography,categoryId:q.categoryId,from:q.from,to:q.to})};
}
const requestInTx=async(p:AiPrincipal,key:string,tx:SqlClient)=>(await tx.$queryRaw<RequestRecord[]>(Prisma.sql`SELECT id,"actorId","createdAt",context FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "idempotencyKey"=${`market-request:${key}`} AND "entityType"='MARKET_REQUEST'`))[0];
const cachedInTx=async(p:AiPrincipal,key:string,tx:SqlClient)=>(await tx.$queryRaw<StoredEvidence[]>(Prisma.sql`SELECT id,context,after FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "entityType"='MARKET_EVIDENCE' AND context->>'kind'='MARKET_EVIDENCE_V1' AND context->>'cacheKey'=${key} ORDER BY "createdAt" DESC,id DESC LIMIT 1`))[0];
/** Expose retained external observations separately from internal sales references and untested hypotheses. */
function available(stored:StoredEvidence,cached:boolean,usage:Awaited<ReturnType<typeof marketSourceUsage>>){
 const r=stored.context.receipt,q=r.query,params=new URLSearchParams({snapshotId:q.snapshotId,period:"custom",dateFrom:q.from,dateTo:q.to,categoryId:q.categoryId});
 return {version:1 as const,status:"available" as const,cached,externalEvidence:{...r,observation:stored.after.observation!,summary:stored.after.summary!},sourceUsage:usage,internalSales:{status:"separate_internal_report",href:`/sales?${params}`,snapshotId:q.snapshotId},hypotheses:[],causality:"not_established",forecastInput:false};
}
/** Reserve one whole external request before dispatch, using only explicitly injected server adapters; production has none. */
export async function getMarketEvidence(p:AiPrincipal,value:unknown,options:{db?:SqlDatabase;now?:()=>Date;adapters?:ReadonlyMap<string,MarketSourceAdapter>;timeoutMs?:number}={}){
 const q=parseMarketQuery(value),db=options.db??prisma,clock=options.now??(()=>new Date()),adapters=options.adapters??new Map<string,MarketSourceAdapter>();
 let prepared;
 try{prepared=await aiTransaction(p,db,async tx=>{
  const now=clock();await purgeMarketEvidenceInTx(tx,now,p.tenantId);
  const context=await sourceContext(p,q,tx,now),budget=context.source.values.budget,requestHash=payloadHash({actor:p.userId,cacheKey:context.cacheKey});
  const previous=await requestInTx(p,q.requestKey,tx);
  if(previous&&(previous.actorId!==p.userId||previous.context.requestHash!==requestHash))throw new MarketEvidenceError("SOURCE_REQUEST_CONFLICT",409);
  if(previous?.context.state==="STARTED")return {reply:unavailable("SOURCE_REQUEST_IN_PROGRESS")};
  if(previous&&previous.context.state!=="DONE")return {reply:unavailable(previous.context.code??"SOURCE_REQUEST_FAILED")};
  const stored=await cachedInTx(p,context.cacheKey,tx),usage=await marketSourceUsage(p,budget,tx);
  if(stored&&!stored.after.purged&&stored.after.observation&&Date.parse(stored.context.expiresAt)>now.getTime())return {reply:available(stored,true,usage)};
  if(previous)return {reply:unavailable("SOURCE_EVIDENCE_STALE")};
  if(!q.refresh)return {reply:unavailable(stored?"SOURCE_EVIDENCE_STALE":"SOURCE_EVIDENCE_MISSING")};
  const adapter=adapters.get(context.source.values.adapterId);if(!adapter)return {reply:unavailable("SOURCE_ADAPTER_NOT_CONFIGURED")};
  if(usage.requests>=budget.maxRequests||D(usage.totalExposure).plus(budget.perRequestAmount).gt(budget.periodCap))return {reply:unavailable("SOURCE_QUOTA_EXCEEDED")};
  const id=randomUUID(),requestContext={kind:"MARKET_REQUEST_V1",requestHash,state:"STARTED",maxCharge:budget.perRequestAmount,quotaKey:budget.key,budgetFrom:budget.from,budgetTo:budget.to};
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",context,"createdAt") VALUES (${id},${p.tenantId},${p.userId},${context.source.id},'MARKET_SOURCE_REQUEST','MARKET_REQUEST',${q.profileId},${`market-request:${q.requestKey}`},${JSON.stringify(requestContext)}::jsonb,${now})`);
  return {id,context,adapter,requestHash};
 });}catch(error){if(known(error))return unavailable(reason(error));throw error;}
 if(prepared.reply)return prepared.reply;
 const {id,context,adapter}=prepared,policy=context!.source.values;
 let observation:MarketObservation|undefined,charge=policy.budget.perRequestAmount,quality="CONSERVATIVE",failure:string|undefined;
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const result=await Promise.race([adapter!.read({query:structuredClone(q),policy:structuredClone(policy),signal:controller.signal}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new MarketEvidenceError("SOURCE_TIMEOUT",502));},Math.min(options.timeoutMs??15000,15000));})]);
  if(result.charge){if(!marketMoney(result.charge.amount)||result.charge.currency!==policy.budget.currency)throw new MarketEvidenceError("INVALID_SOURCE_USAGE",502);charge=D(result.charge.amount).toFixed(8);quality="EXACT";}
  if(D(charge).gt(policy.budget.perRequestAmount))throw new MarketEvidenceError("SOURCE_USAGE_OVERRUN",502);
  observation=normalizeMarketObservation(result.observation,policy,q,clock());
 }catch(error){failure=error instanceof MarketEvidenceError?error.code:"SOURCE_ADAPTER_FAILED";}
 finally{if(timer)clearTimeout(timer);}
 return aiTransaction(p,db,async tx=>{
  const current=await requestInTx(p,q.requestKey,tx);if(current?.context.state!=="STARTED")return unavailable("SOURCE_REQUEST_RECOVERED");
  const now=clock();let live:Awaited<ReturnType<typeof sourceContext>>|undefined;
  if(!failure)try{live=await sourceContext(p,q,tx,now);if(live.fingerprint!==context!.fingerprint)failure="SOURCE_CONTEXT_CHANGED";}catch(error){if(known(error))failure=reason(error);else throw error;}
  const hardRetainUntil=Math.min(now.getTime()+policy.rights.retentionHours*3600000,Date.parse(policy.rights.validUntil));
  const expiresAt=observation?Math.min(now.getTime()+policy.cadence.refreshHours*3600000,Date.parse(observation.publishedAt)+policy.cadence.maxAgeHours*3600000,hardRetainUntil-86400000):now.getTime();
  if(!failure&&expiresAt<=now.getTime())failure="SOURCE_EVIDENCE_STALE";
  const settled={...current.context,state:failure?"FAILED":"DONE",chargedAmount:charge,quality,...(failure?{code:failure}:{})};
  await tx.$executeRaw(Prisma.sql`UPDATE "MerchandisingAction" SET context=${JSON.stringify(settled)}::jsonb WHERE "tenantId"=${p.tenantId} AND id=${id}`);
  if(failure)return {...unavailable(failure),sourceUsage:await marketSourceUsage(p,policy.budget,tx)};
  const evidenceId=randomUUID(),receipt:EvidenceReceipt={evidenceId,cacheKey:context!.cacheKey,sourceName:policy.sourceName,sourceUrl:observation!.sourceUrl,publishedAt:observation!.publishedAt,retrievedAt:now.toISOString(),expiresAt:new Date(expiresAt).toISOString(),hardRetainUntil:new Date(hardRetainUntil).toISOString(),profileId:q.profileId,configId:context!.source.id,revision:context!.source.revision,rightsReference:policy.rights.reference,redistribution:policy.rights.redistribution,query:{profileId:q.profileId,snapshotId:q.snapshotId,geography:q.geography,categoryId:q.categoryId,from:q.from,to:q.to},metric:policy.metric,provenance:{internal:live!.base.envelope,sourceFingerprint:live!.base.fingerprint,attributeMapping:policy.scope.attribute,approvalReference:context!.source.approvalReference}};
  const metadata={kind:"MARKET_EVIDENCE_V1",cacheKey:context!.cacheKey,expiresAt:receipt.expiresAt,receipt},body={observation:observation!,summary:marketObservationSummary(observation!)};
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",context,after,"createdAt") VALUES (${evidenceId},${p.tenantId},${p.userId},${context!.source.id},'MARKET_EVIDENCE_RETAINED','MARKET_EVIDENCE',${q.profileId},${`market-evidence:${id}`},${JSON.stringify(metadata)}::jsonb,${JSON.stringify(body)}::jsonb,${now})`);
  return available({id:evidenceId,context:metadata,after:body},false,await marketSourceUsage(p,policy.budget,tx));
 });
}
/** An owner may conservatively settle a stale dispatched request; recovery never replays a provider call or frees its allowance. */
export async function recoverMarketRequest(p:AiPrincipal,requestKey:string,db:SqlDatabase=prisma,now=new Date()){
 marketId(requestKey);return aiTransaction(p,db,async tx=>{
  const row=await requestInTx(p,requestKey,tx);if(!row)throw new MarketEvidenceError("SOURCE_REQUEST_NOT_FOUND",404);
  if(row.context.state!=="STARTED")return {requestKey,state:row.context.state};
  if(now.getTime()-new Date(row.createdAt).getTime()<300000)throw new MarketEvidenceError("SOURCE_REQUEST_NOT_STALE",409);
  const context={...row.context,state:"RECOVERED",chargedAmount:row.context.maxCharge,quality:"CONSERVATIVE",code:"SOURCE_REQUEST_RECOVERED",recoveredBy:p.userId,recoveredAt:now.toISOString()};
  await tx.$executeRaw(Prisma.sql`UPDATE "MerchandisingAction" SET context=${JSON.stringify(context)}::jsonb WHERE "tenantId"=${p.tenantId} AND id=${row.id}`);
  return {requestKey,state:"RECOVERED"};
 },true);
}
