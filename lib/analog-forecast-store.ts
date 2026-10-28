import "server-only";
import {randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {Temporal} from "@js-temporal/polyfill";
import {prisma} from "./prisma";
import {isRecord} from "./api-contracts";
import type {SqlClient,SqlDatabase} from "./connectors/database";
import {payloadHash} from "./connectors/order-storage";
import {financialDecimal as D} from "./financial-decimal.mjs";
import {aiTransaction} from "./ai-execution/budget";
import type {AiPrincipal} from "./ai-execution/contracts";
import {resolveCustomLabelEvidence} from "./custom-label-evidence";
import {resolveAiSnapshot} from "./ai-execution/context";
import {attributeDictionaryInTx,readAttributeEvidenceBatch} from "./product-attribute-store";
import {normalizeProductAttribute} from "./product-attributes";
import {ANALOG_EVALUATION_CASE_LIMIT,AnalogForecastError,forecastId,parseAnalogPolicy,forecastPeriod,estimateAnalogs,scoreAnalogCases,type AnalogPolicy,type AnalogRow,type ForecastScoreCase} from "./analog-forecast";
interface PolicyRecord {id:string;revision:number;values:AnalogPolicy}
/** Resolve the latest tenant draft so a previous revision cannot silently replace current policy. */
async function policyInTx(p:AiPrincipal,profileId:string,tx:SqlClient){
 forecastId(profileId);
 const [row]=await tx.$queryRaw<PolicyRecord[]>(Prisma.sql`SELECT id,revision,values FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND "configType"='GENERAL' AND key=${`analog-policy:${profileId}`} ORDER BY revision DESC LIMIT 1`);
 if(!row)throw new AnalogForecastError("ANALOG_POLICY_NOT_CONFIGURED",404);row.values=parseAnalogPolicy(row.values);return row;
}
/** Owner drafts stay inactive. This delivery deliberately exposes no business-rule activation operation. */
export async function saveAnalogPolicy(p:AiPrincipal,profileId:string,value:unknown,db:SqlDatabase=prisma){
 forecastId(profileId);
 if(!isRecord(value)||Object.keys(value).sort().join()!=="expectedRevision,policy"||!Number.isInteger(value.expectedRevision)||Number(value.expectedRevision)<0||Number(value.expectedRevision)>10000)throw new AnalogForecastError("INVALID_ANALOG_REVISION");
 const policy=parseAnalogPolicy(value.policy);
 return aiTransaction(p,db,async tx=>{
  const dictionary=await attributeDictionaryInTx(p,policy.dictionaryId,tx);
  if(dictionary.id!==policy.dictionaryConfigId||dictionary.values.sourceId!==policy.sourceId||policy.dimensionIds.some(id=>!dictionary.values.dimensions.some(d=>d.id===id)))throw new AnalogForecastError("ANALOG_DICTIONARY_MISMATCH",409);
  const [old]=await tx.$queryRaw<Array<{revision:number}>>(Prisma.sql`SELECT revision FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND "configType"='GENERAL' AND key=${`analog-policy:${profileId}`} ORDER BY revision DESC LIMIT 1`);
  if((old?.revision??0)!==value.expectedRevision)throw new AnalogForecastError("ANALOG_REVISION_CONFLICT",409);
  const id=randomUUID(),revision=Number(value.expectedRevision)+1;
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive") VALUES (${id},${p.tenantId},'GENERAL',${`analog-policy:${profileId}`},${revision},${JSON.stringify(policy)}::jsonb,false)`);
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",context) VALUES (${randomUUID()},${p.tenantId},${p.userId},${id},'ANALOG_POLICY_DRAFT','ANALOG_POLICY',${profileId},${`analog-policy:${id}`},${JSON.stringify({revision,policyHash:payloadHash(policy),businessRulesApproved:false})}::jsonb)`);
  return {profileId,configId:id,revision,state:"draft",businessRulesApproved:false};
 },true);
}
export async function readAnalogPolicy(p:AiPrincipal,profileId:string,db:SqlDatabase=prisma){return aiTransaction(p,db,async tx=>({profileId,...await policyInTx(p,profileId,tx),state:"draft",businessRulesApproved:false}));}
export interface AnalogPreviewRequest {profileId:string;snapshotId:string;targetId:string;preview:true}
/** Accept server-evidence selectors only and reject activation or caller-authored forecast inputs. */
export function parseAnalogPreview(v:unknown):AnalogPreviewRequest {
 if(!isRecord(v)||Object.keys(v).sort().join()!=="preview,profileId,snapshotId,targetId"||v.preview!==true)throw new AnalogForecastError("ANALOG_PREVIEW_ONLY");
 for(const id of [v.profileId,v.snapshotId,v.targetId])forecastId(id);return structuredClone(v) as unknown as AnalogPreviewRequest;
}
interface FrozenForecast {
 version:1;state:"draft_preview";businessRulesApproved:false;forecastId:string;profileId:string;configId:string;revision:number;createdAt:string;
 policy:AnalogPolicy;origin:{snapshotId:string;asOf:string;from:string;to:string;sourceId:string;targetId:string;categoryId:string|null;currency:string|null;price:string|null;timezone:string};
 provenance:unknown;inputHash:string;result:ReturnType<typeof estimateAnalogs>;
}
/** Freeze server-resolved evidence before the forecast horizon. Never reconstruct a historical origin using today's corrected data. */
export async function createAnalogPreview(p:AiPrincipal,value:unknown,db:SqlDatabase=prisma,now=new Date()){
 const q=parseAnalogPreview(value);
 return aiTransaction(p,db,async tx=>{
  const config=await policyInTx(p,q.profileId,tx),policy=config.values;
  const dictionary=await attributeDictionaryInTx(p,policy.dictionaryId,tx);
  if(dictionary.id!==policy.dictionaryConfigId||!dictionary.approvedAt||dictionary.values.sourceId!==policy.sourceId||policy.dimensionIds.some(id=>!dictionary.values.dimensions.some(d=>d.id===id)))throw new AnalogForecastError("ANALOG_DICTIONARY_NOT_APPROVED",409);
  const {snapshot,selected}=await resolveAiSnapshot(p,q.snapshotId,tx);
  const today=Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(selected.timezone).toPlainDate().toString();
  if(snapshot.stock.asOf!==today||new Date(snapshot.createdAt).getTime()>now.getTime()||Date.parse(snapshot.stock.cutoff)>now.getTime())throw new AnalogForecastError("ANALOG_ORIGIN_NOT_CURRENT",409);
  const [target]=await tx.$queryRaw<Array<{categoryId:string|null}>>(Prisma.sql`SELECT d.metrics->>'categoryId' "categoryId" FROM "MerchandisingScreenSku" s JOIN "SkuDaily" d ON d.id=s."dailyId" AND d."tenantId"=s."tenantId" AND d."skuId"=s."skuId" WHERE s."tenantId"=${p.tenantId} AND s."snapshotId"=${q.snapshotId} AND s."skuId"=${q.targetId}`);
  if(!target?.categoryId)throw new AnalogForecastError("ANALOG_TARGET_NOT_FOUND",404);
  const base=await resolveCustomLabelEvidence(p,{profileId:q.profileId,snapshotId:q.snapshotId,filters:{categoryId:target.categoryId}},policy.sourceId,tx);
  // Bound all category candidates before fetching attribute bodies. No pagination can silently omit a better analog.
  const records=await tx.$queryRaw<Array<{metrics:Record<string,unknown>;dailyId:string;seasonMonths:number[];price:string|null;priceEvidence:unknown;priceHistoryComplete:boolean}>>(Prisma.sql`
   SELECT d.metrics,d.id "dailyId",s.details->'policy'->'seasonMonths' "seasonMonths",i."retailPrice"::text price,
    jsonb_build_object('snapshotId',i.id,'sourceRecordKey',i."sourceRecordKey",'historyHash',h.hash) "priceEvidence",
    COALESCE(h.n=84 AND h.valid=84 AND h.lo=i."retailPrice" AND h.hi=i."retailPrice",false) "priceHistoryComplete"
   FROM "MerchandisingScreenSku" s JOIN "SkuDaily" d ON d.id=s."dailyId" AND d."tenantId"=s."tenantId" AND d."skuId"=s."skuId"
   LEFT JOIN "InventorySnapshot" i ON i.id=d.metrics->>'snapshotId' AND i."tenantId"=s."tenantId" AND i."skuId"=s."skuId" AND i."sourceId"=${policy.sourceId} AND i."sourceRecordKey"=d."inputProvenance"->>'snapshotRawKey' AND i.currency=d.currency AND i.quantity=d.quantity AND (d.quantity=0 OR i."retailPrice"*d.quantity=(d.metrics->>'stockRetailValue')::numeric) AND i."observedAt"<${new Date(snapshot.stock.cutoff)}
   LEFT JOIN LATERAL (SELECT count(*)::int n,count(*) FILTER(WHERE h."retailPrice">0 AND h.currency=d.currency)::int valid,min(h."retailPrice") lo,max(h."retailPrice") hi,md5(string_agg(jsonb_build_array(h.id,h."retailPrice",h.currency,h."sourceRecordKey")::text,'|' ORDER BY h."snapshotDate")) hash
    FROM "InventorySnapshot" h WHERE h."tenantId"=s."tenantId" AND h."sourceId"=${policy.sourceId} AND h."skuId"=s."skuId" AND h."snapshotDate">=(d.metrics->>'windowFrom')::date AND h."snapshotDate"<=(d.metrics->>'windowTo')::date AND h."observedAt"<${new Date(snapshot.stock.cutoff)}) h ON true
   WHERE s."tenantId"=${p.tenantId} AND s."snapshotId"=${q.snapshotId} AND d.metrics->>'categoryId'=${target.categoryId} ORDER BY s."skuId" LIMIT ${policy.candidateLimit+1}`);
  if(records.length>policy.candidateLimit)throw new AnalogForecastError("ANALOG_CANDIDATE_LIMIT",422);
  const ids=records.map(r=>String(r.metrics.skuId)),attributes=await readAttributeEvidenceBatch(p,policy.sourceId,ids,snapshot.stock.cutoff,tx);
  const rows:AnalogRow[]=records.map(r=>{
   const m=r.metrics,record=attributes.get(String(m.skuId)),history=m.snapshotHistory as {complete:boolean;observedDays:number;inStockDays:number};
   return {skuId:String(m.skuId),categoryId:m.categoryId as string|null,productKind:String(m.productKind),currency:m.currency as string|null,price:r.price,priceHistoryComplete:r.priceHistoryComplete,
    firstReceiptDate:m.firstReceiptDate as string|null,receiptHistoryComplete:m.receiptHistoryComplete===true,seasonMonths:r.seasonMonths??[],velocityPerWeek:m.velocityPerWeek as string|null,velocityState:String(m.velocityState),velocityBasis:String(m.velocityBasis),windowFrom:String(m.windowFrom),windowTo:String(m.windowTo),observedDays:history?.observedDays??0,inStockDays:history?.inStockDays??0,historyComplete:history?.complete===true,
    attributes:Object.fromEntries(policy.dimensionIds.map(id=>{const dimension=dictionary.values.dimensions.find(d=>d.id===id)!;const a=normalizeProductAttribute(dimension,record?.data);return [id,{state:a.state,valueIds:a.valueIds}];})),
    evidence:{dailyId:r.dailyId,price:r.priceEvidence,attribute:record?{recordId:record.recordId,observedAt:record.observedAt,payloadHash:record.payloadHash}:null}};
  });
  await resolveAiSnapshot(p,q.snapshotId,tx);
  const period=forecastPeriod(snapshot.stock.asOf,policy.horizonDays),packet={asOf:snapshot.stock.asOf,...period,targetId:q.targetId,rows},result=estimateAnalogs(packet,policy);
  const inputHash=payloadHash({configId:config.id,policy,dictionaryConfigId:dictionary.id,base:base.fingerprint,packet});
  const [cached]=await tx.$queryRaw<Array<{after:FrozenForecast}>>(Prisma.sql`SELECT after FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "idempotencyKey"=${`analog-forecast:${inputHash}`} AND "entityType"='ANALOG_FORECAST'`);
  if(cached)return {...cached.after,cached:true};
  const forecastIdValue=randomUUID(),frozen:FrozenForecast={version:1,state:"draft_preview",businessRulesApproved:false,forecastId:forecastIdValue,profileId:q.profileId,configId:config.id,revision:config.revision,createdAt:now.toISOString(),policy,origin:{snapshotId:q.snapshotId,asOf:packet.asOf,...period,sourceId:policy.sourceId,targetId:q.targetId,categoryId:target.categoryId,currency:rows.find(r=>r.skuId===q.targetId)?.currency??null,price:rows.find(r=>r.skuId===q.targetId)?.price??null,timezone:selected.timezone},provenance:{envelope:base.envelope,dictionaryConfigId:dictionary.id,dictionaryRevision:dictionary.revision},inputHash,result};
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context,"createdAt") VALUES (${forecastIdValue},${p.tenantId},${p.userId},${config.id},'ANALOG_FORECAST_PREVIEW','ANALOG_FORECAST',${q.targetId},${`analog-forecast:${inputHash}`},${JSON.stringify(frozen)}::jsonb,${JSON.stringify({kind:"ANALOG_FORECAST_V1",profileId:q.profileId,inputHash,packet})}::jsonb,${now})`);
  return {...frozen,cached:false};
 });
}

/** Score only forecasts frozen before their outcome window, using later saved sales rather than caller-authored actuals. */
export async function evaluateAnalogForecasts(p:AiPrincipal,value:unknown,db:SqlDatabase=prisma,now=new Date()){
 if(!isRecord(value)||Object.keys(value).sort().join()!=="cases,profileId"||!Array.isArray(value.cases)||!value.cases.length||value.cases.length>ANALOG_EVALUATION_CASE_LIMIT)throw new AnalogForecastError("INVALID_FORECAST_EVALUATION");
 const profileId=forecastId(value.profileId),cases=value.cases.map(c=>{
  if(!isRecord(c)||Object.keys(c).sort().join()!=="forecastId,outcomeSnapshotId")throw new AnalogForecastError("INVALID_FORECAST_EVALUATION");return {forecastId:forecastId(c.forecastId),outcomeSnapshotId:forecastId(c.outcomeSnapshotId)};
 });
 if(new Set(cases.map(c=>c.forecastId)).size!==cases.length)throw new AnalogForecastError("INVALID_FORECAST_EVALUATION");
 return aiTransaction(p,db,async tx=>{
  const config=await policyInTx(p,profileId,tx),scores:ForecastScoreCase[]=[],receipts:unknown[]=[],origins=new Set<string>();
  for(const c of cases){
   const [row]=await tx.$queryRaw<Array<{after:FrozenForecast;context:{kind:string};createdAt:Date|string}>>(Prisma.sql`SELECT after,context,"createdAt" FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND id=${c.forecastId} AND "entityType"='ANALOG_FORECAST'`);
   if(!row||row.context.kind!=="ANALOG_FORECAST_V1"||row.after.configId!==config.id||row.after.profileId!==profileId)throw new AnalogForecastError("FORECAST_CASE_NOT_FOUND_OR_POLICY_CHANGED",409);
   const f=row.after,origin=f.origin;
   const originKey=JSON.stringify([origin.sourceId,origin.targetId,origin.asOf]);if(origins.has(originKey))throw new AnalogForecastError("FORECAST_DUPLICATE_ORIGIN",409);origins.add(originKey);
   const from=Temporal.PlainDate.from(origin.from).toZonedDateTime(origin.timezone).toInstant(),end=Temporal.PlainDate.from(origin.to).add({days:1}).toZonedDateTime(origin.timezone).toInstant();
   if(new Date(row.createdAt).getTime()>=from.epochMilliseconds||Date.parse(f.createdAt)>=from.epochMilliseconds||now.getTime()<end.epochMilliseconds)throw new AnalogForecastError("FORECAST_TIME_SPLIT_REQUIRED",409);
   const base=await resolveCustomLabelEvidence(p,{profileId,snapshotId:c.outcomeSnapshotId,filters:{skuId:origin.targetId}},origin.sourceId,tx),{snapshot}=await resolveAiSnapshot(p,c.outcomeSnapshotId,tx);
   const [actual]=await tx.$queryRaw<Array<{units:string;currencies:number;wrongScope:number;unknownUnits:number}>>(Prisma.sql`SELECT COALESCE(sum(quantity),0)::text units,count(DISTINCT currency)::int currencies,count(*) FILTER(WHERE quantity IS NULL)::int "unknownUnits",count(*) FILTER(WHERE currency IS DISTINCT FROM ${origin.currency} OR "categoryId" IS DISTINCT FROM ${origin.categoryId})::int "wrongScope" FROM "MerchandisingScreenFact" WHERE "tenantId"=${p.tenantId} AND "snapshotId"=${c.outcomeSnapshotId} AND "skuId"=${origin.targetId} AND "inCurrent" AND kind<>'PREORDER' AND "productKind"='MERCHANDISE'`);
   const [daily]=await tx.$queryRaw<Array<{metrics:Record<string,unknown>}>>(Prisma.sql`SELECT d.metrics FROM "MerchandisingScreenSku" s JOIN "SkuDaily" d ON d.id=s."dailyId" AND d."tenantId"=s."tenantId" AND d."skuId"=s."skuId" WHERE s."tenantId"=${p.tenantId} AND s."snapshotId"=${c.outcomeSnapshotId} AND s."skuId"=${origin.targetId}`);
   const stock=await tx.$queryRaw<Array<{id:string;date:string;observedAt:string;quantity:string|null;sourceRecordKey:string|null;importRunId:string|null;price:string|null;currency:string|null;priceComparable:boolean;verified:boolean}>>(Prisma.sql`
    SELECT i.id,i."snapshotDate"::text date,i."observedAt"::text "observedAt",i.quantity::text quantity,i."sourceRecordKey",i."importRunId",i."retailPrice"::text price,i.currency,COALESCE(i."retailPrice"=${origin.price}::numeric AND i.currency=${origin.currency},false) "priceComparable",
     COALESCE(i.quantity>0 AND i.timezone=${origin.timezone} AND (i."observedAt" AT TIME ZONE ${origin.timezone})::date=i."snapshotDate" AND i."sourceRecordKey" IS NOT NULL AND r.status IN ('SUCCESS','WARNING'),false) verified
    FROM "InventorySnapshot" i LEFT JOIN "DataImportRun" r ON r.id=i."importRunId" AND r."tenantId"=i."tenantId" AND r."sourceId"=i."sourceId"
    WHERE i."tenantId"=${p.tenantId} AND i."sourceId"=${origin.sourceId} AND i."skuId"=${origin.targetId} AND i."snapshotDate">=${origin.from}::date AND i."snapshotDate"<=${origin.to}::date AND i."observedAt"<${new Date(snapshot.stock.cutoff)} ORDER BY i."snapshotDate" LIMIT 85`);
   let exclusion:string|null=null;
   if(f.result.status!=="estimated")exclusion="FORECAST_UNAVAILABLE";
   else if(snapshot.sales.context.period.from!==origin.from||snapshot.sales.context.period.to!==origin.to||snapshot.stock.asOf!==Temporal.PlainDate.from(origin.to).add({days:1}).toString()||Date.parse(snapshot.createdAt)>now.getTime()||Date.parse(snapshot.createdAt)<end.epochMilliseconds||Date.parse(snapshot.stock.cutoff)>now.getTime())exclusion="OUTCOME_PERIOD_MISMATCH";
   else if(!snapshot.sales.context.history.current||actual.unknownUnits||daily?.metrics.salesUnits12Weeks===null)exclusion="OUTCOME_SALES_INCOMPLETE";
   else if(!daily||daily.metrics.productKind!=="MERCHANDISE"||daily.metrics.categoryId!==origin.categoryId||daily.metrics.currency!==origin.currency||actual.wrongScope||actual.currencies>1)exclusion="OUTCOME_SCOPE_MISMATCH";
   else if(stock.length!==f.policy.horizonDays||stock.some(day=>!day.verified))exclusion="OUTCOME_STOCK_CENSORED_OR_MISSING";
   else if(stock.some(day=>!day.priceComparable))exclusion="OUTCOME_PRICE_NOT_COMPARABLE";
   else if(D(actual.units).lt(0))exclusion="OUTCOME_RETURN_DOMINATED";
   scores.push({forecastId:c.forecastId,horizonDays:f.policy.horizonDays,forecastUnits:f.result.forecastUnits,baselines:f.result.baselines,actualUnits:exclusion?null:actual.units,exclusion});
   await resolveAiSnapshot(p,c.outcomeSnapshotId,tx);
   receipts.push({forecastId:c.forecastId,inputHash:f.inputHash,origin:f.origin,outcome:base.envelope,outcomeSnapshotId:c.outcomeSnapshotId,stockObservations:stock.map(day=>({...day,observedAt:new Date(day.observedAt).toISOString()}))});
  }
  const result=scoreAnalogCases(scores,config.values),hash=payloadHash({configId:config.id,receipts,result});
  const evaluationId=randomUUID();
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context,"createdAt") VALUES (${evaluationId},${p.tenantId},${p.userId},${config.id},'ANALOG_BACKTEST_PREVIEW','ANALOG_EVALUATION',${profileId},${`analog-evaluation:${hash}`},${JSON.stringify(result)}::jsonb,${JSON.stringify({kind:"ANALOG_EVALUATION_V1",receipts,hash,businessRulesApproved:false})}::jsonb,${now}) ON CONFLICT ("tenantId","idempotencyKey") DO NOTHING`);
  const [saved]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "idempotencyKey"=${`analog-evaluation:${hash}`}`);
  return {evaluationId:saved.id,profileId,configId:config.id,state:"draft_evaluation",businessRulesApproved:false,...result};
 });
}
