import "server-only";
import { Prisma } from "@prisma/client";
import type { SqlClient } from "./connectors/database";
import { payloadHash } from "./connectors/order-storage";
import { resolveAiSnapshot,snapshotEvidenceQuery,buildEvidenceEnvelope } from "./ai-execution/context";
import { AiExecutionError,type AiPrincipal } from "./ai-execution/contracts";
import { screenStockJoin,screenStockFilter } from "./merchandising-screen-stock";
import { CustomLabelError,LABEL_MAX_ROWS,type LabelInputRow,type LabelScope } from "./custom-labels";

interface EvidenceRow extends LabelInputRow {
  dailyId:string;calculationId:string;calculationVersion:number;sourceObservedAt:Date|string|null;
}
interface Publication {
  id:string;inputKey:string;version:number;sourceId:string;clientConfigId:string|null;configIds:string[];
  period?:unknown;asOf?:string;cutoff?:string;rowCount?:number;
}
/** Validate scoped published rows before any aggregate work; no financial summaries or full daily counts are computed. */
export async function resolveCustomLabelEvidence(p:AiPrincipal,scope:LabelScope,sourceId:string,tx:SqlClient){
  const {selected,snapshot}=await resolveAiSnapshot(p,scope.snapshotId,tx);
  if(sourceId!==selected.id)throw new CustomLabelError("LABEL_SOURCE_MISMATCH",409);
  const {query,canonical}=snapshotEvidenceQuery(snapshot,scope.filters??{});
  const rows=await tx.$queryRaw<EvidenceRow[]>(Prisma.sql`SELECT s."skuId",d.classification,d.metrics->>'productKind' "productKind",d.quantity::text quantity,(d.metrics->>'shortage')::boolean shortage,
    d.id "dailyId",d."configId" "calculationId",d."calculationVersion",(d.metrics->>'sourceObservedAt')::timestamptz "sourceObservedAt"
    FROM ${screenStockJoin} WHERE ${screenStockFilter(p.tenantId,query,"stock")} ORDER BY s."skuId" LIMIT ${LABEL_MAX_ROWS+1}`);
  if(rows.length>LABEL_MAX_ROWS)throw new CustomLabelError("LABEL_ROW_LIMIT",422);
  // Only two publication headers are read. Their scoped row data has already passed the bound above.
  const [sales]=await tx.$queryRaw<Publication[]>(Prisma.sql`SELECT "financialResult"->>'calculationRunId' id,"financialResult"->>'inputKey' "inputKey",("financialResult"->>'calculationVersion')::int version,
    "financialResult"->'provenance'->>'sourceId' "sourceId","financialResult"->'provenance'->>'clientConfigId' "clientConfigId",
    "financialResult"->'provenance'->'configIds' "configIds","financialResult"->'period' period
    FROM "ReportCalculationRun" WHERE "tenantId"=${p.tenantId} AND id=${snapshot.sales.calculationId} AND "inputKey"=${snapshot.sales.inputKey} AND "calculationVersion"=${snapshot.sales.calculationVersion}
      AND "reportKind" IN ('SALESDRIVE','CONNECTOR') AND status IN ('SUCCESS','WARNING')`);
  const [daily]=await tx.$queryRaw<Publication[]>(Prisma.sql`SELECT values->'calculation'->>'calculationId' id,values->'calculation'->>'inputKey' "inputKey",
    (values->'calculation'->>'calculationVersion')::int version,values->'calculation'->'provenance'->>'sourceId' "sourceId",
    values->'calculation'->'provenance'->>'clientConfigId' "clientConfigId",values->'calculation'->'provenance'->'configIds' "configIds",
    values->'calculation'->>'asOf' "asOf",values->'calculation'->'period'->>'cutoff' cutoff,(values->'calculation'->>'rowCount')::int "rowCount"
    FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND id=${snapshot.stock.calculationId} AND "configType"='GENERAL' AND values->>'kind'='SKU_DAILY_INPUTS_V1'`);
  const sameIds=(ids:unknown)=>Array.isArray(ids)&&payloadHash(ids.slice().sort())===payloadHash(snapshot.settings.configIds.slice().sort());
  const valid=(pub:Publication|undefined,expected:{calculationId:string;inputKey:string;calculationVersion:number})=>pub&&pub.id===expected.calculationId&&pub.inputKey===expected.inputKey&&pub.version===expected.calculationVersion&&pub.sourceId===selected.id&&pub.clientConfigId===snapshot.settings.clientConfigId&&sameIds(pub.configIds);
  if(!valid(sales,snapshot.sales)||!valid(daily,snapshot.stock)||payloadHash(sales?.period)!==payloadHash(snapshot.sales.context.period)||
      daily?.asOf!==snapshot.stock.asOf||daily?.cutoff!==snapshot.stock.cutoff||daily?.rowCount!==snapshot.stock.rowCount||
      rows.some(r=>r.calculationId!==snapshot.stock.calculationId||r.calculationVersion!==snapshot.stock.calculationVersion))throw new AiExecutionError("AI_CONTEXT_INCOMPLETE");
  const normalized=rows.map(r=>({...r,sourceObservedAt:r.sourceObservedAt===null?null:new Date(r.sourceObservedAt).toISOString()}));
  const times=normalized.flatMap(r=>r.sourceObservedAt?[r.sourceObservedAt]:[]).sort();
  const observations={first:times[0]??null,last:times.at(-1)??null,missing:rows.length-times.length};
  const envelope=buildEvidenceEnvelope(p.tenantId,selected,snapshot,canonical,observations);
  return {rows:normalized,envelope,snapshotCreatedAt:snapshot.createdAt,
    fingerprint:payloadHash({version:"custom-label-evidence-v1",envelope,rows:normalized})};
}
