import "server-only";
import {Prisma} from "@prisma/client";
import type {SqlClient} from "./connectors/database";
import type {ScreenSnapshot} from "./merchandising-snapshot";
import {payloadHash} from "./connectors/order-storage";
interface Publication {
  id:string;inputKey:string;version:number;sourceId:string;clientConfigId:string|null;configIds:string[];
  period?:unknown;asOf?:string;cutoff?:string;rowCount?:number;
}
/** Verify immutable saved publication headers without requiring historical evidence to match today's sync cursor. */
export async function savedMvpPublicationsMatch(p:{tenantId:string},snapshot:ScreenSnapshot,sourceId:string,tx:SqlClient){
  // Read only two publication headers; callers separately enforce their scoped row bounds.
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
  const valid=(pub:Publication|undefined,expected:{calculationId:string;inputKey:string;calculationVersion:number})=>pub&&pub.id===expected.calculationId&&pub.inputKey===expected.inputKey&&pub.version===expected.calculationVersion&&pub.sourceId===sourceId&&pub.clientConfigId===snapshot.settings.clientConfigId&&sameIds(pub.configIds);
  return !!valid(sales,snapshot.sales)&&!!valid(daily,snapshot.stock)&&payloadHash(sales?.period)===payloadHash(snapshot.sales.context.period)&&daily?.asOf===snapshot.stock.asOf&&daily?.cutoff===snapshot.stock.cutoff&&daily?.rowCount===snapshot.stock.rowCount;
}
