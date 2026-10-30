import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { isRecord } from "./api-contracts";
import type { SqlClient,SqlDatabase } from "./connectors/database";
import { payloadHash } from "./connectors/order-storage";
import { aiTransaction } from "./ai-execution/budget";
import type { AiPrincipal } from "./ai-execution/contracts";
import { resolveCustomLabelEvidence } from "./custom-label-evidence";
import { CustomLabelError,LABEL_CONTRACT_VERSION,LABEL_EXPORTS_PER_DAY,parseLabelProfile,parseLabelScope,labelIdentifier,
  assignCustomLabels,customLabelCsv,type LabelProfile,type LabelScope } from "./custom-labels";

interface ProfileRecord {id:string;revision:number;values:LabelProfile;approvedById:string;approvedAt:string;approvalReference:string}
const key=(id:string)=>`custom-labels:${id}`;
const uuid=(value:unknown):string=>{if(typeof value!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new CustomLabelError("INVALID_LABEL_EXPORT_ID");return value.toLowerCase();};
async function profileInTx(p:AiPrincipal,profileId:string,tx:SqlClient):Promise<ProfileRecord>{
  const [row]=await tx.$queryRaw<ProfileRecord[]>(Prisma.sql`SELECT id,revision,values,"approvedById","approvedAt","approvalReference" FROM "MerchandisingConfig"
    WHERE "tenantId"=${p.tenantId} AND "configType"='GENERAL' AND key=${key(profileId)} AND "approvedAt" IS NOT NULL ORDER BY revision DESC LIMIT 1`);
  if(!row)throw new CustomLabelError("LABEL_PROFILE_NOT_FOUND",404);
  row.values=parseLabelProfile(row.values);row.approvedAt=new Date(row.approvedAt).toISOString();return row;
}
export async function approveCustomLabelProfile(p:AiPrincipal,profileId:string,value:unknown,db:SqlDatabase=prisma,now=new Date()){
  labelIdentifier(profileId);
  if(!isRecord(value)||Object.keys(value).sort().join()!=="approvalReference,expectedRevision,profile"||!Number.isSafeInteger(value.expectedRevision)||Number(value.expectedRevision)<0||Number(value.expectedRevision)>10000||typeof value.approvalReference!=="string"||!value.approvalReference.trim()||value.approvalReference.length>1000)throw new CustomLabelError("INVALID_LABEL_APPROVAL");
  const profile=parseLabelProfile(value.profile),expectedRevision=Number(value.expectedRevision),approvalReference=value.approvalReference;
  return aiTransaction(p,db,async tx=>{
    const [source]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "DataSource" WHERE "tenantId"=${p.tenantId} AND id=${profile.sourceId}`);
    if(!source)throw new CustomLabelError("LABEL_SOURCE_NOT_FOUND",404);
    const [previous]=await tx.$queryRaw<Array<{id:string;revision:number}>>(Prisma.sql`SELECT id,revision FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND "configType"='GENERAL' AND key=${key(profileId)} ORDER BY revision DESC LIMIT 1`);
    if((previous?.revision??0)!==expectedRevision)throw new CustomLabelError("LABEL_PROFILE_REVISION_CONFLICT",409);
    const [other]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM (
      SELECT DISTINCT ON (key) id,values FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND "configType"='GENERAL'
        AND key LIKE 'custom-labels:%' AND key<>${key(profileId)} AND "approvedAt" IS NOT NULL ORDER BY key,revision DESC) latest
      WHERE values->'target'=${JSON.stringify(profile.target)}::jsonb LIMIT 1`);
    if(other)throw new CustomLabelError("LABEL_TARGET_PROFILE_CONFLICT",409);
    const skuIds=[...new Set(profile.mappings.map(m=>m.skuId))];
    if(skuIds.length){
      const [count]=await tx.$queryRaw<Array<{n:number}>>(Prisma.sql`SELECT count(*)::int n FROM "Sku" WHERE "tenantId"=${p.tenantId} AND id IN (${Prisma.join(skuIds)})`);
      if(count.n!==skuIds.length)throw new CustomLabelError("LABEL_MAPPING_SKU_NOT_FOUND",404);
    }
    const id=randomUUID(),revision=expectedRevision+1;
    await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedById","approvedAt","approvalReference")
      VALUES (${id},${p.tenantId},'GENERAL',${key(profileId)},${revision},${JSON.stringify(profile)}::jsonb,false,${p.userId},${now},${approvalReference})`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",before,after,context)
      VALUES (${randomUUID()},${p.tenantId},${p.userId},${id},'CUSTOM_LABEL_PROFILE_APPROVED','CUSTOM_LABEL_PROFILE',${profileId},${`label-profile:${id}`},${JSON.stringify(previous??null)}::jsonb,
      ${JSON.stringify({configId:id,revision,profileHash:payloadHash(profile),approvalReference})}::jsonb,${JSON.stringify({kind:"CUSTOM_LABEL_PROFILE_V1",contractVersion:LABEL_CONTRACT_VERSION})}::jsonb)`);
    return {profileId,configId:id,revision,profile,approvedBy:p.userId,approvedAt:now.toISOString(),approvalReference,contractVersion:LABEL_CONTRACT_VERSION};
  },true);
}
export async function readCustomLabelProfile(p:AiPrincipal,profileId:string,db:SqlDatabase=prisma){
  labelIdentifier(profileId);return aiTransaction(p,db,async tx=>({profileId,...await profileInTx(p,profileId,tx)}));
}
async function previewInTx(p:AiPrincipal,scope:LabelScope,tx:SqlClient){
  const profile=await profileInTx(p,scope.profileId,tx);
  const evidence=await resolveCustomLabelEvidence(p,scope,profile.values.sourceId,tx),rows=evidence.rows;
  const result=assignCustomLabels(profile.values,rows);
  const file=customLabelCsv(profile.values,result.assignments);
  const uniqueValues=Object.fromEntries(profile.values.ownedSlots.map(slot=>{const field=`custom_label_${slot}`;return [field,new Set(result.assignments.map(a=>a.labels[field].toLowerCase())).size];}));
  const quotaExceeded=Object.values(uniqueValues).some(n=>n>1000)&&profile.values.target.provider==="google";
  const provenance={contractVersion:LABEL_CONTRACT_VERSION,profileId:scope.profileId,configId:profile.id,ruleRevision:profile.revision,
    profileHash:payloadHash(profile.values),approvedBy:profile.approvedById,approvedAt:profile.approvedAt,approvalReference:profile.approvalReference,
    snapshotId:scope.snapshotId,snapshotCreatedAt:evidence.snapshotCreatedAt,
    source:evidence.envelope,sourceFingerprint:evidence.fingerprint,scope};
  const sha256=createHash("sha256").update(file,"utf8").digest("hex");
  const previewId=payloadHash({provenance,result,sha256});
  const warnings=["MANUAL_PATCH_MERGE_REVIEW_REQUIRED",...(profile.values.target.provider==="google"?["ACCOUNT_WIDE_LABEL_CARDINALITY_NOT_VERIFIED"]:["META_CUSTOM_LABEL_POLICY_REVIEW_POSSIBLE"])];
  return {version:1 as const,previewId,target:profile.values.target,ownedSlots:profile.values.ownedSlots,provenance,...result,warnings,
    summary:{sourceRows:rows.length,accepted:result.assignments.length,rejected:result.rejected.length,uniqueValues},
    canExport:result.assignments.length>0&&!quotaExceeded,blockers:quotaExceeded?["GOOGLE_UNIQUE_LABEL_LIMIT"]:[],
    file:{content:file,byteLength:Buffer.byteLength(file,"utf8"),sha256}};
}
export async function previewCustomLabels(p:AiPrincipal,value:unknown,db:SqlDatabase=prisma){
  const scope=parseLabelScope(value);
  return aiTransaction(p,db,async tx=>{const {file,...preview}=await previewInTx(p,scope,tx);return {...preview,file:{byteLength:file.byteLength,sha256:file.sha256}};});
}
interface LabelReceipt {exportId:string;actionId:string;previewId:string;createdAt:string;actorId:string;profileId:string;ruleRevision:number;target:LabelProfile["target"];warnings:string[];file:{name:string;byteLength:number;sha256:string;rowCount:number;url:string};provenance:Awaited<ReturnType<typeof previewInTx>>["provenance"]}
interface LabelExportRecord {actorId:string;context:{kind:string;requestHash:string};after:{receipt:LabelReceipt;content:string;assignments:ReturnType<typeof assignCustomLabels>["assignments"];rejected:ReturnType<typeof assignCustomLabels>["rejected"]}}
async function exportInTx(p:AiPrincipal,id:string,tx:SqlClient){
  const [row]=await tx.$queryRaw<LabelExportRecord[]>(Prisma.sql`SELECT "actorId",context,after FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "idempotencyKey"=${`label-export:${id}`} AND "entityType"='CUSTOM_LABEL_EXPORT' AND context->>'kind'='CUSTOM_LABEL_EXPORT_V1'`);
  return row;
}
export async function createCustomLabelExport(p:AiPrincipal,value:unknown,db:SqlDatabase=prisma,now=new Date()):Promise<LabelReceipt>{
  if(!isRecord(value)||Object.keys(value).sort().join()!=="exportId,previewId,scope"||typeof value.previewId!=="string"||!/^[a-f0-9]{64}$/.test(value.previewId))throw new CustomLabelError("INVALID_LABEL_EXPORT");
  const id=uuid(value.exportId),scope=parseLabelScope(value.scope),previewId=value.previewId,requestHash=payloadHash({scope,previewId});
  return aiTransaction(p,db,async tx=>{
    const existing=await exportInTx(p,id,tx);
    if(existing){if(existing.actorId!==p.userId||existing.context.requestHash!==requestHash)throw new CustomLabelError("LABEL_EXPORT_ID_CONFLICT",409);return existing.after.receipt;}
    const preview=await previewInTx(p,scope,tx);
    if(preview.previewId!==previewId)throw new CustomLabelError("LABEL_PREVIEW_CHANGED",409);
    if(!preview.canExport)throw new CustomLabelError("LABEL_EXPORT_NOT_READY",422,preview.blockers);
    const start=new Date(now);start.setUTCHours(0,0,0,0);const end=new Date(start.getTime()+86400000);
    const [count]=await tx.$queryRaw<Array<{n:number}>>(Prisma.sql`SELECT count(*)::int n FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "entityType"='CUSTOM_LABEL_EXPORT' AND "createdAt">=${start} AND "createdAt"<${end}`);
    if(count.n>=LABEL_EXPORTS_PER_DAY)throw new CustomLabelError("LABEL_EXPORT_QUOTA",429);
    const actionId=randomUUID(),name=`${preview.target.provider}-custom-labels-${id}.csv`;
    const receipt:LabelReceipt={exportId:id,actionId,previewId,createdAt:now.toISOString(),actorId:p.userId,profileId:scope.profileId,ruleRevision:preview.provenance.ruleRevision,target:preview.target,warnings:preview.warnings,
      file:{name,byteLength:preview.file.byteLength,sha256:preview.file.sha256,rowCount:preview.assignments.length,url:`/api/merchandising/custom-labels/exports/${id}`},provenance:preview.provenance};
    await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context,"createdAt")
      VALUES (${actionId},${p.tenantId},${p.userId},${preview.provenance.configId},'CUSTOM_LABEL_EXPORT','CUSTOM_LABEL_EXPORT',${id},${`label-export:${id}`},
      ${JSON.stringify({receipt,content:preview.file.content,assignments:preview.assignments,rejected:preview.rejected})}::jsonb,
      ${JSON.stringify({kind:"CUSTOM_LABEL_EXPORT_V1",requestHash,contractVersion:LABEL_CONTRACT_VERSION,receipt})}::jsonb,${now})`);
    return receipt;
  });
}
export async function readCustomLabelFile(p:AiPrincipal,exportId:string,db:SqlDatabase=prisma){
  const id=uuid(exportId);return aiTransaction(p,db,async tx=>{
    const row=await exportInTx(p,id,tx);if(!row)throw new CustomLabelError("LABEL_EXPORT_NOT_FOUND",404);
    return {content:row.after.content,...row.after.receipt.file};
  });
}
export async function readCustomLabelHistory(p:AiPrincipal,db:SqlDatabase=prisma){
  return aiTransaction(p,db,async tx=>({rows:(await tx.$queryRaw<Array<{receipt:LabelReceipt}>>(Prisma.sql`SELECT context->'receipt' receipt FROM "MerchandisingAction"
    WHERE "tenantId"=${p.tenantId} AND "entityType"='CUSTOM_LABEL_EXPORT' AND context->>'kind'='CUSTOM_LABEL_EXPORT_V1' ORDER BY "createdAt" DESC,id DESC LIMIT 50`)).map(r=>r.receipt)}));
}
