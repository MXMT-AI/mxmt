import "server-only";
import {randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {prisma} from "./prisma";
import type {SqlClient,SqlDatabase} from "./connectors/database";
import {payloadHash} from "./connectors/order-storage";
import {aiTransaction} from "./ai-execution/budget";
import type {AiPrincipal} from "./ai-execution/contracts";
import {readScreenSnapshot} from "./merchandising-snapshot";
import {parseExecutionCommand,RetrospectiveExecutionError as E,RETROSPECTIVE_POLICY_VERSION,type ExecutionCommand} from "./retrospective-contract";
export interface ExecutionReceipt {executionId:string;policyVersion:string;actorId:string;confirmedAt:string;command:ExecutionCommand;sourceId:string;snapshotId:string;timezone:string;selectionRevision:number;exportRows:Array<Record<string,unknown>>;exportReceipt:unknown;exportParameters:unknown;exportProvenance:unknown;receiptCoverage:string|null;evidenceKind:"OWNER_ATTESTATION";receiptEvidence:unknown;inputHash:string}
export async function readRetrospectiveExecution(p:AiPrincipal,id:string,tx:SqlClient){
 const [r]=await tx.$queryRaw<Array<{after:ExecutionReceipt}>>(Prisma.sql`SELECT after FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND id=${id} AND "entityType"='RETROSPECTIVE_EXECUTION' AND context->>'kind'='RETROSPECTIVE_EXECUTION_V1'`);
 if(!r)throw new E("EXECUTION_NOT_FOUND",404);return r.after;
}
export async function confirmScenarioExecution(p:AiPrincipal,value:unknown,db:SqlDatabase=prisma,now=new Date()){
 const q=parseExecutionCommand(value),requestHash=payloadHash(q);
 return aiTransaction(p,db,async tx=>{
  const [old]=await tx.$queryRaw<Array<{actorId:string;context:{requestHash:string};after:ExecutionReceipt}>>(Prisma.sql`SELECT "actorId",context,after FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "idempotencyKey"=${`retrospective-confirm:${q.requestKey}`}`);
  if(old){if(old.actorId!==p.userId||old.context.requestHash!==requestHash)throw new E("EXECUTION_REQUEST_CONFLICT",409);return old.after;}
  const [audit]=await tx.$queryRaw<Array<{receipt:{kind:string;createdAt:string};provenance:{snapshotId:string};parameters:unknown;rows:Array<Record<string,unknown>>}>>(Prisma.sql`
   SELECT after->'receipt' receipt,context->'dataVersion' provenance,context->'request' parameters,(SELECT jsonb_agg(row) FROM jsonb_array_elements(after->'rows') row WHERE row->>'skuId' IN (${Prisma.join(q.skuIds)})) rows
   FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "entityType"='SCENARIO_EXPORT' AND "idempotencyKey"=${`export:${q.exportId}`} AND context->>'kind'='SCENARIO_EXPORT_V1'`);
  if(!audit||audit.receipt.kind!==q.kind)throw new E("EXECUTION_EXPORT_NOT_FOUND",404);
  if(Date.parse(q.occurredAt)<Date.parse(audit.receipt.createdAt)||Date.parse(q.occurredAt)>now.getTime())throw new E("EXECUTION_TIME_INVALID",409);
  const rows=audit.rows??[];
  if(rows.length!==q.skuIds.length||new Set(rows.map(r=>r.skuId)).size!==rows.length)throw new E("EXECUTION_SUBSET_MISMATCH",409);
  if(Buffer.byteLength(JSON.stringify({rows,receipt:audit.receipt,provenance:audit.provenance,parameters:audit.parameters}),"utf8")>512*1024)throw new E("EXECUTION_EVIDENCE_LIMIT",422);
  const snapshot=await readScreenSnapshot(p.tenantId,audit.provenance.snapshotId,tx);
  let receiptEvidence:unknown=null;
  if(q.previousExecutionId){
   const previous=await readRetrospectiveExecution(p,q.previousExecutionId,tx),expected=q.event==="ACCEPTED"?"SENT":"ACCEPTED";
   if(previous.command.exportId!==q.exportId||previous.command.event!==expected||payloadHash(previous.command.skuIds)!==payloadHash(q.skuIds)||Date.parse(previous.command.occurredAt)>Date.parse(q.occurredAt))throw new E("EXECUTION_TRANSITION_INVALID",409);
   const [child]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "entityType"='RETROSPECTIVE_EXECUTION' AND context->>'previousExecutionId'=${q.previousExecutionId} LIMIT 1`);
   if(child)throw new E("EXECUTION_TRANSITION_ALREADY_RECORDED",409);
  }else{
   const [overlap]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "entityType"='RETROSPECTIVE_EXECUTION' AND context->>'exportId'=${q.exportId} AND context->>'event'=${q.event} AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(context->'skuIds') item WHERE item IN (${Prisma.join(q.skuIds)})) LIMIT 1`);
   if(overlap)throw new E("EXECUTION_SUBSET_ALREADY_CONFIRMED",409);
  }
  if(q.event==="RECEIVED"){
   const receipts=await tx.$queryRaw<Array<{receiptId:string;skuId:string;quantity:string;supplierId:string|null;receivedAt:Date|string;sourceRecordKey:string}>>(Prisma.sql`
    SELECT r.id "receiptId",l."skuId",l.quantity::text quantity,r."supplierId",r."receivedAt",r."sourceRecordKey" FROM "Receipt" r JOIN "ReceiptLine" l ON l."receiptId"=r.id AND l."tenantId"=r."tenantId" JOIN "DataImportRun" run ON run.id=r."importRunId" AND run."sourceId"=r."sourceId" AND run."tenantId"=r."tenantId"
    WHERE r."tenantId"=${p.tenantId} AND r."sourceId"=${snapshot.sourceId} AND r.id IN (${Prisma.join(q.receiptIds)}) AND r."movementType"='SUPPLIER_RECEIPT' AND r."postingVerifiedAt" IS NOT NULL AND r."postingVerifiedAt"<=${now} AND r."receivedAt">=${new Date(audit.receipt.createdAt)} AND r."receivedAt"<=${new Date(q.occurredAt)} AND r."observedAt"<=${now} AND l."skuId" IN (${Prisma.join(q.skuIds)}) AND l.quantity>0 AND run.status IN ('SUCCESS','WARNING') ORDER BY r.id,l.id LIMIT 1001`);
   if(receipts.length>1000||q.receiptIds.some(id=>!receipts.some(r=>r.receiptId===id))||rows.some(row=>!receipts.some(r=>r.skuId===row.skuId&&r.supplierId===row.supplierId))||receipts.some(r=>rows.find(row=>row.skuId===r.skuId)?.supplierId!==r.supplierId))throw new E("EXECUTION_RECEIPTS_UNVERIFIED",409);
   if(Math.max(...receipts.map(r=>new Date(r.receivedAt).getTime()))!==Date.parse(q.occurredAt))throw new E("EXECUTION_RECEIPT_TIME_MISMATCH",409);
   receiptEvidence=receipts.map(r=>({...r,receivedAt:new Date(r.receivedAt).toISOString()}));
  }
  const executionId=randomUUID(),frozen:ExecutionReceipt={executionId,policyVersion:RETROSPECTIVE_POLICY_VERSION,actorId:p.userId,confirmedAt:now.toISOString(),command:q,sourceId:snapshot.sourceId,snapshotId:snapshot.snapshotId,timezone:snapshot.sourceState.timezone,selectionRevision:snapshot.sourceState.selectionRevision??0,exportRows:rows,exportReceipt:audit.receipt,exportParameters:audit.parameters,exportProvenance:audit.provenance,receiptCoverage:q.event==="RECEIVED"?"POSITIVE_VERIFIED_LINES_NOT_FULL_ORDER_COMPLETION":null,evidenceKind:"OWNER_ATTESTATION",receiptEvidence,inputHash:payloadHash({requestHash,rows,receipt:audit.receipt,parameters:audit.parameters,receiptEvidence,snapshotId:snapshot.snapshotId})};
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context,"createdAt") VALUES (${executionId},${p.tenantId},${p.userId},${snapshot.snapshotId},'CONFIRM_EXECUTION','RETROSPECTIVE_EXECUTION',${q.exportId},${`retrospective-confirm:${q.requestKey}`},${JSON.stringify(frozen)}::jsonb,${JSON.stringify({kind:"RETROSPECTIVE_EXECUTION_V1",requestHash,exportId:q.exportId,event:q.event,skuIds:q.skuIds,previousExecutionId:q.previousExecutionId})}::jsonb,${now})`);
  return frozen;
 },true);
}
