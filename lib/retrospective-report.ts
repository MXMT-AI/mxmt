import "server-only";
import {savedMvpPublicationsMatch} from "./mvp-publication-evidence";
import {randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {Temporal} from "@js-temporal/polyfill";
import {prisma} from "./prisma";
import {isRecord} from "./api-contracts";
import type {SqlClient,SqlDatabase} from "./connectors/database";
import {withCalculationSnapshot} from "./calculation-snapshot";
import {assertAiPrincipal} from "./ai-execution/context";
import type {AiPrincipal} from "./ai-execution/contracts";
import {readSelectedSource} from "./connectors/source";
import {readScreenSnapshot,type ScreenSnapshot} from "./merchandising-snapshot";
import {payloadHash} from "./connectors/order-storage";
import {financialDecimal as D} from "./financial-decimal.mjs";
import {readRetrospectiveExecution,type ExecutionReceipt} from "./retrospective-execution-store";
import {retrospectiveId,retrospectiveWindows,observedGmroi,RETROSPECTIVE_POLICY_VERSION,RetrospectiveExecutionError as E} from "./retrospective-contract";
interface ReportCommand {executionId:string;beforeSnapshotId:string;afterSnapshotId:string;days:number}
/** Accept only saved evidence selectors and a bounded duration; dates and numerical results are server-derived. */
export function parseRetrospectiveReport(v:unknown):ReportCommand {
 if(!isRecord(v)||Object.keys(v).sort().join()!=="afterSnapshotId,beforeSnapshotId,days,executionId"||!Number.isInteger(v.days)||Number(v.days)<1||Number(v.days)>90)throw new E("INVALID_RETROSPECTIVE_REPORT");
 for(const id of [v.executionId,v.beforeSnapshotId,v.afterSnapshotId])retrospectiveId(id);return v as unknown as ReportCommand;
}
interface CohortRow {skuId:string;currency:string|null;ownership:string;productKind:string}
interface SalesAggregate {currency:string|null;units:string;revenue:string;profit:string;lines:number;missing:number;returnLines:number;factHash:string}
interface InventoryAggregate {date:string;currency:string|null;stockCost:string;completeCount:number;cohortCount:number;observations:unknown[]}
/** A fixed export subset is evaluated using saved sales facts and actual daily stock, all channels and separate currencies. */
async function periodEvidence(p:AiPrincipal,s:ScreenSnapshot,origin:ScreenSnapshot,e:ExecutionReceipt,period:{from:string;to:string},tx:SqlClient){
 if(!await savedMvpPublicationsMatch(p,s,e.sourceId,tx))throw new E("RETROSPECTIVE_PUBLICATION_MISMATCH",409);
 if(s.sourceId!==e.sourceId||s.sourceState.timezone!==e.timezone||s.sourceState.selectionRevision!==origin.sourceState.selectionRevision||s.sales.context.period.from!==period.from||s.sales.context.period.to!==period.to||payloadHash(s.settings)!==payloadHash(origin.settings)||s.sales.calculationVersion!==origin.sales.calculationVersion||s.stock.calculationVersion!==origin.stock.calculationVersion)throw new E("RETROSPECTIVE_SNAPSHOT_SCOPE_MISMATCH",409);
 const ids=e.command.skuIds;
 const readCohort=async(snapshotId:string)=>tx.$queryRaw<CohortRow[]>(Prisma.sql`SELECT s."skuId",d.currency,d.metrics->>'ownership' ownership,d.metrics->>'productKind' "productKind" FROM "MerchandisingScreenSku" s JOIN "SkuDaily" d ON d.id=s."dailyId" AND d."tenantId"=s."tenantId" AND d."skuId"=s."skuId" WHERE s."tenantId"=${p.tenantId} AND s."snapshotId"=${snapshotId} AND s."skuId" IN (${Prisma.join(ids)}) AND d."configId"=${snapshotId===origin.snapshotId?origin.stock.calculationId:s.stock.calculationId}`);
 const [cohort,original]=await Promise.all([readCohort(s.snapshotId),readCohort(origin.snapshotId)]);
 if(cohort.length!==ids.length||original.length!==ids.length)throw new E("RETROSPECTIVE_COHORT_INCOMPLETE",409);
 const exclusions=cohort.flatMap(row=>{const initial=original.find(r=>r.skuId===row.skuId)!,exported=e.exportRows.find(r=>r.skuId===row.skuId)!;return row.ownership!=="OWN"||initial.ownership!=="OWN"||row.productKind!=="MERCHANDISE"||initial.productKind!=="MERCHANDISE"||!row.currency||row.currency!==initial.currency||row.currency!==exported.currency?[{skuId:row.skuId,reason:"OWNERSHIP_PRODUCT_OR_CURRENCY_UNVERIFIED"}]:[];});
 const [factBound]=await tx.$queryRaw<Array<{n:number}>>(Prisma.sql`SELECT count(*)::int n FROM "MerchandisingScreenFact" WHERE "tenantId"=${p.tenantId} AND "snapshotId"=${s.snapshotId} AND "skuId" IN (${Prisma.join(ids)}) AND "inCurrent"`);
 if(factBound.n>100000)throw new E("RETROSPECTIVE_FACT_LIMIT",422);
 const sales=await tx.$queryRaw<SalesAggregate[]>(Prisma.sql`SELECT currency,COALESCE(sum(quantity),0)::text units,COALESCE(sum(revenue),0)::text revenue,COALESCE(sum("grossProfit"),0)::text profit,count(*)::int lines,count(*) FILTER(WHERE quantity IS NULL OR revenue IS NULL OR "grossProfit" IS NULL OR "sourceId"<>${e.sourceId} OR "productKind"<>'MERCHANDISE' OR currency IS DISTINCT FROM (SELECT x->>'currency' FROM jsonb_array_elements(${JSON.stringify(cohort)}::jsonb) x WHERE x->>'skuId'="MerchandisingScreenFact"."skuId"))::int missing,count(*) FILTER(WHERE kind='RETURN')::int "returnLines",md5(string_agg(jsonb_build_array("lineId",quantity,revenue,"grossProfit",kind)::text,'|' ORDER BY "lineId")) "factHash" FROM "MerchandisingScreenFact" WHERE "tenantId"=${p.tenantId} AND "snapshotId"=${s.snapshotId} AND "skuId" IN (${Prisma.join(ids)}) AND "inCurrent" AND kind<>'PREORDER' GROUP BY currency ORDER BY currency NULLS LAST`);
 const inventory=await tx.$queryRaw<InventoryAggregate[]>(Prisma.sql`
 WITH cohort AS (SELECT x->>'skuId' "skuId",x->>'currency' currency FROM jsonb_array_elements(${JSON.stringify(cohort)}::jsonb) x),
 observations AS (SELECT c.currency,c."skuId",day::date date,i.id,i.quantity,i."costPrice",i."sourceRecordKey",i."observedAt",i."importRunId",
  COALESCE(i.quantity>=0 AND (i.quantity=0 OR i."costPrice">0) AND i.currency=c.currency AND i.timezone=${e.timezone} AND (i."observedAt" AT TIME ZONE ${e.timezone})::date=day::date AND i."sourceRecordKey" IS NOT NULL AND r.status IN ('SUCCESS','WARNING'),false) valid
  FROM cohort c CROSS JOIN generate_series(${period.from}::date,${period.to}::date,'1 day') day LEFT JOIN "InventorySnapshot" i ON i."tenantId"=${p.tenantId} AND i."sourceId"=${e.sourceId} AND i."skuId"=c."skuId" AND i."snapshotDate"=day::date AND i."observedAt"<${new Date(s.stock.cutoff)}
  LEFT JOIN "DataImportRun" r ON r.id=i."importRunId" AND r."tenantId"=i."tenantId" AND r."sourceId"=i."sourceId")
 SELECT date::text date,currency,COALESCE(sum(CASE WHEN quantity=0 THEN 0 ELSE quantity*"costPrice" END) FILTER(WHERE valid),0)::text "stockCost",count(*) FILTER(WHERE valid)::int "completeCount",count(*)::int "cohortCount",jsonb_agg(jsonb_build_object('skuId',"skuId",'id',id,'quantity',quantity::text,'costPrice',"costPrice"::text,'observedAt',"observedAt",'importRunId',"importRunId",'sourceRecordKey',"sourceRecordKey",'valid',valid) ORDER BY "skuId") observations FROM observations GROUP BY date,currency ORDER BY date,currency NULLS LAST`);
 const currencies=[...new Set(cohort.map(r=>r.currency))];
 const results=currencies.map(currency=>{
  const aggregate=sales.find(r=>r.currency===currency),scopeComplete=!!currency&&!exclusions.some(x=>cohort.find(r=>r.skuId===x.skuId)?.currency===currency)&&!sales.some(r=>!currencies.includes(r.currency)),complete=scopeComplete&&s.sales.context.history.current&&!(aggregate?.missing);
  const samples=inventory.filter(r=>r.currency===currency).map(r=>({date:r.date,stockCost:r.completeCount===r.cohortCount?r.stockCost:null,complete:r.completeCount===r.cohortCount}));
  return {currency,state:complete?"OBSERVED":"UNAVAILABLE",units:complete?D(aggregate?.units??0).toString():null,revenue:complete?D(aggregate?.revenue??0).toString():null,grossProfit:complete?D(aggregate?.profit??0).toString():null,returnLines:aggregate?.returnLines??0,lineCount:aggregate?.lines??0,gmroi:observedGmroi(complete?aggregate?.profit??"0":null,complete,period.from,period.to,samples)};
 });
 return {period,results,exclusions,provenance:{snapshotId:s.snapshotId,sourceId:s.sourceId,settings:s.settings,sales:s.sales,stock:s.stock,channelScope:"ALL_CHANNELS",factHashes:sales.map(r=>({currency:r.currency,hash:r.factHash})),inventory}};
}
/** Freeze a reproducible read-only comparison; negative profit is retained and no causal uplift or external action is generated. */
export async function calculateScenarioRetrospective(p:AiPrincipal,value:unknown,db:SqlDatabase=prisma,now=new Date()){
 const q=parseRetrospectiveReport(value);
 return withCalculationSnapshot(db,async tx=>{
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Tenant" WHERE id=${p.tenantId} FOR SHARE`);await assertAiPrincipal(p,tx);
  const execution=await readRetrospectiveExecution(p,q.executionId,tx);
  if(execution.command.event!==(execution.command.kind==="reprice"?"APPLIED":"RECEIVED"))return {state:"UNAVAILABLE",reason:"ACTUAL_APPLICATION_OR_RECEIPT_REQUIRED",gmroi:null,causalUplift:null};
  const selected=await readSelectedSource(p.tenantId,tx);if(!selected||selected.id!==execution.sourceId||selected.revision!==execution.selectionRevision)throw new E("RETROSPECTIVE_SOURCE_CHANGED",409);
  const origin=await readScreenSnapshot(p.tenantId,execution.snapshotId,tx),windows=retrospectiveWindows(execution.command.occurredAt,execution.timezone,q.days);
  const end=Temporal.PlainDate.from(windows.after.to).add({days:1}).toZonedDateTime(execution.timezone).toInstant();if(now.getTime()<end.epochMilliseconds)throw new E("RETROSPECTIVE_WINDOW_NOT_COMPLETE",409);
  const before=await readScreenSnapshot(p.tenantId,q.beforeSnapshotId,tx),after=await readScreenSnapshot(p.tenantId,q.afterSnapshotId,tx);
  if([before,after].some(s=>Date.parse(s.createdAt)>now.getTime()||Date.parse(s.stock.cutoff)>now.getTime()||s.stock.asOf<=s.sales.context.period.to))throw new E("RETROSPECTIVE_SNAPSHOT_INCOMPLETE",409);
  const [prior,actual]=await Promise.all([periodEvidence(p,before,origin,execution,windows.before,tx),periodEvidence(p,after,origin,execution,windows.after,tx)]);
  const comparison=actual.results.map(a=>{const b=prior.results.find(b=>b.currency===a.currency);return {currency:a.currency,revenueChange:a.revenue!==null&&b?.revenue!==null&&b?.revenue!==undefined?D(a.revenue).minus(b.revenue).toString():null,grossProfitChange:a.grossProfit!==null&&b?.grossProfit!==null&&b?.grossProfit!==undefined?D(a.grossProfit).minus(b.grossProfit).toString():null};});
  const result={version:1,policyVersion:RETROSPECTIVE_POLICY_VERSION,state:prior.results.every(r=>r.gmroi.state==="AVAILABLE")&&actual.results.every(r=>r.gmroi.state==="AVAILABLE")?"AVAILABLE":"PARTIAL_OR_UNAVAILABLE",execution,windows,before:prior,after:actual,comparison,causalUplift:null,annualized:false,attribution:"DESCRIPTIVE_FIXED_SKU_COHORT",lotAttribution:false,externalActionExecuted:false};
  if(Buffer.byteLength(JSON.stringify(result),"utf8")>4*1024*1024)throw new E("RETROSPECTIVE_REPORT_LIMIT",422);
  const hash=payloadHash(result),id=randomUUID();
  await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context,"createdAt") VALUES (${id},${p.tenantId},${p.userId},${execution.snapshotId},'RETROSPECTIVE_REPORT','RETROSPECTIVE_REPORT',${execution.executionId},${`retrospective-report:${hash}`},${JSON.stringify(result)}::jsonb,${JSON.stringify({kind:"RETROSPECTIVE_REPORT_V1",hash,policyVersion:RETROSPECTIVE_POLICY_VERSION})}::jsonb,${now}) ON CONFLICT ("tenantId","idempotencyKey") DO NOTHING`);
  const [saved]=await tx.$queryRaw<Array<{id:string;after:typeof result}>>(Prisma.sql`SELECT id,after FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "idempotencyKey"=${`retrospective-report:${hash}`}`);
  return {reportId:saved.id,...saved.after};
 });
}
