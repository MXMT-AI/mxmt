import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {prisma} from "./prisma";
import {isRecord} from "./api-contracts";
import type {SqlClient,SqlDatabase} from "./connectors/database";
import {aiTransaction} from "./ai-execution/budget";
import type {AiPrincipal} from "./ai-execution/contracts";
import {payloadHash} from "./connectors/order-storage";
import {resolveAiSnapshot} from "./ai-execution/context";
import {readRetrospectiveExecution} from "./retrospective-execution-store";
import {reserveExternalActionAttempt,settleExternalActionAttempt,withExternalActionTimeout} from "./external-action-attempt";
import {recipientInTx,supplierTermsInTx,type RecipientRecord} from "./supplier-recipient-store";
import {SupplierDeliveryError as E,supplierActionId as id,supplierKeys as keys,supplierText,parseDeliveryOutcome,validateDeliveryAccess,SUPPLIER_APPROVAL_TTL_MS,SUPPLIER_DELIVERY_MAX_ROWS,type DeliveryAccessPolicy,type SupplierDeliveryTransport,type DeliveryOutcome} from "./supplier-delivery";
interface Options {db?:SqlDatabase;transport?:SupplierDeliveryTransport;access?:DeliveryAccessPolicy;now?:()=>Date;timeoutMs?:number}
interface GroupFile {id:string;name:string;content:string;sha256:string;byteLength:number;rowCount:number;supplierId:string;currency:string}
interface Binding {snapshotId:string;sourceId:string;selectionRevision:number;sourceStateKey:string;connectionRevision:number;accountHost:string;recipientId:string;recipientConfigId:string;recipientRevision:number;termsHash:string;policyHash:string;groupHash:string}
export interface DeliveryOperation {id:string;actorId:string;exportId:string;fileId:string;createdAt:string;state:"DRAFT"|"APPROVED"|"DISPATCHING"|"SENT"|"DELIVERY_UNKNOWN"|"FAILED"|"ACKNOWLEDGED"|"CANCELLED"|"RECEIVED";binding:Binding;recipient:RecipientRecord;rows:Array<Record<string,unknown>>;totals:unknown;file:Omit<GroupFile,"content">;message:{subject:string;body:string};payloadHash:string;previewHash:string;accessPolicy:DeliveryAccessPolicy;approval?:{by:string;reference:string;at:string;expiresAt:string};attemptId?:string;attemptAt?:string;deliveryId?:string;lastOutcome?:DeliveryOutcome;reconciliation?:unknown;receiptEvidence?:unknown;cancellation?:{id:string;policyHash:string;reason:string;state:"DRAFT"|"APPROVED"|"DISPATCHING"|"UNKNOWN"|"CANCELLED"|"REJECTED";previewHash:string;createdAt:string;approval?:{by:string;at:string;expiresAt:string;reference:string};attemptId?:string;attemptAt?:string;outcome?:DeliveryOutcome}}
function runtime(o:Options){
 if(!o.transport||!o.access)throw new E("SUPPLIER_DELIVERY_DISABLED",409);const c=o.transport.capabilities;if(c.idempotentDispatch!==true||c.terminalAttemptLookup!==true||c.fencesCancelledAttempts!==true||c.confirmedCancellation!==true)throw new E("SUPPLIER_TRANSPORT_UNSUPPORTED",409);
 const clock=o.now??(()=>new Date());validateDeliveryAccess(o.access,clock());return {db:o.db??prisma,transport:o.transport,clock,access:{...o.access,from:new Date(o.access.from).toISOString(),to:new Date(o.access.to).toISOString()}};
}
async function operation(p:AiPrincipal,operationId:string,tx:SqlClient){const [row]=await tx.$queryRaw<Array<{after:DeliveryOperation}>>(Prisma.sql`SELECT after FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND id=${id(operationId)} AND "entityType"='SUPPLIER_DELIVERY'`);if(!row||row.after.actorId!==p.userId)throw new E("SUPPLIER_DELIVERY_NOT_FOUND",404);return row.after;}
async function save(p:AiPrincipal,op:DeliveryOperation,tx:SqlClient){await tx.$executeRaw(Prisma.sql`UPDATE "MerchandisingAction" SET after=${JSON.stringify(op)}::jsonb WHERE "tenantId"=${p.tenantId} AND id=${op.id} AND "entityType"='SUPPLIER_DELIVERY'`);}
/** Select exactly one immutable supplier/currency file and verify the originally audited UTF-8 bytes. */
async function exportGroup(p:AiPrincipal,exportId:string,fileId:string,tx:SqlClient){
 const [row]=await tx.$queryRaw<Array<{snapshotId:string;file:GroupFile;rows:Array<Record<string,unknown>>;totals:unknown}>>(Prisma.sql`
  SELECT context->'dataVersion'->>'snapshotId' "snapshotId",f file,
   (SELECT jsonb_agg(r) FROM jsonb_array_elements(after->'rows') r WHERE r->>'supplierId'=f->>'supplierId' AND r->>'currency'=f->>'currency') rows,
   (SELECT jsonb_agg(t) FROM jsonb_array_elements(after->'totals') t WHERE t->>'supplierId'=f->>'supplierId' AND t->>'currency'=f->>'currency') totals
  FROM "MerchandisingAction" CROSS JOIN LATERAL jsonb_array_elements(after->'files') f WHERE "tenantId"=${p.tenantId} AND "entityType"='SCENARIO_EXPORT' AND action='reorder' AND context->>'kind'='SCENARIO_EXPORT_V1' AND "idempotencyKey"=${`export:${exportId}`} AND f->>'id'=${fileId}`);
 if(!row||!row.file.supplierId||!row.file.currency||!Array.isArray(row.rows)||!row.rows.length||row.rows.length>SUPPLIER_DELIVERY_MAX_ROWS||new Set(row.rows.map(r=>r.skuId)).size!==row.rows.length)throw new E("SUPPLIER_EXPORT_GROUP_NOT_FOUND",404);
 const {file}=row;if(typeof file.content!=="string"||Buffer.byteLength(file.content,"utf8")!==file.byteLength||file.byteLength>4*1024*1024||file.rowCount!==row.rows.length||createHash("sha256").update(file.content,"utf8").digest("hex")!==file.sha256)throw new E("SUPPLIER_EXPORT_INTEGRITY_FAILED",409);
 return {...row,groupHash:payloadHash({rows:row.rows,totals:row.totals,file:{id:file.id,sha256:file.sha256,byteLength:file.byteLength,rowCount:file.rowCount,supplierId:file.supplierId,currency:file.currency}})};
}
/** Verify live source/config/terms and approved catalog identity before every new external action. */
async function bind(p:AiPrincipal,exportId:string,fileId:string,recipientId:string,access:DeliveryAccessPolicy,tx:SqlClient,now:Date){
 const group=await exportGroup(p,exportId,fileId,tx),recipient=await recipientInTx(p,recipientId,tx),v=recipient.values;
 if(!recipient.approvedAt||v.supplierId!==group.file.supplierId||v.channelId!==access.channelId||!v.currencies.includes(group.file.currency)||Date.parse(v.validUntil)<=now.getTime())throw new E("SUPPLIER_RECIPIENT_NOT_APPROVED_FOR_GROUP",409);
 const terms=await supplierTermsInTx(p,v.supplierId,tx),[approval]=await tx.$queryRaw<Array<{termsHash:string}>>(Prisma.sql`SELECT after->>'termsHash' "termsHash" FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "idempotencyKey"=${`recipient-approved:${recipient.id}`}`);
 if(approval?.termsHash!==terms.hash)throw new E("SUPPLIER_TERMS_CHANGED",409);
 const {selected,snapshot}=await resolveAiSnapshot(p,group.snapshotId,tx);
 const [connection]=await tx.$queryRaw<Array<{revision:number;accountHost:string}>>(Prisma.sql`SELECT revision,"accountHost" FROM "ConnectorConnection" WHERE "tenantId"=${p.tenantId} AND "sourceId"=${selected.id}`);
 if(selected.id!==access.sourceId||!connection||connection.revision!==access.connectionRevision)throw new E("SUPPLIER_SOURCE_CHANGED",409);
 const skuIds=group.rows.map(r=>id(r.skuId));
 const current=await tx.$queryRaw<Array<{skuId:string;supplierId:string|null;currency:string|null;leadDays:number;coverDays:number;moq:number}>>(Prisma.sql`SELECT s."skuId",(s.details->'policy'->>'leadDays')::int "leadDays",(s.details->'policy'->>'coverDays')::int "coverDays",(s.details->'policy'->>'moq')::int moq,s.details->'policy'->>'supplierId' "supplierId",d.currency FROM "MerchandisingScreenSku" s JOIN "SkuDaily" d ON d.id=s."dailyId" AND d."tenantId"=s."tenantId" AND d."skuId"=s."skuId" WHERE s."tenantId"=${p.tenantId} AND s."snapshotId"=${snapshot.snapshotId} AND s."skuId" IN (${Prisma.join(skuIds)})`);
 if(current.length!==skuIds.length||current.some(r=>r.supplierId!==v.supplierId||r.currency!==group.file.currency))throw new E("SUPPLIER_EXPORT_SCOPE_CHANGED",409);
 if(current.some(row=>row.leadDays!==terms.terms.leadTimeDays||row.coverDays!==terms.terms.coverDays||row.moq!==terms.terms.moq))throw new E("SUPPLIER_EXPORT_TERMS_STALE",409);
 const binding:Binding={snapshotId:snapshot.snapshotId,sourceId:selected.id,selectionRevision:selected.revision,sourceStateKey:snapshot.sourceStateKey,connectionRevision:connection.revision,accountHost:connection.accountHost,recipientId,recipientConfigId:recipient.id,recipientRevision:recipient.revision,termsHash:terms.hash,policyHash:payloadHash(access),groupHash:group.groupHash};return {binding,group,recipient};
}
async function fresh(p:AiPrincipal,op:DeliveryOperation,r:ReturnType<typeof runtime>,tx:SqlClient){const live=await bind(p,op.exportId,op.fileId,op.binding.recipientId,r.access,tx,r.clock());if(payloadHash(live.binding)!==payloadHash(op.binding))throw new E("SUPPLIER_APPROVED_INPUTS_CHANGED",409);return live;}
async function reserve(p:AiPrincipal,r:ReturnType<typeof runtime>,kind:"SEND"|"LOOKUP"|"CANCEL",operationId:string,tx:SqlClient){validateDeliveryAccess(r.access,r.clock());return reserveExternalActionAttempt(p,tx,{entityType:"SUPPLIER_DELIVERY_ATTEMPT",prefix:"supplier-attempt",kind,operationId,quotaKey:r.access.quotaKey,from:r.access.from,to:r.access.to,limit:kind==="SEND"?r.access.maxSends:kind==="LOOKUP"?r.access.maxLookups:r.access.maxCancellations,policy:r.access,now:r.clock(),quotaError:()=>new E("SUPPLIER_DELIVERY_QUOTA_EXCEEDED",429)});}
async function settle(p:AiPrincipal,r:ReturnType<typeof runtime>,attemptId:string,state:string,evidence:unknown=null){return settleExternalActionAttempt(p,r.db,attemptId,"SUPPLIER_DELIVERY_ATTEMPT",state,evidence);}
async function external<T>(o:Options,fn:(signal:AbortSignal)=>Promise<T>){return withExternalActionTimeout(o.timeoutMs,()=>new E("SUPPLIER_TRANSPORT_TIMEOUT",502),fn);}
/** Preview one exact file group, not a newly recomputed order; no transport call or message is made. */
export async function previewSupplierDelivery(p:AiPrincipal,value:unknown,o:Options={}){
 if(!isRecord(value)||!keys(value,["exportId","fileId","recipientId"]))throw new E("INVALID_SUPPLIER_DELIVERY_PREVIEW");const exportId=id(value.exportId),fileId=id(value.fileId),recipientId=id(value.recipientId),r=runtime(o);
 return aiTransaction(p,r.db,async tx=>{
  const {binding,group,recipient}=await bind(p,exportId,fileId,recipientId,r.access,tx,r.clock());const {content,...file}=group.file;
  const message={subject:`Order request ${exportId}`,body:`Please review the attached supplier order request. Currency: ${file.currency}. Line items: ${file.rowCount}. Quantities, costs and amounts are the exact approved attachment values. Please acknowledge separately. Delivery of this request is not receipt of goods.`};
  const payloadHashValue=payloadHash({file:group.file,rows:group.rows,totals:group.totals,recipient,termsHash:binding.termsHash,message});
  const [duplicate]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "entityType"='SUPPLIER_DELIVERY' AND after->>'exportId'=${exportId} AND after->>'fileId'=${fileId} AND after->>'state' NOT IN ('DRAFT','APPROVED','FAILED') LIMIT 1`);
  if(duplicate)throw new E("SUPPLIER_GROUP_ALREADY_DISPATCHED_OR_UNKNOWN",409);
  const operationId=randomUUID(),op:DeliveryOperation={id:operationId,actorId:p.userId,exportId,fileId,createdAt:r.clock().toISOString(),state:"DRAFT",binding,recipient,rows:group.rows,totals:group.totals,file,message,payloadHash:payloadHashValue,previewHash:payloadHash({binding,payloadHash:payloadHashValue}),accessPolicy:structuredClone(r.access)};
  if(Buffer.byteLength(JSON.stringify(op),"utf8")>512*1024)throw new E("SUPPLIER_DELIVERY_PREVIEW_LIMIT",422);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context,"createdAt") VALUES (${operationId},${p.tenantId},${p.userId},${binding.snapshotId},'SUPPLIER_DELIVERY_PREVIEW','SUPPLIER_DELIVERY',${exportId},${`supplier-delivery:${operationId}`},${JSON.stringify(op)}::jsonb,'{"kind":"SUPPLIER_DELIVERY_V1"}',${r.clock()})`);return op;
 },true);
}
/** Approval pins recipient, attachment, rows, terms, message and context; approval itself never sends. */
export async function approveSupplierDelivery(p:AiPrincipal,value:unknown,o:Options={}){
 if(!isRecord(value)||!keys(value,["operationId","previewHash","reference"])||!supplierText(value.reference)||typeof value.previewHash!=="string")throw new E("INVALID_SUPPLIER_DELIVERY_APPROVAL");const operationId=id(value.operationId),hash=value.previewHash,reference=value.reference,r=runtime(o);
 return aiTransaction(p,r.db,async tx=>{const op=await operation(p,operationId,tx);await fresh(p,op,r,tx);if(op.previewHash!==hash)throw new E("SUPPLIER_PREVIEW_CHANGED",409);if(op.state==="APPROVED"){if(op.approval?.reference!==reference)throw new E("SUPPLIER_APPROVAL_CONFLICT",409);return op;}if(op.state!=="DRAFT"||r.clock().getTime()-Date.parse(op.createdAt)>SUPPLIER_APPROVAL_TTL_MS)throw new E("SUPPLIER_PREVIEW_EXPIRED_OR_TERMINAL",409);op.state="APPROVED";op.approval={by:p.userId,reference,at:r.clock().toISOString(),expiresAt:new Date(r.clock().getTime()+SUPPLIER_APPROVAL_TTL_MS).toISOString()};await save(p,op,tx);return op;},true);
}
/** One durable claim per supplier/currency group, before any send. Duplicate requests never invoke the transport twice. */
export async function sendSupplierDelivery(p:AiPrincipal,value:unknown,o:Options={}){
 if(!isRecord(value)||!keys(value,["operationId","previewHash"])||typeof value.previewHash!=="string")throw new E("INVALID_SUPPLIER_DELIVERY_SEND");const operationId=id(value.operationId),hash=value.previewHash,r=runtime(o);
 const prepared=await aiTransaction(p,r.db,async tx=>{
  const op=await operation(p,operationId,tx);if(op.previewHash!==hash)throw new E("SUPPLIER_PREVIEW_CHANGED",409);if(op.state!=="APPROVED")return {op};const live=await fresh(p,op,r,tx);
  if(!op.approval||op.approval.by!==p.userId||Date.parse(op.approval.expiresAt)<=r.clock().getTime())throw new E("SUPPLIER_APPROVAL_EXPIRED",409);
  const [other]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "entityType"='SUPPLIER_DELIVERY' AND id<>${op.id} AND after->>'exportId'=${op.exportId} AND after->>'fileId'=${op.fileId} AND after->>'state' NOT IN ('DRAFT','APPROVED','FAILED') LIMIT 1`);
  if(other)throw new E("SUPPLIER_GROUP_ALREADY_DISPATCHED_OR_UNKNOWN",409);
  op.attemptId=await reserve(p,r,"SEND",op.id,tx);op.attemptAt=r.clock().toISOString();op.state="DISPATCHING";await save(p,op,tx);return {op,file:live.group.file};
 },true);
 if(!prepared.file)return prepared.op;
 let outcome:DeliveryOutcome={state:"UNKNOWN",destinationId:prepared.op.recipient.values.destinationId,payloadHash:prepared.op.payloadHash};
 try{const response=await external(o,signal=>r.transport.send({attemptId:prepared.op.attemptId!,destinationId:prepared.op.recipient.values.destinationId,recipientRevision:prepared.op.recipient.revision,payloadHash:prepared.op.payloadHash,subject:prepared.op.message.subject,body:prepared.op.message.body,attachment:{name:prepared.file!.name,content:prepared.file!.content,sha256:prepared.file!.sha256},approvedUntil:prepared.op.approval!.expiresAt,signal}));const parsed=parseDeliveryOutcome(response,outcome.destinationId,outcome.payloadHash);if(parsed.state!=="CANCELLED")outcome=parsed;}catch{/* Unknown is conservative; a failed transport does not prove non-delivery. */}
 await settle(p,r,prepared.op.attemptId!,outcome.state,outcome);
 return aiTransaction(p,r.db,async tx=>{const op=await operation(p,operationId,tx);if(op.state!=="DISPATCHING"||op.attemptId!==prepared.op.attemptId)return op;op.lastOutcome=outcome;op.deliveryId=outcome.deliveryId;op.state=outcome.state==="NOT_SENT"?"FAILED":outcome.state==="UNKNOWN"?"DELIVERY_UNKNOWN":outcome.state as "SENT"|"ACKNOWLEDGED";await save(p,op,tx);return op;},true);
}
/** Reconciliation uses the original delivery account and destination, even if the catalog/source has since changed. */
function recoveryAccount(op:DeliveryOperation,r:ReturnType<typeof runtime>){if(op.accessPolicy.accountId!==r.access.accountId||op.accessPolicy.channelId!==r.access.channelId||op.binding.sourceId!==r.access.sourceId)throw new E("SUPPLIER_RECOVERY_ACCOUNT_CHANGED",409);}
export async function reconcileSupplierDelivery(p:AiPrincipal,value:unknown,o:Options={}){
 if(!isRecord(value)||!keys(value,["operationId"]))throw new E("INVALID_SUPPLIER_DELIVERY_RECOVERY");const operationId=id(value.operationId),r=runtime(o),op=await aiTransaction(p,r.db,async tx=>operation(p,operationId,tx),true);recoveryAccount(op,r);
 const cancellation=op.cancellation&&["DISPATCHING","UNKNOWN"].includes(op.cancellation.state)?op.cancellation:undefined;
 if(!op.attemptId||["DRAFT","APPROVED","FAILED","CANCELLED","RECEIVED"].includes(op.state)&&!cancellation)return op;
 if((op.state==="DISPATCHING"||op.state==="DELIVERY_UNKNOWN"||cancellation)&&r.clock().getTime()-Date.parse(cancellation?.attemptAt??op.attemptAt!)<30000)throw new E("SUPPLIER_DELIVERY_STILL_IN_FLIGHT",409);
 const lookupId=await aiTransaction(p,r.db,tx=>reserve(p,r,"LOOKUP",op.id,tx),true),target=cancellation?.attemptId??op.attemptId;
 let outcome:DeliveryOutcome;
 try{outcome=parseDeliveryOutcome(await external(o,signal=>r.transport.lookup({attemptId:target!,signal})),op.recipient.values.destinationId,op.payloadHash);if(op.deliveryId&&outcome.deliveryId&&op.deliveryId!==outcome.deliveryId)throw new E("SUPPLIER_DELIVERY_STATUS_CONFLICT",409);await settle(p,r,lookupId,"DONE",outcome);}catch(error){await settle(p,r,lookupId,"FAILED_OR_UNKNOWN",{reason:error instanceof E?error.code:"SUPPLIER_LOOKUP_FAILED"});throw error instanceof E?error:new E("SUPPLIER_LOOKUP_FAILED",502);}
 return aiTransaction(p,r.db,async tx=>{const current=await operation(p,operationId,tx);recoveryAccount(current,r);
  if(cancellation){if(current.cancellation?.attemptId!==target||!["DISPATCHING","UNKNOWN"].includes(current.cancellation.state))return current;current.cancellation.outcome=outcome;current.cancellation.state=outcome.state==="CANCELLED"?"CANCELLED":outcome.state==="UNKNOWN"?"UNKNOWN":"REJECTED";if(outcome.state==="CANCELLED"&&current.state!=="RECEIVED")current.state="CANCELLED";}
  else if(current.attemptId===target&&!["CANCELLED","RECEIVED"].includes(current.state)){
   // Known sent/acknowledged evidence never regresses to not-sent/unknown on an inconsistent later lookup.
   if(["SENT","ACKNOWLEDGED"].includes(current.state)&&["NOT_SENT","UNKNOWN"].includes(outcome.state))throw new E("SUPPLIER_DELIVERY_STATUS_CONFLICT",409);
   current.lastOutcome=outcome;if(outcome.deliveryId)current.deliveryId=outcome.deliveryId;
   current.state=outcome.state==="NOT_SENT"?"FAILED":outcome.state==="UNKNOWN"?"DELIVERY_UNKNOWN":outcome.state==="CANCELLED"?"CANCELLED":current.state==="ACKNOWLEDGED"&&outcome.state==="SENT"?"ACKNOWLEDGED":outcome.state;
  }
  current.reconciliation={by:p.userId,at:r.clock().toISOString(),accessPolicy:r.access,lookupAttemptId:lookupId,targetAttemptId:target};await save(p,current,tx);return current;
 },true);
}
/** A cancellation is new intent with its own reason, hash, approval and transport attempt; sending cannot be undone by a DB rollback. */
export async function previewSupplierCancellation(p:AiPrincipal,value:unknown,o:Options={}){
 if(!isRecord(value)||!keys(value,["operationId","reason"])||!supplierText(value.reason))throw new E("INVALID_SUPPLIER_CANCELLATION");const operationId=id(value.operationId),reason=value.reason,r=runtime(o);
 return aiTransaction(p,r.db,async tx=>{const op=await operation(p,operationId,tx);recoveryAccount(op,r);if(!["SENT","ACKNOWLEDGED"].includes(op.state)||!op.deliveryId)throw new E("SUPPLIER_CANCELLATION_NOT_ELIGIBLE",409);if(op.cancellation)throw new E("SUPPLIER_CANCELLATION_ALREADY_EXISTS",409);const cancellationId=randomUUID();op.cancellation={id:cancellationId,policyHash:payloadHash(r.access),reason,state:"DRAFT",createdAt:r.clock().toISOString(),previewHash:payloadHash({cancellationId,operationId,deliveryId:op.deliveryId,payloadHash:op.payloadHash,binding:op.binding,policyHash:payloadHash(r.access),reason})};await save(p,op,tx);return op;},true);
}
export async function approveSupplierCancellation(p:AiPrincipal,value:unknown,o:Options={}){
 if(!isRecord(value)||!keys(value,["operationId","cancellationHash","reference"])||typeof value.cancellationHash!=="string"||!supplierText(value.reference))throw new E("INVALID_SUPPLIER_CANCELLATION_APPROVAL");const operationId=id(value.operationId),hash=value.cancellationHash,reference=value.reference,r=runtime(o);
 return aiTransaction(p,r.db,async tx=>{const op=await operation(p,operationId,tx);recoveryAccount(op,r);const c=op.cancellation;if(!c||c.previewHash!==hash||c.policyHash!==payloadHash(r.access))throw new E("SUPPLIER_CANCELLATION_PREVIEW_CHANGED",409);if(c.state==="APPROVED"){if(c.approval?.reference!==reference)throw new E("SUPPLIER_CANCELLATION_APPROVAL_CONFLICT",409);return op;}if(c.state!=="DRAFT"||!["SENT","ACKNOWLEDGED"].includes(op.state)||r.clock().getTime()-Date.parse(c.createdAt)>SUPPLIER_APPROVAL_TTL_MS)throw new E("SUPPLIER_CANCELLATION_EXPIRED_OR_TERMINAL",409);c.state="APPROVED";c.approval={by:p.userId,at:r.clock().toISOString(),expiresAt:new Date(r.clock().getTime()+SUPPLIER_APPROVAL_TTL_MS).toISOString(),reference};await save(p,op,tx);return op;},true);
}
export async function cancelSupplierDelivery(p:AiPrincipal,value:unknown,o:Options={}){
 if(!isRecord(value)||!keys(value,["operationId","cancellationHash"])||typeof value.cancellationHash!=="string")throw new E("INVALID_SUPPLIER_CANCELLATION_EXECUTION");const operationId=id(value.operationId),hash=value.cancellationHash,r=runtime(o);
 const prepared=await aiTransaction(p,r.db,async tx=>{const op=await operation(p,operationId,tx);const c=op.cancellation;if(!c||c.previewHash!==hash||c.policyHash!==payloadHash(r.access))throw new E("SUPPLIER_CANCELLATION_PREVIEW_CHANGED",409);if(c.state!=="APPROVED")return {op,dispatch:false};recoveryAccount(op,r);if(!["SENT","ACKNOWLEDGED"].includes(op.state)||!op.deliveryId||!c.approval||c.approval.by!==p.userId||Date.parse(c.approval.expiresAt)<=r.clock().getTime())throw new E("SUPPLIER_CANCELLATION_APPROVAL_EXPIRED",409);c.attemptId=await reserve(p,r,"CANCEL",op.id,tx);c.attemptAt=r.clock().toISOString();c.state="DISPATCHING";await save(p,op,tx);return {op,dispatch:true};},true);
 if(!prepared.dispatch)return prepared.op;const c=prepared.op.cancellation!;
 let outcome:DeliveryOutcome={state:"UNKNOWN",destinationId:prepared.op.recipient.values.destinationId,payloadHash:prepared.op.payloadHash};
 try{outcome=parseDeliveryOutcome(await external(o,signal=>r.transport.cancel({attemptId:c.attemptId!,originalAttemptId:prepared.op.attemptId!,deliveryId:prepared.op.deliveryId!,destinationId:prepared.op.recipient.values.destinationId,payloadHash:prepared.op.payloadHash,reason:c.reason,approvedUntil:c.approval!.expiresAt,signal})),outcome.destinationId,outcome.payloadHash);if(outcome.deliveryId&&outcome.deliveryId!==prepared.op.deliveryId)throw new E("SUPPLIER_DELIVERY_STATUS_CONFLICT",409);}catch{outcome={state:"UNKNOWN",destinationId:prepared.op.recipient.values.destinationId,payloadHash:prepared.op.payloadHash};/* No automatic cancellation retry after an uncertain result. */}
 await settle(p,r,c.attemptId!,outcome.state,outcome);
 return aiTransaction(p,r.db,async tx=>{const op=await operation(p,operationId,tx),current=op.cancellation!;if(current.attemptId!==c.attemptId||current.state!=="DISPATCHING")return op;current.outcome=outcome;current.state=outcome.state==="CANCELLED"?"CANCELLED":outcome.state==="UNKNOWN"?"UNKNOWN":"REJECTED";if(outcome.state==="CANCELLED"&&op.state!=="RECEIVED")op.state="CANCELLED";await save(p,op,tx);return op;},true);
}
/** Supplier acknowledgment is not goods receipt. Reuse #108's validated posted-receipt evidence instead of duplicating receipt rules. */
export async function recordSupplierGoodsReceipt(p:AiPrincipal,value:unknown,db:SqlDatabase=prisma){
 if(!isRecord(value)||!keys(value,["operationId","executionId"]))throw new E("INVALID_SUPPLIER_GOODS_RECEIPT");const operationId=id(value.operationId),executionId=id(value.executionId);
 return aiTransaction(p,db,async tx=>{const op=await operation(p,operationId,tx),e=await readRetrospectiveExecution(p,executionId,tx);if(op.state==="RECEIVED"){if((op.receiptEvidence as {executionId:string})?.executionId!==executionId)throw new E("SUPPLIER_RECEIPT_ALREADY_RECORDED",409);return op;}if(!["SENT","ACKNOWLEDGED"].includes(op.state)||op.cancellation&&["DISPATCHING","UNKNOWN","CANCELLED"].includes(op.cancellation.state)||e.command.kind!=="reorder"||e.command.event!=="RECEIVED"||e.command.exportId!==op.exportId||e.sourceId!==op.binding.sourceId||payloadHash(e.command.skuIds.slice().sort())!==payloadHash(op.rows.map(r=>String(r.skuId)).sort())||e.exportRows.some(r=>r.supplierId!==op.file.supplierId||r.currency!==op.file.currency))throw new E("SUPPLIER_GOODS_RECEIPT_UNVERIFIED",409);op.state="RECEIVED";op.receiptEvidence={executionId,policyVersion:e.policyVersion,receiptCoverage:e.receiptCoverage,receiptEvidence:e.receiptEvidence,confirmedBy:p.userId};await save(p,op,tx);return op;},true);
}
/** Reading an actor-owned audit never invokes a transport or resends an order. */
export async function readSupplierDelivery(p:AiPrincipal,operationId:string,db:SqlDatabase=prisma){return aiTransaction(p,db,tx=>operation(p,operationId,tx),true);}
