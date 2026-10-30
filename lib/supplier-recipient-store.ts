import "server-only";
import {randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {prisma} from "./prisma";
import {isRecord} from "./api-contracts";
import {aiTransaction} from "./ai-execution/budget";
import type {AiPrincipal} from "./ai-execution/contracts";
import type {SqlClient,SqlDatabase} from "./connectors/database";
import {payloadHash} from "./connectors/order-storage";
import {parseSupplierRecipient,supplierActionId,supplierKeys,supplierText,SupplierDeliveryError as E,type SupplierRecipient} from "./supplier-delivery";
export interface RecipientRecord {id:string;revision:number;values:SupplierRecipient;approvedAt:Date|string|null;approvalReference:string|null}
export async function recipientInTx(p:AiPrincipal,id:string,tx:SqlClient){
 const [row]=await tx.$queryRaw<RecipientRecord[]>(Prisma.sql`SELECT id,revision,values,"approvedAt","approvalReference" FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND "configType"='GENERAL' AND key=${`supplier-recipient:${supplierActionId(id)}`} ORDER BY revision DESC LIMIT 1`);
 if(!row)throw new E("SUPPLIER_RECIPIENT_NOT_FOUND",404);row.values=parseSupplierRecipient(row.values);if(row.approvedAt)row.approvedAt=new Date(row.approvedAt).toISOString();return row;
}
export async function supplierTermsInTx(p:AiPrincipal,supplierId:string,tx:SqlClient){
 const [supplier]=await tx.$queryRaw<Array<{id:string;leadTimeDays:number|null;coverDays:number|null;moq:number|null;termsVerifiedAt:Date|string|null}>>(Prisma.sql`SELECT id,"leadTimeDays","coverDays",moq,"termsVerifiedAt" FROM "Supplier" WHERE "tenantId"=${p.tenantId} AND id=${supplierActionId(supplierId)}`);
 if(!supplier||!supplier.termsVerifiedAt||supplier.leadTimeDays===null||supplier.coverDays===null||!supplier.moq||supplier.moq<1)throw new E("SUPPLIER_TERMS_UNVERIFIED",409);
 const terms={...supplier,termsVerifiedAt:new Date(supplier.termsVerifiedAt).toISOString()};return {terms,hash:payloadHash(terms)};
}
export async function saveSupplierRecipient(p:AiPrincipal,id:string,value:unknown,db:SqlDatabase=prisma){
 supplierActionId(id);if(!isRecord(value)||!supplierKeys(value,["expectedRevision","recipient"])||!Number.isInteger(value.expectedRevision)||Number(value.expectedRevision)<0||Number(value.expectedRevision)>10000)throw new E("INVALID_SUPPLIER_RECIPIENT_REVISION");
 const recipient=parseSupplierRecipient(value.recipient);
 return aiTransaction(p,db,async tx=>{
  await supplierTermsInTx(p,recipient.supplierId,tx);const [old]=await tx.$queryRaw<Array<{revision:number}>>(Prisma.sql`SELECT revision FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND "configType"='GENERAL' AND key=${`supplier-recipient:${id}`} ORDER BY revision DESC LIMIT 1`);
  if((old?.revision??0)!==value.expectedRevision)throw new E("SUPPLIER_RECIPIENT_REVISION_CONFLICT",409);const configId=randomUUID(),revision=Number(value.expectedRevision)+1;
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive") VALUES (${configId},${p.tenantId},'GENERAL',${`supplier-recipient:${id}`},${revision},${JSON.stringify(recipient)}::jsonb,false)`);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",context) VALUES (${randomUUID()},${p.tenantId},${p.userId},${configId},'SUPPLIER_RECIPIENT_DRAFT','SUPPLIER_RECIPIENT',${id},${`recipient-draft:${configId}`},${JSON.stringify({revision,recipientHash:payloadHash(recipient)})}::jsonb)`);return {id,configId,revision,state:"DRAFT"};
 },true);
}
export async function approveSupplierRecipient(p:AiPrincipal,id:string,value:unknown,db:SqlDatabase=prisma,now=new Date()){
 if(!isRecord(value)||!supplierKeys(value,["configId","reference"])||!supplierText(value.reference))throw new E("INVALID_SUPPLIER_RECIPIENT_APPROVAL");const configId=supplierActionId(value.configId),reference=value.reference;
 return aiTransaction(p,db,async tx=>{
  const row=await recipientInTx(p,id,tx);if(row.id!==configId)throw new E("SUPPLIER_RECIPIENT_REVISION_CONFLICT",409);if(Date.parse(row.values.validUntil)<=now.getTime())throw new E("SUPPLIER_RECIPIENT_EXPIRED",409);
  const terms=await supplierTermsInTx(p,row.values.supplierId,tx);
  if(row.approvedAt){if(row.approvalReference!==reference)throw new E("SUPPLIER_RECIPIENT_APPROVAL_CONFLICT",409);return {configId,revision:row.revision,state:"APPROVED"};}
  await tx.$executeRaw(Prisma.sql`UPDATE "MerchandisingConfig" SET "approvedAt"=${now},"approvedById"=${p.userId},"approvalReference"=${reference} WHERE "tenantId"=${p.tenantId} AND id=${configId}`);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context) VALUES (${randomUUID()},${p.tenantId},${p.userId},${configId},'SUPPLIER_RECIPIENT_APPROVED','SUPPLIER_RECIPIENT',${id},${`recipient-approved:${configId}`},${JSON.stringify({termsHash:terms.hash,terms:terms.terms,reference,consentReference:row.values.consentReference,verificationReference:row.values.verificationReference})}::jsonb,'{}')`);return {configId,revision:row.revision,state:"APPROVED"};
 },true);
}
export async function readSupplierRecipient(p:AiPrincipal,id:string,db:SqlDatabase=prisma){return aiTransaction(p,db,async tx=>({recipientId:id,...await recipientInTx(p,id,tx)}),true);}
