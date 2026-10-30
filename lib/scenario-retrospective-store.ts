import "server-only";
import {Prisma} from "@prisma/client";
import {prisma} from "./prisma";
import type {SqlDatabase} from "./connectors/database";
import {aiTransaction} from "./ai-execution/budget";
import type {AiPrincipal} from "./ai-execution/contracts";
import type {ScenarioExportCommand,ScenarioExportReceipt} from "./scenario-export-contract";
import {parseRetrospectiveRequest,RetrospectiveError,RETROSPECTIVE_GATES} from "./scenario-retrospective";
export async function prepareScenarioRetrospective(p:AiPrincipal,value:unknown,db:SqlDatabase=prisma){
 const q=parseRetrospectiveRequest(value);
 return aiTransaction(p,db,async tx=>{
  const [row]=await tx.$queryRaw<Array<{actorId:string;receipt:ScenarioExportReceipt;request:ScenarioExportCommand;dataVersion:unknown;rowsHash:string;rowCount:number;metadataBytes:number}>>(Prisma.sql`
   SELECT "actorId",CASE WHEN octet_length((context->'request')::text)+octet_length((after->'receipt')::text)<=524288 THEN after->'receipt' ELSE NULL END receipt,
    CASE WHEN octet_length((context->'request')::text)+octet_length((after->'receipt')::text)<=524288 THEN context->'request' ELSE NULL END request,context->'dataVersion' "dataVersion",
    md5((after->'rows')::text) "rowsHash",jsonb_array_length(after->'rows') "rowCount",octet_length((context->'request')::text)+octet_length((after->'receipt')::text) "metadataBytes"
   FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "entityType"='SCENARIO_EXPORT' AND "idempotencyKey"=${`export:${q.exportId}`} AND context->>'kind'='SCENARIO_EXPORT_V1'`);
  if(row&&row.actorId===p.userId&&row.metadataBytes>512*1024)throw new RetrospectiveError("RETROSPECTIVE_METADATA_LIMIT",422);
  if(!row||row.actorId!==p.userId||row.receipt.kind!==q.kind||row.request.kind!==q.kind)throw new RetrospectiveError("RETROSPECTIVE_EXPORT_NOT_FOUND",404);
  return {version:1,state:"PREPARATION_ONLY",executionState:"UNCONFIRMED",metricsState:"NOT_EVALUATED",period:q.period,
   export:{receipt:row.receipt,parameters:row.request,provenance:row.dataVersion,exportedRowCount:row.rowCount,exportedRowsHash:row.rowsHash},
   gates:RETROSPECTIVE_GATES,actualSales:null,gmroi:null,causalUplift:null,externalActionExecuted:false};
 });
}
