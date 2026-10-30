import "server-only";
import {randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {prisma} from "./prisma";
import {isRecord} from "./api-contracts";
import type {SqlDatabase,SqlClient} from "./connectors/database";
import {payloadHash} from "./connectors/order-storage";
import {aiTransaction} from "./ai-execution/budget";
import type {AiPrincipal} from "./ai-execution/contracts";
import {ProductAttributeError} from "./product-attributes";
import {attributeDictionaryInTx} from "./product-attribute-store";
import {marketId,marketText,parseMarketPolicy,MarketEvidenceError,type MarketPolicy} from "./market-evidence";

export interface MarketSourceRecord {id:string;revision:number;values:MarketPolicy;approvedAt:Date|string|null;approvedById:string|null;approvalReference:string|null}
export async function marketSourceInTx(p:AiPrincipal,profileId:string,tx:SqlClient){
 marketId(profileId);
 const [row]=await tx.$queryRaw<MarketSourceRecord[]>(Prisma.sql`SELECT id,revision,values,"approvedAt","approvedById","approvalReference" FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND "configType"='GENERAL' AND key=${`market-source:${profileId}`} ORDER BY revision DESC LIMIT 1`);
 if(!row)throw new MarketEvidenceError("SOURCE_NOT_CONFIGURED",404);row.values=parseMarketPolicy(row.values);return row;
}
export async function saveMarketSource(p:AiPrincipal,profileId:string,value:unknown,db:SqlDatabase=prisma){
 marketId(profileId);
 if(!isRecord(value)||Object.keys(value).sort().join()!=="expectedRevision,policy"||!Number.isSafeInteger(value.expectedRevision)||Number(value.expectedRevision)<0||Number(value.expectedRevision)>10000)throw new MarketEvidenceError("INVALID_SOURCE_REVISION");
 const policy=parseMarketPolicy(value.policy),expected=Number(value.expectedRevision);
 return aiTransaction(p,db,async tx=>{
  const [source]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "DataSource" WHERE "tenantId"=${p.tenantId} AND id=${policy.internalSourceId}`);
  const [category]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "Category" WHERE "tenantId"=${p.tenantId} AND id=${policy.scope.categoryId}`);
  if(!source||!category)throw new MarketEvidenceError("SOURCE_SCOPE_NOT_FOUND",404);
  const [previous]=await tx.$queryRaw<Array<{revision:number}>>(Prisma.sql`SELECT revision FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND "configType"='GENERAL' AND key=${`market-source:${profileId}`} ORDER BY revision DESC LIMIT 1`);
  if((previous?.revision??0)!==expected)throw new MarketEvidenceError("SOURCE_REVISION_CONFLICT",409);
  const id=randomUUID(),revision=expected+1;
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive") VALUES (${id},${p.tenantId},'GENERAL',${`market-source:${profileId}`},${revision},${JSON.stringify(policy)}::jsonb,false)`);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context) VALUES (${randomUUID()},${p.tenantId},${p.userId},${id},'MARKET_SOURCE_DRAFT','MARKET_SOURCE',${profileId},${`market-source:${id}`},${JSON.stringify({revision,policyHash:payloadHash(policy)})}::jsonb,'{}')`);
  return {profileId,configId:id,revision,state:"draft",policy};
 },true);
}
export async function validateMarketAttribute(p:AiPrincipal,policy:MarketPolicy,tx:SqlClient){
 const a=policy.scope.attribute;if(!a)return;
 const dictionary=await attributeDictionaryInTx(p,a.dictionaryId,tx).catch(error=>{if(error instanceof ProductAttributeError)throw new MarketEvidenceError("ATTRIBUTE_MAPPING_UNAVAILABLE",409);throw error;});
 if(dictionary.id!==a.configId||!dictionary.approvedAt||dictionary.values.sourceId!==policy.internalSourceId||!dictionary.values.dimensions.some(d=>d.id===a.dimensionId&&d.values.some(v=>v.id===a.valueId)))throw new MarketEvidenceError("ATTRIBUTE_MAPPING_UNAVAILABLE",409);
}
export function validateMarketRights(policy:MarketPolicy,now:Date){
 const r=policy.rights;
 if(!r.canIngest||!r.canRetain||!r.canDisplay)throw new MarketEvidenceError("SOURCE_RIGHTS_MISSING",409);
 if(now.getTime()<Date.parse(r.validFrom)||now.getTime()+86400000>=Date.parse(r.validUntil))throw new MarketEvidenceError("SOURCE_RIGHTS_EXPIRED",409);
 if(now.getTime()<Date.parse(policy.budget.from)||now.getTime()>=Date.parse(policy.budget.to))throw new MarketEvidenceError("SOURCE_BUDGET_PERIOD_INACTIVE",409);
}
export async function approveMarketSource(p:AiPrincipal,profileId:string,value:unknown,db:SqlDatabase=prisma,now=new Date()){
 if(!isRecord(value)||Object.keys(value).sort().join()!=="approvalReference,configId"||!marketText(value.approvalReference,1000))throw new MarketEvidenceError("SOURCE_APPROVAL_REQUIRED",409);
 const configId=marketId(value.configId),reference=value.approvalReference;
 return aiTransaction(p,db,async tx=>{
  const source=await marketSourceInTx(p,profileId,tx);if(source.id!==configId)throw new MarketEvidenceError("SOURCE_REVISION_CONFLICT",409);
  validateMarketRights(source.values,now);await validateMarketAttribute(p,source.values,tx);
  if(source.approvedAt)return {configId,revision:source.revision,state:"approved"};
  const b=source.values.budget;
  const budgets=await tx.$queryRaw<Array<{values:MarketPolicy["budget"]}>>(Prisma.sql`SELECT values FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND "configType"='GENERAL' AND key=${`market-budget:${b.key}`} ORDER BY revision`);
  for(const existing of budgets){const old=existing.values;if(Date.parse(old.from)<Date.parse(b.to)&&Date.parse(old.to)>Date.parse(b.from)&&payloadHash(old)!==payloadHash(b))throw new MarketEvidenceError("SOURCE_BUDGET_POLICY_CONFLICT",409);}
  if(!budgets.some(row=>payloadHash(row.values)===payloadHash(b)))await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedAt","approvedById","approvalReference") VALUES (${randomUUID()},${p.tenantId},'GENERAL',${`market-budget:${b.key}`},${budgets.length+1},${JSON.stringify(b)}::jsonb,false,${now},${p.userId},${reference})`);
  await tx.$executeRaw(Prisma.sql`UPDATE "MerchandisingConfig" SET "approvedAt"=${now},"approvedById"=${p.userId},"approvalReference"=${reference} WHERE "tenantId"=${p.tenantId} AND id=${configId}`);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context) VALUES (${randomUUID()},${p.tenantId},${p.userId},${configId},'MARKET_SOURCE_APPROVED','MARKET_SOURCE',${profileId},${`market-source-approval:${configId}`},${JSON.stringify({reference,policyHash:payloadHash(source.values)})}::jsonb,'{}')`);
  return {configId,revision:source.revision,state:"approved"};
 },true);
}
export async function readMarketSource(p:AiPrincipal,profileId:string,db:SqlDatabase=prisma){return aiTransaction(p,db,async tx=>({profileId,...await marketSourceInTx(p,profileId,tx)}));}

export async function purgeMarketEvidenceInTx(tx:SqlClient,now:Date,tenantId?:string){
 return tx.$executeRaw(Prisma.sql`UPDATE "MerchandisingAction" SET after='{"purged":true}'::jsonb,context=context||jsonb_build_object('purgedAt',${now.toISOString()}::text)
  WHERE "entityType"='MARKET_EVIDENCE' AND context->>'kind'='MARKET_EVIDENCE_V1' AND context->>'expiresAt'<=${now.toISOString()} AND COALESCE(after->>'purged','false')<>'true' ${tenantId?Prisma.sql`AND "tenantId"=${tenantId}`:Prisma.empty}`);
}
export async function purgeExpiredMarketEvidence(db:SqlDatabase=prisma,now=new Date()){return db.$transaction(tx=>purgeMarketEvidenceInTx(tx,now));}
