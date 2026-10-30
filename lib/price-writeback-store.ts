import "server-only";
import {reserveExternalActionAttempt,settleExternalActionAttempt,withExternalActionTimeout} from "./external-action-attempt";
import {randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {prisma} from "./prisma";
import {isRecord} from "./api-contracts";
import type {SqlClient,SqlDatabase} from "./connectors/database";
import type {AiPrincipal} from "./ai-execution/contracts";
import {aiTransaction} from "./ai-execution/budget";
import {payloadHash} from "./connectors/order-storage";
import {financialDecimal as D} from "./financial-decimal.mjs";
import {resolveAiSnapshot} from "./ai-execution/context";
import {PriceWritebackError as E,priceId,exactKeys,priceAmount,priceReference,parseRemotePrices,validatePriceAccess,priceOperationState,PRICE_WRITEBACK_MAX_ITEMS,PRICE_APPROVAL_TTL_MS,type PriceTransport,type PriceAccessPolicy,type PriceItem} from "./price-writeback";
interface Options {db?:SqlDatabase;transport?:PriceTransport;access?:PriceAccessPolicy;now?:()=>Date;timeoutMs?:number}
interface Binding {snapshotId:string;sourceId:string;selectionRevision:number;sourceStateKey:string;connectionRevision:number;accountHost:string;mappingHash:string;policyHash:string}
export interface PriceOperation {id:string;actorId:string;exportId:string;createdAt:string;state:string;direction:"APPLY"|"RESTORE";compensatesId:string|null;binding:Binding;items:PriceItem[];previewHash:string;startedAt?:string;reconciliation?:{by:string;at:string;policyHash:string;accessPolicy:PriceAccessPolicy};accessPolicy:PriceAccessPolicy;approval?:{by:string;at:string;expiresAt:string;reference:string};exportReceipt:unknown}
function runtime(o:Options){
 if(!o.transport||!o.access)throw new E("PRICE_WRITEBACK_DISABLED",409);
 const c=o.transport.capabilities;if(c.atomicExistingOnly!==true||c.authoritativeNativeReads!==true||c.terminalAttemptLookup!==true)throw new E("PRICE_TRANSPORT_PRECONDITIONS_UNSUPPORTED",409);
 const now=o.now??(()=>new Date());validatePriceAccess(o.access,now());const access={...o.access,from:new Date(o.access.from).toISOString(),to:new Date(o.access.to).toISOString()};return {db:o.db??prisma,transport:o.transport,access,clock:now};
}
async function operationInTx(p:AiPrincipal,id:string,tx:SqlClient){
 const [r]=await tx.$queryRaw<Array<{after:PriceOperation}>>(Prisma.sql`SELECT after FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND id=${priceId(id)} AND "entityType"='PRICE_WRITEBACK'`);
 if(!r||r.after.actorId!==p.userId)throw new E("PRICE_OPERATION_NOT_FOUND",404);return r.after;
}
async function saveOperation(p:AiPrincipal,op:PriceOperation,tx:SqlClient){await tx.$executeRaw(Prisma.sql`UPDATE "MerchandisingAction" SET after=${JSON.stringify(op)}::jsonb WHERE "tenantId"=${p.tenantId} AND id=${op.id} AND "entityType"='PRICE_WRITEBACK'`);}
async function bindingInTx(p:AiPrincipal,snapshotId:string,items:Array<{skuId:string;productId?:string}>,access:PriceAccessPolicy,tx:SqlClient):Promise<Binding>{
 const {snapshot,selected}=await resolveAiSnapshot(p,snapshotId,tx);
 const [connection]=await tx.$queryRaw<Array<{revision:number;accountHost:string}>>(Prisma.sql`SELECT revision,"accountHost" FROM "ConnectorConnection" WHERE "tenantId"=${p.tenantId} AND "sourceId"=${selected.id} AND provider='salesdrive'`);
 if(selected.provider!=="salesdrive"||selected.id!==access.sourceId||!connection||connection.revision!==access.connectionRevision)throw new E("PRICE_CONNECTION_CHANGED",409);
 const aliases=await tx.$queryRaw<Array<{skuId:string;value:string}>>(Prisma.sql`SELECT "skuId",value FROM "SkuAlias" WHERE "tenantId"=${p.tenantId} AND "sourceId"=${selected.id} AND type='SOURCE_PRODUCT_ID' AND "skuId" IN (${Prisma.join(items.map(i=>i.skuId))}) ORDER BY "skuId",value`);
 if(items.some(i=>aliases.filter(a=>a.skuId===i.skuId).length!==1||i.productId!==undefined&&!aliases.some(a=>a.skuId===i.skuId&&a.value===i.productId))||new Set(aliases.map(a=>a.value)).size!==items.length)throw new E("PRICE_PRODUCT_MAPPING_UNVERIFIED",409);
 for(const a of aliases)priceId(a.value);
 return {snapshotId,sourceId:selected.id,selectionRevision:selected.revision,sourceStateKey:snapshot.sourceStateKey,connectionRevision:connection.revision,accountHost:connection.accountHost,mappingHash:payloadHash(aliases),policyHash:payloadHash(access)};
}
async function assertLive(p:AiPrincipal,op:PriceOperation,access:PriceAccessPolicy,tx:SqlClient){
 const live=await bindingInTx(p,op.binding.snapshotId,op.items,access,tx);
 if(payloadHash(live)!==payloadHash(op.binding))throw new E("PRICE_CONTEXT_CHANGED",409);
}
async function assertReconciliationIdentity(p:AiPrincipal,op:PriceOperation,r:ReturnType<typeof runtime>,tx:SqlClient){
 const [connection]=await tx.$queryRaw<Array<{accountHost:string;revision:number}>>(Prisma.sql`SELECT "accountHost",revision FROM "ConnectorConnection" WHERE "tenantId"=${p.tenantId} AND "sourceId"=${op.binding.sourceId} AND provider='salesdrive'`);
 if(r.access.sourceId!==op.binding.sourceId||!connection||connection.accountHost!==op.binding.accountHost||connection.revision!==r.access.connectionRevision)throw new E("PRICE_RECONCILIATION_ACCOUNT_CHANGED",409);
}
async function reserveCall(p:AiPrincipal,kind:"READ"|"WRITE",r:ReturnType<typeof runtime>,operationId:string|null,tx:SqlClient){
 validatePriceAccess(r.access,r.clock());
 return reserveExternalActionAttempt(p,tx,{entityType:"PRICE_TRANSPORT_ATTEMPT",prefix:"price-attempt",kind,operationId,quotaKey:r.access.quotaKey,from:r.access.from,to:r.access.to,limit:kind==="READ"?r.access.maxReads:r.access.maxWrites,policy:r.access,now:r.clock(),quotaError:()=>new E("PRICE_ACCOUNT_QUOTA_EXCEEDED",429)});
}
async function timed<T>(o:Options,fn:(signal:AbortSignal)=>Promise<T>){return withExternalActionTimeout(o.timeoutMs,()=>new E("PRICE_TRANSPORT_TIMEOUT",502),fn);}
async function settleCall(p:AiPrincipal,id:string,state:string,r:ReturnType<typeof runtime>){return settleExternalActionAttempt(p,r.db,id,"PRICE_TRANSPORT_ATTEMPT",state);}
async function readRemote(p:AiPrincipal,ids:string[],attempts:string[],r:ReturnType<typeof runtime>,o:Options,opId:string|null){
 const attempt=await aiTransaction(p,r.db,tx=>reserveCall(p,"READ",r,opId,tx),true);
 try{const result=await timed(o,signal=>r.transport.read({productIds:ids,attemptIds:attempts,signal}));const products=parseRemotePrices(result.products,ids,r.clock());if(attempts.some(id=>!result.attempts||!["APPLIED","NOT_APPLIED","UNKNOWN"].includes(result.attempts[id])))throw new E("PRICE_ATTEMPT_EVIDENCE_MISSING",502);await settleCall(p,attempt,"DONE",r);return {products,attempts:result.attempts??{}};}
 catch(error){await settleCall(p,attempt,"FAILED_OR_UNKNOWN",r);throw error instanceof E?error:new E("PRICE_REMOTE_READ_FAILED",502);}
}
export async function previewPriceWriteback(p:AiPrincipal,value:unknown,o:Options={}){
 if(!isRecord(value)||(!exactKeys(value,["exportId","skuIds","compensatesId"])&&!exactKeys(value,["exportId","skuIds","compensatesId","currentSnapshotId"]))||!Array.isArray(value.skuIds)||!value.skuIds.length||value.skuIds.length>PRICE_WRITEBACK_MAX_ITEMS||new Set(value.skuIds).size!==value.skuIds.length||value.compensatesId!==null&&typeof value.compensatesId!=="string")throw new E("INVALID_PRICE_PREVIEW");
 if(value.currentSnapshotId!==undefined&&(value.compensatesId===null||typeof value.currentSnapshotId!=="string"))throw new E("INVALID_PRICE_PREVIEW");
 const currentSnapshotId=value.currentSnapshotId===undefined?undefined:priceId(value.currentSnapshotId);
 const exportId=priceId(value.exportId),skuIds=value.skuIds.map(priceId).sort(),r=runtime(o),compensatesId=value.compensatesId===null?null:priceId(value.compensatesId);
 const prepared=await aiTransaction(p,r.db,async tx=>{
  const [a]=await tx.$queryRaw<Array<{snapshotId:string;receipt:unknown;rows:Array<{skuId:string;currency:string;oldPrice:string;newPrice:string;ownership:string}>}>>(Prisma.sql`SELECT context->'dataVersion'->>'snapshotId' "snapshotId",after->'receipt' receipt,(SELECT jsonb_agg(row) FROM jsonb_array_elements(after->'rows') row WHERE row->>'skuId' IN (${Prisma.join(skuIds)})) rows FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "entityType"='SCENARIO_EXPORT' AND action='reprice' AND context->>'kind'='SCENARIO_EXPORT_V1' AND "idempotencyKey"=${`export:${exportId}`}`);
  if(!a||!a.rows||a.rows.length!==skuIds.length||new Set(a.rows.map(i=>i.skuId)).size!==skuIds.length)throw new E("PRICE_EXPORT_SUBSET_NOT_FOUND",404);
  if(a.rows.some(i=>i.currency!=="UAH"||i.ownership!=="OWN"||!priceAmount(i.oldPrice)||!priceAmount(i.newPrice)))throw new E("PRICE_EXPORT_VALUES_UNSUPPORTED",409);
  if(a.rows.some(i=>D(i.oldPrice).eq(i.newPrice)))throw new E("PRICE_NO_CHANGE",409);
  const binding=await bindingInTx(p,currentSnapshotId??a.snapshotId,a.rows,r.access,tx),aliases=await tx.$queryRaw<Array<{skuId:string;productId:string}>>(Prisma.sql`SELECT "skuId",value "productId" FROM "SkuAlias" WHERE "tenantId"=${p.tenantId} AND "sourceId"=${binding.sourceId} AND type='SOURCE_PRODUCT_ID' AND "skuId" IN (${Prisma.join(skuIds)})`);
  const parent=compensatesId?await operationInTx(p,compensatesId,tx):null;
  if(parent&&(parent.exportId!==exportId||!["SUCCEEDED","PARTIAL"].includes(parent.state)||parent.direction!=="APPLY"||skuIds.some(id=>!parent.items.some(i=>i.skuId===id&&i.state==="SUCCEEDED"))))throw new E("PRICE_COMPENSATION_NOT_ELIGIBLE",409);
  if(parent&&(parent.binding.sourceId!==binding.sourceId||parent.binding.accountHost!==binding.accountHost))throw new E("PRICE_COMPENSATION_ACCOUNT_CHANGED",409);
  if(parent&&skuIds.some(id=>parent.items.find(i=>i.skuId===id)!.productId!==aliases.find(a=>a.skuId===id)!.productId))throw new E("PRICE_COMPENSATION_PRODUCT_CHANGED",409);
  if(parent){const current=await tx.$queryRaw<Array<{skuId:string;ownership:string;currency:string;productKind:string;unitCost:string|null}>>(Prisma.sql`SELECT s."skuId",d.metrics->>'ownership' ownership,d.currency,d.metrics->>'productKind' "productKind",s.details->>'unitCost' "unitCost" FROM "MerchandisingScreenSku" s JOIN "SkuDaily" d ON d.id=s."dailyId" AND d."tenantId"=s."tenantId" AND d."skuId"=s."skuId" WHERE s."tenantId"=${p.tenantId} AND s."snapshotId"=${binding.snapshotId} AND s."skuId" IN (${Prisma.join(skuIds)})`);
   if(current.length!==skuIds.length||current.some(i=>i.ownership!=="OWN"||i.currency!=="UAH"||i.productKind!=="MERCHANDISE"||i.unitCost===null||!D(i.unitCost).gt(0)||D(a.rows.find(r=>r.skuId===i.skuId)!.oldPrice).lt(i.unitCost)))throw new E("PRICE_COMPENSATION_CURRENT_POLICY_UNVERIFIED",409);
  }
  const items=a.rows.map(i=>({skuId:i.skuId,productId:aliases.find(a=>a.skuId===i.skuId)!.productId,currency:"UAH" as const,oldPrice:D(compensatesId?i.newPrice:i.oldPrice).toFixed(2),newPrice:D(compensatesId?i.oldPrice:i.newPrice).toFixed(2),remoteVersion:"",state:"PENDING" as const})).sort((a,b)=>a.skuId<b.skuId?-1:1);
  return {binding,items,receipt:a.receipt,parent};
 },true);
 const {products}=await readRemote(p,prepared.items.map(i=>i.productId),[],r,o,null);
 const items=prepared.items.map(i=>{const remote=products.find(p=>p.productId===i.productId)!;if(!D(remote.price).eq(i.oldPrice))throw new E("PRICE_REMOTE_CHANGED",409);if(prepared.parent){const parent=prepared.parent.items.find(p=>p.skuId===i.skuId)!;if(remote.version!==parent.observedVersion)throw new E("PRICE_COMPENSATION_CONFLICT",409);}return {...i,remoteVersion:remote.version};});
 return aiTransaction(p,r.db,async tx=>{
  const id=randomUUID(),op:PriceOperation={id,actorId:p.userId,exportId,createdAt:r.clock().toISOString(),state:"DRAFT",direction:compensatesId?"RESTORE":"APPLY",compensatesId,binding:prepared.binding,accessPolicy:structuredClone(r.access),items,previewHash:payloadHash({binding:prepared.binding,items,exportId,compensatesId}),exportReceipt:prepared.receipt};await assertLive(p,op,r.access,tx);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context,"createdAt") VALUES (${id},${p.tenantId},${p.userId},${op.binding.snapshotId},'PRICE_DIFF_PREVIEW','PRICE_WRITEBACK',${exportId},${`price-operation:${id}`},${JSON.stringify(op)}::jsonb,${JSON.stringify({kind:"PRICE_WRITEBACK_V1",version:1})}::jsonb,${r.clock()})`);return op;
 },true);
}
export async function approvePriceWriteback(p:AiPrincipal,value:unknown,o:Options={}){
 if(!isRecord(value)||!exactKeys(value,["operationId","previewHash","reference"])||!priceReference(value.reference)||typeof value.previewHash!=="string")throw new E("INVALID_PRICE_APPROVAL");
 const id=priceId(value.operationId),reference=value.reference,hash=value.previewHash,r=runtime(o);
 return aiTransaction(p,r.db,async tx=>{const op=await operationInTx(p,id,tx);await assertLive(p,op,r.access,tx);
  if(op.previewHash!==hash)throw new E("PRICE_PREVIEW_CHANGED",409);if(op.state==="APPROVED"){if(op.approval?.reference!==reference)throw new E("PRICE_APPROVAL_ALREADY_EXISTS",409);return op;}if(op.state!=="DRAFT"||r.clock().getTime()-Date.parse(op.createdAt)>PRICE_APPROVAL_TTL_MS)throw new E("PRICE_PREVIEW_EXPIRED_OR_TERMINAL",409);
  op.state="APPROVED";op.approval={by:p.userId,at:r.clock().toISOString(),expiresAt:new Date(r.clock().getTime()+PRICE_APPROVAL_TTL_MS).toISOString(),reference};await saveOperation(p,op,tx);return op;
 },true);
}
export async function executePriceWriteback(p:AiPrincipal,value:unknown,o:Options={}){
 if(!isRecord(value)||!exactKeys(value,["operationId","previewHash"])||typeof value.previewHash!=="string")throw new E("INVALID_PRICE_EXECUTION");
 const id=priceId(value.operationId),hash=value.previewHash,r=runtime(o);
 const prepared=await aiTransaction(p,r.db,async tx=>{
  const op=await operationInTx(p,id,tx);if(op.previewHash!==hash)throw new E("PRICE_PREVIEW_CHANGED",409);
  if(op.state!=="APPROVED")return {op,dispatch:false};await assertLive(p,op,r.access,tx);
  if(!op.approval||op.approval.by!==p.userId||Date.parse(op.approval.expiresAt)<=r.clock().getTime())throw new E("PRICE_APPROVAL_EXPIRED",409);
  op.state="PREFLIGHT";op.startedAt=r.clock().toISOString();await saveOperation(p,op,tx);return {op,dispatch:true};
 },true);
 if(!prepared.dispatch)return prepared.op;
 const executionDeadline=Date.now()+40000;
 const preflight=await readRemote(p,prepared.op.items.map(i=>i.productId),[],r,o,id).catch(async error=>{
  await aiTransaction(p,r.db,async tx=>{const op=await operationInTx(p,id,tx);if(op.state==="PREFLIGHT"){op.state="FAILED";op.items=op.items.map(i=>({...i,state:"FAILED",reason:"PREFLIGHT_READ_FAILED"}));await saveOperation(p,op,tx);}},true);throw error;
 });
 for(const selected of prepared.op.items){
  if(Date.now()+17000>executionDeadline)break;
  let item:PriceItem|undefined,attemptId:string|undefined;
  try{const claim=await aiTransaction(p,r.db,async tx=>{
   const op=await operationInTx(p,id,tx);await assertLive(p,op,r.access,tx);
   if(!["PREFLIGHT","DISPATCHING"].includes(op.state)||!op.approval||Date.parse(op.approval.expiresAt)<=r.clock().getTime())throw new E("PRICE_APPROVAL_EXPIRED",409);
   const current=op.items.find(i=>i.productId===selected.productId)!;if(current.state!=="PENDING")throw new E("PRICE_ITEM_ALREADY_ATTEMPTED",409);
   const remote=preflight.products.find(p=>p.productId===current.productId)!;
   if(remote.version!==current.remoteVersion||!D(remote.price).eq(current.oldPrice)){current.state="CONFLICT";current.reason="REMOTE_PRICE_OR_VERSION_CHANGED";await saveOperation(p,op,tx);return {};}
   const [conflict]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "entityType"='PRICE_WRITEBACK' AND id<>${id} AND after->'binding'->>'sourceId'=${op.binding.sourceId} AND EXISTS(SELECT 1 FROM jsonb_array_elements(after->'items') i WHERE i->>'productId'=${current.productId} AND i->>'state' IN ('DISPATCHING','UNKNOWN')) LIMIT 1`);
   if(conflict)throw new E("PRICE_PRODUCT_OUTCOME_UNRESOLVED",409);
   const attempt=await reserveCall(p,"WRITE",r,id,tx);current.state="DISPATCHING";current.attemptId=attempt;current.attemptAt=r.clock().toISOString();op.state="DISPATCHING";await saveOperation(p,op,tx);return {item:structuredClone(current),attempt};
  },true);item=claim.item;attemptId=claim.attempt;
  }catch(error){await aiTransaction(p,r.db,async tx=>{const op=await operationInTx(p,id,tx),i=op.items.find(i=>i.productId===selected.productId)!;if(i.state==="PENDING"){i.state="FAILED";i.reason=error instanceof E?error.code:"DISPATCH_CONTEXT_UNAVAILABLE";await saveOperation(p,op,tx);}},true);break;}
  if(!item||!attemptId)continue;
  let outcome:"APPLIED"|"CONFLICT"|"REJECTED"|"UNKNOWN"="UNKNOWN",receipt:string|undefined,appliedVersion:string|undefined;
  try{const result=await timed(o,signal=>r.transport.compareAndSet({attemptId:attemptId!,productId:item!.productId,expectedVersion:item!.remoteVersion,expectedPrice:item!.oldPrice,newPrice:item!.newPrice,currency:"UAH",approvedUntil:prepared.op.approval!.expiresAt,signal}));if(["APPLIED","CONFLICT","REJECTED","UNKNOWN"].includes(result.state)){outcome=result.state;if(result.receipt!==undefined)receipt=priceId(result.receipt);if(outcome==="APPLIED")appliedVersion=priceId(result.version);}}
  catch{outcome="UNKNOWN";}
  await settleCall(p,attemptId,outcome,r);
  let observed:Awaited<ReturnType<typeof readRemote>>["products"][number]|undefined;
  if(outcome==="APPLIED")try{observed=(await readRemote(p,[item.productId],[],r,o,id)).products[0];}catch{outcome="UNKNOWN";}
  await aiTransaction(p,r.db,async tx=>{const op=await operationInTx(p,id,tx),current=op.items.find(i=>i.productId===item!.productId)!;
   if(current.state!=="DISPATCHING"||current.attemptId!==attemptId)return;
   current.remoteReceipt=receipt;current.appliedVersion=appliedVersion;
   if(observed){current.observedPrice=observed.price;current.observedVersion=observed.version;}
   current.state=outcome==="APPLIED"&&observed&&observed.version===appliedVersion&&D(observed.price).eq(current.newPrice)?"SUCCEEDED":outcome==="CONFLICT"?"CONFLICT":outcome==="REJECTED"?"FAILED":"UNKNOWN";
   current.reason=current.state==="UNKNOWN"?"OUTCOME_REQUIRES_RECONCILIATION":undefined;await saveOperation(p,op,tx);
  },true);
 }
 return aiTransaction(p,r.db,async tx=>{const op=await operationInTx(p,id,tx);op.items=op.items.map(i=>i.state==="PENDING"?{...i,state:"FAILED",reason:"BATCH_STOPPED_BEFORE_DISPATCH"}:i);op.state=priceOperationState(op.items);await saveOperation(p,op,tx);return op;},true);
}
export async function reconcilePriceWriteback(p:AiPrincipal,value:unknown,o:Options={}){
 if(!isRecord(value)||!exactKeys(value,["operationId"]))throw new E("INVALID_PRICE_RECONCILIATION");
 const id=priceId(value.operationId),r=runtime(o),op=await aiTransaction(p,r.db,async tx=>{const op=await operationInTx(p,id,tx);await assertReconciliationIdentity(p,op,r,tx);return op;},true);
 const uncertain=op.items.filter(i=>["DISPATCHING","UNKNOWN"].includes(i.state));
 if(!uncertain.length){
  if(!["PREFLIGHT","DISPATCHING"].includes(op.state))return op;
  if(!op.startedAt||r.clock().getTime()-Date.parse(op.startedAt)<30000)throw new E("PRICE_ATTEMPT_STILL_IN_FLIGHT",409);
  return aiTransaction(p,r.db,async tx=>{const current=await operationInTx(p,id,tx);if(current.items.some(i=>["DISPATCHING","UNKNOWN"].includes(i.state)))throw new E("PRICE_ATTEMPT_STILL_IN_FLIGHT",409);current.items=current.items.map(i=>i.state==="PENDING"?{...i,state:"FAILED",reason:"INTERRUPTED_BEFORE_DISPATCH"}:i);current.state=priceOperationState(current.items);await saveOperation(p,current,tx);return current;},true);
 }
 if(uncertain.some(i=>r.clock().getTime()-Date.parse(i.attemptAt!)<30000))throw new E("PRICE_ATTEMPT_STILL_IN_FLIGHT",409);
 const read=await readRemote(p,uncertain.map(i=>i.productId),uncertain.map(i=>i.attemptId!),r,o,id);
 return aiTransaction(p,r.db,async tx=>{
  const current=await operationInTx(p,id,tx);await assertReconciliationIdentity(p,current,r,tx);
  for(const old of uncertain){const item=current.items.find(i=>i.productId===old.productId)!;if(item.attemptId!==old.attemptId||!["DISPATCHING","UNKNOWN"].includes(item.state))continue;
   const remote=read.products.find(p=>p.productId===item.productId)!,outcome=read.attempts[item.attemptId!];item.observedPrice=remote.price;item.observedVersion=remote.version;
   item.state=outcome==="APPLIED"?"RECONCILED_APPLIED":outcome==="NOT_APPLIED"?"RECONCILED_NOT_APPLIED":"UNKNOWN";
   item.reason=outcome==="UNKNOWN"?"TERMINAL_OUTCOME_UNCONFIRMED":D(remote.price).eq(item.newPrice)?"TARGET_CURRENTLY_OBSERVED":"CURRENT_PRICE_DIFFERS_DO_NOT_OVERWRITE";
  }
  current.items=current.items.map(i=>i.state==="PENDING"?{...i,state:"FAILED",reason:"RECONCILIATION_CLOSED_UNDISPATCHED"}:i);
  current.reconciliation={by:p.userId,at:r.clock().toISOString(),policyHash:payloadHash(r.access),accessPolicy:structuredClone(r.access)};current.state=priceOperationState(current.items);await saveOperation(p,current,tx);return current;
 },true);
}
export async function readPriceWriteback(p:AiPrincipal,id:string,db:SqlDatabase=prisma){return aiTransaction(p,db,tx=>operationInTx(p,id,tx),true);}
