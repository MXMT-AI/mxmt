import "server-only";
import {Prisma} from "@prisma/client";
import {prisma} from "./prisma";
import {isRecord} from "./api-contracts";
import type {SqlClient,SqlDatabase} from "./connectors/database";
import {payloadHash} from "./connectors/order-storage";
import {aiTransaction} from "./ai-execution/budget";
import type {AiFilters} from "./ai-execution/context";
import type {AiPrincipal} from "./ai-execution/contracts";
import {evidenceQuery} from "./ai-execution/context";
import {resolveCustomLabelEvidence} from "./custom-label-evidence";
import {screenStockJoin,stockStatsSql,stockGroupValues,type StockGroup} from "./merchandising-screen-stock";
import {screenSalesFilter,totalsSql,salesAggregateMetric,type AggregateRow} from "./merchandising-screen-sales";
import {readScreenSnapshot} from "./merchandising-snapshot";
import {attributeDictionaryInTx,readAttributeEvidenceBatch} from "./product-attribute-store";
import {ProductAttributeError,normalizeProductAttribute} from "./product-attributes";
import {physicalAttributeRecommendation} from "./attribute-analysis";

export interface AttributeReportRequest {mode:"attributes_v2";dictionaryId:string;snapshotId:string;preview:boolean;filters?:AiFilters}
const id=(v:unknown)=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v);
export function parseAttributeReport(value:unknown):AttributeReportRequest {
  if(!isRecord(value)||Object.keys(value).some(k=>!["mode","dictionaryId","snapshotId","preview","filters"].includes(k))||value.mode!=="attributes_v2"||!id(value.dictionaryId)||!id(value.snapshotId)||typeof value.preview!=="boolean")throw new ProductAttributeError("INVALID_ATTRIBUTE_REPORT");
  if(value.filters!==undefined&&(!isRecord(value.filters)||Object.keys(value.filters).some(k=>!["brandId","categoryId","skuId","currency","channelId"].includes(k))||Object.values(value.filters).some(v=>typeof v!=="string")))throw new ProductAttributeError("INVALID_ATTRIBUTE_REPORT");
  return structuredClone(value) as unknown as AttributeReportRequest;
}
async function groupMetrics(p:AiPrincipal,snapshotId:string,filters:AiFilters,members:Array<{skuId:string;bucketKey:string}>,tx:SqlClient){
  if(!members.length)return {stocks:[],sales:[]};
  const snapshot=await readScreenSnapshot(p.tenantId,snapshotId,tx),query=evidenceQuery(snapshotId,filters),payload=JSON.stringify(members);
  const stocks=await tx.$queryRaw<StockGroup[]>(Prisma.sql`SELECT m."bucketKey" id,m."bucketKey" name,d.currency,${stockStatsSql()} stats,NULL::jsonb details
    FROM ${screenStockJoin} JOIN jsonb_to_recordset(${payload}::jsonb) m("skuId" text,"bucketKey" text) ON m."skuId"=s."skuId"
    WHERE s."tenantId"=${p.tenantId} AND s."snapshotId"=${snapshotId} GROUP BY m."bucketKey",d.currency`);
  const sales=await tx.$queryRaw<Array<AggregateRow&{grossUnits:string;returnUnits:string;lyGrossUnits:string;lyReturnUnits:string}>>(Prisma.sql`SELECT m."bucketKey" id,m."bucketKey" name,f.currency,${totalsSql(Prisma.sql`f."inCurrent"`)} current,${totalsSql(Prisma.sql`f."inPriorYear"`)} ly,
    COALESCE(sum(f.quantity) FILTER(WHERE f."inCurrent" AND f.kind='SALE'),0)::text "grossUnits",COALESCE(sum(abs(f.quantity)) FILTER(WHERE f."inCurrent" AND f.kind='RETURN'),0)::text "returnUnits",
    COALESCE(sum(f.quantity) FILTER(WHERE f."inPriorYear" AND f.kind='SALE'),0)::text "lyGrossUnits",COALESCE(sum(abs(f.quantity)) FILTER(WHERE f."inPriorYear" AND f.kind='RETURN'),0)::text "lyReturnUnits"
    FROM "MerchandisingScreenFact" f JOIN jsonb_to_recordset(${payload}::jsonb) m("skuId" text,"bucketKey" text) ON m."skuId"=f."skuId"
    WHERE ${screenSalesFilter(p.tenantId,query)} AND f.kind<>'PREORDER' AND f."productKind"='MERCHANDISE' GROUP BY m."bucketKey",f.currency`);
  const sort=(a:{id:string|null;currency:string|null},b:{id:string|null;currency:string|null})=>JSON.stringify([a.id,a.currency])<JSON.stringify([b.id,b.currency])?-1:JSON.stringify([a.id,a.currency])>JSON.stringify([b.id,b.currency])?1:0;
  return {stocks:stocks.sort(sort).map(row=>({bucketKey:row.id!,...stockGroupValues(row,snapshot.sales.context.settings.turnoverMonths)})),sales:sales.sort(sort).map(row=>({bucketKey:row.id!,...salesAggregateMetric(row,snapshot),grossUnits:snapshot.sales.context.history.current?row.grossUnits:null,returnUnits:snapshot.sales.context.history.current?row.returnUnits:null,lyGrossUnits:snapshot.sales.context.history.ly?row.lyGrossUnits:null,lyReturnUnits:snapshot.sales.context.history.ly?row.lyReturnUnits:null}))};
}
export async function analyzeProductAttributes(p:AiPrincipal,value:unknown,db:SqlDatabase=prisma){
  const request=parseAttributeReport(value);
  return aiTransaction(p,db,async tx=>{
    const dictionary=await attributeDictionaryInTx(p,request.dictionaryId,tx);
    if(!request.preview&&!dictionary.approvedAt)throw new ProductAttributeError("ATTRIBUTE_DICTIONARY_NOT_APPROVED",409);
    const base=await resolveCustomLabelEvidence(p,{profileId:request.dictionaryId,snapshotId:request.snapshotId,filters:request.filters},dictionary.values.sourceId,tx);
    if(base.rows.length>500)throw new ProductAttributeError("ATTRIBUTE_SKU_LIMIT",422);
    const eligible=base.rows.filter(r=>r.productKind==="MERCHANDISE"),records=await readAttributeEvidenceBatch(p,dictionary.values.sourceId,eligible.map(r=>r.skuId),base.envelope.stockObservation.cutoff,tx);
    const memberships=eligible.flatMap(r=>dictionary.values.dimensions.map(d=>({skuId:r.skuId,dimensionId:d.id,evidence:records.get(r.skuId)?{recordId:records.get(r.skuId)!.recordId,observedAt:records.get(r.skuId)!.observedAt,payloadHash:records.get(r.skuId)!.payloadHash,state:records.get(r.skuId)!.state}:null,...normalizeProductAttribute(d,records.get(r.skuId)?.data)})));
    const members=memberships.map(m=>({skuId:m.skuId,bucketKey:JSON.stringify([m.dimensionId,m.bucket])}));
    const canonical=Object.fromEntries(Object.entries(base.envelope.filters).filter((entry):entry is [string,string]=>entry[1]!==null));
    const metrics=await groupMetrics(p,request.snapshotId,canonical,members,tx);
    const groups=dictionary.values.dimensions.flatMap(d=>[...new Set(memberships.filter(m=>m.dimensionId===d.id).map(m=>m.bucket))].sort().map(bucket=>{
      const list=memberships.filter(m=>m.dimensionId===d.id&&m.bucket===bucket),bucketKey=JSON.stringify([d.id,bucket]);
      const status=bucket.startsWith("__")?"REVIEW_MAPPING":list.length<dictionary.values.rubric.minGroupSize?"SPARSE":"COVERED";
      return {dimensionId:d.id,valueId:bucket,label:d.values.find(v=>v.id===bucket)?.label??bucket,skuCount:list.length,status,recommendation:physicalAttributeRecommendation(status),stock:metrics.stocks.filter(r=>r.bucketKey===bucketKey),sales:metrics.sales.filter(r=>r.bucketKey===bucketKey),coverage:{known:list.filter(r=>r.state==="KNOWN").length,multiple:list.filter(r=>r.state==="MULTI_VALUE").length,conflicting:list.filter(r=>r.state==="CONFLICT").length,unknown:list.filter(r=>!["KNOWN","MULTI_VALUE","CONFLICT"].includes(r.state)).length}};
    }));
    const provenance={dictionaryId:request.dictionaryId,configId:dictionary.id,revision:dictionary.revision,dictionaryHash:payloadHash(dictionary.values),approvedAt:dictionary.approvedAt?new Date(dictionary.approvedAt).toISOString():null,approvedBy:dictionary.approvedById,attribution:dictionary.values.attribution,rubric:dictionary.values.rubric,source:base.envelope,sourceFingerprint:base.fingerprint};
    const report={version:1,analysisId:payloadHash({provenance,memberships,metrics}),mode:"attributes_v2",state:dictionary.approvedAt?"approved":"draft_preview",statusMeaning:"ATTRIBUTE_MAPPING_COVERAGE_ONLY",preview:request.preview,provenance,groups,memberships,
      coverage:{sourceSkus:base.rows.length,eligibleSkus:eligible.length,excludedNonMerchandise:base.rows.length-eligible.length,sourceEvidenceRecorded:records.size,sourceEvidenceAvailable:[...records.values()].filter(r=>r.state==="AVAILABLE"&&r.data!==null).length},warnings:["NOT_LEGACY_CATEGORY_STR","NO_ATTRIBUTE_INFERENCE","TOTALS_RECONCILE_WITHIN_EACH_DIMENSION","SALES_WITHOUT_ELIGIBLE_CANONICAL_SKU_EXCLUDED"],by_category:[]};
    if(Buffer.byteLength(JSON.stringify(report),"utf8")>4*1024*1024)throw new ProductAttributeError("ATTRIBUTE_REPORT_LIMIT",422);return report;
  });
}
