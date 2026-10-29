import "server-only";
import {savedMvpPublicationsMatch} from "./mvp-publication-evidence";
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
/** Validate scoped published rows before any aggregate work; no financial summaries or full daily counts are computed. */
export async function resolveCustomLabelEvidence(p:AiPrincipal,scope:LabelScope,sourceId:string,tx:SqlClient){
  const {selected,snapshot}=await resolveAiSnapshot(p,scope.snapshotId,tx);
  if(sourceId!==selected.id)throw new CustomLabelError("LABEL_SOURCE_MISMATCH",409);
  const {query,canonical}=snapshotEvidenceQuery(snapshot,scope.filters??{});
  const rows=await tx.$queryRaw<EvidenceRow[]>(Prisma.sql`SELECT s."skuId",d.classification,d.metrics->>'productKind' "productKind",d.quantity::text quantity,(d.metrics->>'shortage')::boolean shortage,
    d.id "dailyId",d."configId" "calculationId",d."calculationVersion",(d.metrics->>'sourceObservedAt')::timestamptz "sourceObservedAt"
    FROM ${screenStockJoin} WHERE ${screenStockFilter(p.tenantId,query,"stock")} ORDER BY s."skuId" LIMIT ${LABEL_MAX_ROWS+1}`);
  if(rows.length>LABEL_MAX_ROWS)throw new CustomLabelError("LABEL_ROW_LIMIT",422);
  if(!await savedMvpPublicationsMatch(p,snapshot,selected.id,tx)||rows.some(r=>r.calculationId!==snapshot.stock.calculationId||r.calculationVersion!==snapshot.stock.calculationVersion))throw new AiExecutionError("AI_CONTEXT_INCOMPLETE");
  const normalized=rows.map(r=>({...r,sourceObservedAt:r.sourceObservedAt===null?null:new Date(r.sourceObservedAt).toISOString()}));
  const times=normalized.flatMap(r=>r.sourceObservedAt?[r.sourceObservedAt]:[]).sort();
  const observations={first:times[0]??null,last:times.at(-1)??null,missing:rows.length-times.length};
  const envelope=buildEvidenceEnvelope(p.tenantId,selected,snapshot,canonical,observations);
  return {rows:normalized,envelope,snapshotCreatedAt:snapshot.createdAt,
    fingerprint:payloadHash({version:"custom-label-evidence-v1",envelope,rows:normalized})};
}
