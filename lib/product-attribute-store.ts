import "server-only";
import {randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {prisma} from "./prisma";
import {isRecord} from "./api-contracts";
import type {SqlClient,SqlDatabase} from "./connectors/database";
import {payloadHash} from "./connectors/order-storage";
import {aiTransaction} from "./ai-execution/budget";
import type {AiPrincipal} from "./ai-execution/contracts";
import {ProductAttributeError,parseAttributeDictionary,normalizeProductAttribute,type AttributeDictionary} from "./product-attributes";

export interface DictionaryRecord {id:string;revision:number;values:AttributeDictionary;approvedAt:Date|string|null;approvedById:string|null;approvalReference:string|null}
export interface AttributeEvidenceRecord {recordId:string;productId:string;observedAt:string;payloadHash:string;state:string;data:Record<string,unknown>|null}
const identifier=(v:unknown):string=>{if(typeof v!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v))throw new ProductAttributeError("INVALID_ATTRIBUTE_ID");return v;};
export async function attributeDictionaryInTx(p:AiPrincipal,dictionaryId:string,tx:SqlClient){
  identifier(dictionaryId);
  const [row]=await tx.$queryRaw<DictionaryRecord[]>(Prisma.sql`SELECT id,revision,values,"approvedAt","approvedById","approvalReference" FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND "configType"='GENERAL' AND key=${`attributes:${dictionaryId}`} ORDER BY revision DESC LIMIT 1`);
  if(!row)throw new ProductAttributeError("ATTRIBUTE_DICTIONARY_NOT_FOUND",404);row.values=parseAttributeDictionary(row.values);return row;
}
export async function saveAttributeDictionary(p:AiPrincipal,dictionaryId:string,value:unknown,db:SqlDatabase=prisma){
  identifier(dictionaryId);
  if(!isRecord(value)||Object.keys(value).sort().join()!=="dictionary,expectedRevision"||!Number.isSafeInteger(value.expectedRevision)||Number(value.expectedRevision)<0||Number(value.expectedRevision)>10000)throw new ProductAttributeError("INVALID_ATTRIBUTE_REVISION");
  const dictionary=parseAttributeDictionary(value.dictionary),expected=Number(value.expectedRevision);
  return aiTransaction(p,db,async tx=>{
    const [source]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "DataSource" WHERE "tenantId"=${p.tenantId} AND id=${dictionary.sourceId}`);if(!source)throw new ProductAttributeError("ATTRIBUTE_SOURCE_NOT_FOUND",404);
    const [previous]=await tx.$queryRaw<Array<{revision:number}>>(Prisma.sql`SELECT revision FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND "configType"='GENERAL' AND key=${`attributes:${dictionaryId}`} ORDER BY revision DESC LIMIT 1`);
    if((previous?.revision??0)!==expected)throw new ProductAttributeError("ATTRIBUTE_REVISION_CONFLICT",409);
    const id=randomUUID(),revision=expected+1;
    await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive") VALUES (${id},${p.tenantId},'GENERAL',${`attributes:${dictionaryId}`},${revision},${JSON.stringify(dictionary)}::jsonb,false)`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context) VALUES (${randomUUID()},${p.tenantId},${p.userId},${id},'ATTRIBUTE_DICTIONARY_DRAFT','ATTRIBUTE_DICTIONARY',${dictionaryId},${`attribute-draft:${id}`},${JSON.stringify({revision,dictionaryHash:payloadHash(dictionary)})}::jsonb,'{}')`);
    return {dictionaryId,configId:id,revision,state:"draft",dictionary};
  },true);
}
export async function readAttributeDictionary(p:AiPrincipal,dictionaryId:string,db:SqlDatabase=prisma){return aiTransaction(p,db,async tx=>({dictionaryId,...await attributeDictionaryInTx(p,dictionaryId,tx)}));}

export async function readSkuAttributeEvidence(p:AiPrincipal,sourceId:string,skuId:string,cutoff:string,tx:SqlClient):Promise<AttributeEvidenceRecord|null>{
  return (await readAttributeEvidenceBatch(p,sourceId,[skuId],cutoff,tx)).get(skuId)??null;
}
export async function readAttributeEvidenceBatch(p:AiPrincipal,sourceId:string,skuIds:string[],cutoff:string,tx:SqlClient){
  if(skuIds.length>500)throw new ProductAttributeError("ATTRIBUTE_SKU_LIMIT",422);
  type Header={id:string;observedAt:string;payloadHash:string;state:string;bytes:number;kind:string;conflicted:boolean};
  const headers=await tx.$queryRaw<Array<{skuId:string;productId:string|null;records:Header[]|null}>>(Prisma.sql`
    SELECT req."skuId",a."productId",e.records FROM jsonb_array_elements_text(${JSON.stringify(skuIds)}::jsonb) req("skuId")
    LEFT JOIN LATERAL (SELECT min(value) "productId",count(*) n FROM (SELECT value FROM "SkuAlias" WHERE "tenantId"=${p.tenantId} AND "sourceId"=${sourceId} AND "skuId"=req."skuId" AND type='SOURCE_PRODUCT_ID' ORDER BY value LIMIT 2) aliases) a ON true
    LEFT JOIN LATERAL (SELECT jsonb_agg(to_jsonb(hit)||jsonb_build_object('conflicted',EXISTS(
      SELECT 1 FROM "DataSourceRecord" conflict JOIN "DataImportRun" crun ON crun.id=conflict."importRunId" AND crun."sourceId"=conflict."sourceId" AND crun."tenantId"=conflict."tenantId"
      WHERE conflict."tenantId"=${p.tenantId} AND conflict."sourceId"=${sourceId} AND conflict.resource='product-attributes' AND conflict.payload->>'productId'=a."productId" AND conflict."observedAt"=hit."observedAt" AND conflict."payloadHash"<>hit."payloadHash" AND crun.status IN ('SUCCESS','WARNING') LIMIT 1))) records FROM (
      SELECT r.id,r."observedAt",r."createdAt",r."payloadHash",r.payload->>'kind' kind,r.payload->>'state' state,octet_length(r.payload::text) bytes FROM "DataSourceRecord" r JOIN "DataImportRun" run ON run.id=r."importRunId" AND run."sourceId"=r."sourceId" AND run."tenantId"=r."tenantId"
      WHERE a.n=1 AND r."tenantId"=${p.tenantId} AND r."sourceId"=${sourceId} AND r.resource='product-attributes' AND r.payload->>'productId'=a."productId" AND r."observedAt"<=${new Date(cutoff)} AND run.status IN ('SUCCESS','WARNING')
      ORDER BY r."observedAt" DESC,r."createdAt" DESC,r.id DESC LIMIT 1) hit) e ON true`);
  const chosen=headers.flatMap(h=>{
    const [first]=h.records??[];if(!first||first.conflicted)return [];
    return [{skuId:h.skuId,productId:h.productId!,header:first}];
  });
  if(chosen.reduce((sum,r)=>sum+r.header.bytes,0)>4*1024*1024)throw new ProductAttributeError("ATTRIBUTE_EVIDENCE_LIMIT",422);
  const ids=[...new Set(chosen.map(r=>r.header.id))];
  const bodies=ids.length?await tx.$queryRaw<Array<{id:string;data:Record<string,unknown>|null}>>(Prisma.sql`SELECT id,payload->'data' data FROM "DataSourceRecord" WHERE "tenantId"=${p.tenantId} AND "sourceId"=${sourceId} AND id IN (${Prisma.join(ids)})`):[];
  const byId=new Map(bodies.map(b=>[b.id,b.data]));
  return new Map(chosen.map(r=>[r.skuId,{recordId:r.header.id,productId:r.productId,observedAt:new Date(r.header.observedAt).toISOString(),payloadHash:r.header.payloadHash,state:r.header.kind==="PRODUCT_ATTRIBUTE_EVIDENCE_V1"?r.header.state:"UNSUPPORTED_VERSION",data:r.header.kind==="PRODUCT_ATTRIBUTE_EVIDENCE_V1"&&r.header.state==="AVAILABLE"?byId.get(r.header.id)??null:null} satisfies AttributeEvidenceRecord]));
}
export async function sampleProductAttributes(p:AiPrincipal,value:unknown,db:SqlDatabase=prisma){
  if(!isRecord(value)||Object.keys(value).sort().join()!=="dictionaryId,skuIds"||!Array.isArray(value.skuIds)||!value.skuIds.length||value.skuIds.length>5)throw new ProductAttributeError("INVALID_ATTRIBUTE_SAMPLES");
  const dictionaryId=identifier(value.dictionaryId),skuIds=[...new Set(value.skuIds.map(identifier))];
  return aiTransaction(p,db,async tx=>{
    const dictionary=await attributeDictionaryInTx(p,dictionaryId,tx),samples=[],records=await readAttributeEvidenceBatch(p,dictionary.values.sourceId,skuIds,new Date().toISOString(),tx);
    for(const skuId of skuIds){const record=records.get(skuId);samples.push({skuId,evidence:record?{recordId:record.recordId,productId:record.productId,observedAt:record.observedAt,payloadHash:record.payloadHash,state:record.state}:null,dimensions:dictionary.values.dimensions.map(d=>({dimensionId:d.id,...normalizeProductAttribute(d,record?.data)}))});}
    return {dictionaryId,revision:dictionary.revision,samples};
  },true);
}
export async function approveAttributeDictionary(p:AiPrincipal,dictionaryId:string,value:unknown,db:SqlDatabase=prisma,now=new Date()){
  if(!isRecord(value)||Object.keys(value).sort().join()!=="approvalReference,configId,rubricApprovalReference,samples"||typeof value.approvalReference!=="string"||!value.approvalReference.trim()||value.approvalReference.length>1000||typeof value.rubricApprovalReference!=="string"||!value.rubricApprovalReference.trim()||value.rubricApprovalReference.length>1000||!Array.isArray(value.samples)||!value.samples.length||value.samples.length>25)throw new ProductAttributeError("ATTRIBUTE_SAMPLE_APPROVAL_REQUIRED",409);
  const configId=identifier(value.configId),checks=value.samples;
  return aiTransaction(p,db,async tx=>{
    const dictionary=await attributeDictionaryInTx(p,dictionaryId,tx);if(dictionary.id!==configId)throw new ProductAttributeError("ATTRIBUTE_REVISION_CONFLICT",409);
    if(dictionary.approvedAt)return {configId,revision:dictionary.revision,state:"approved"};
    if(checks.some(check=>!isRecord(check)))throw new ProductAttributeError("INVALID_ATTRIBUTE_SAMPLE");
    const records=await readAttributeEvidenceBatch(p,dictionary.values.sourceId,[...new Set(checks.map(c=>identifier(c.skuId)))],now.toISOString(),tx);
    const covered=new Set<string>(),seen=new Set<string>();
    for(const check of checks){
      if(!isRecord(check)||Object.keys(check).sort().join()!=="dimensionId,recordId,skuId,valueIds"||!Array.isArray(check.valueIds)||!check.valueIds.length||check.valueIds.length>50||check.valueIds.some(v=>!idText(v)))throw new ProductAttributeError("INVALID_ATTRIBUTE_SAMPLE");
      const skuId=identifier(check.skuId),dimension=dictionary.values.dimensions.find(d=>d.id===check.dimensionId),record=records.get(skuId);
      const unique=`${skuId}:${String(check.dimensionId)}`;if(seen.has(unique))throw new ProductAttributeError("INVALID_ATTRIBUTE_SAMPLE");seen.add(unique);
      if(!dimension||record?.recordId!==check.recordId||record?.state!=="AVAILABLE")throw new ProductAttributeError("ATTRIBUTE_SAMPLE_NOT_VERIFIED",409);
      const normalized=normalizeProductAttribute(dimension,record.data);
      if(!["KNOWN","MULTI_VALUE"].includes(normalized.state)||payloadHash(normalized.valueIds)!==payloadHash([...new Set(check.valueIds)].sort()))throw new ProductAttributeError("ATTRIBUTE_SAMPLE_NOT_VERIFIED",409);
      covered.add(dimension.id);
    }
    if(covered.size!==dictionary.values.dimensions.length)throw new ProductAttributeError("ATTRIBUTE_SAMPLE_APPROVAL_REQUIRED",409);
    const reference=JSON.stringify({mapping:value.approvalReference,rubric:value.rubricApprovalReference});
    await tx.$executeRaw(Prisma.sql`UPDATE "MerchandisingConfig" SET "approvedAt"=${now},"approvedById"=${p.userId},"approvalReference"=${reference} WHERE "tenantId"=${p.tenantId} AND id=${configId}`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context) VALUES (${randomUUID()},${p.tenantId},${p.userId},${configId},'ATTRIBUTE_DICTIONARY_APPROVED','ATTRIBUTE_DICTIONARY',${dictionaryId},${`attribute-approval:${configId}`},${JSON.stringify({samples:checks,reference,attribution:dictionary.values.attribution,rubric:dictionary.values.rubric})}::jsonb,'{}')`);
    return {configId,revision:dictionary.revision,state:"approved"};
  },true);
}
const idText=(v:unknown)=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v);
