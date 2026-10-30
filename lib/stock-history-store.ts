import "server-only";
import {Prisma} from "@prisma/client";
import type {SqlClient} from "./connectors/database";
import type {ScreenSnapshot} from "./merchandising-snapshot";
import type {ScreenQuery} from "./merchandising-screen-query";
import {screenStockJoin,screenStockFilter} from "./merchandising-screen-stock";
import {buildStockHistory,stockHistoryDates,STOCK_HISTORY_COHORT_LIMIT,type StockHistoryObservation} from "./stock-history";
export async function readStockHistory(tenantId:string,snapshot:ScreenSnapshot,q:ScreenQuery,tx:SqlClient){
 const cohort=await tx.$queryRaw<Array<{skuId:string;currency:string|null}>>(Prisma.sql`SELECT s."skuId",d.currency FROM ${screenStockJoin} WHERE ${screenStockFilter(tenantId,q,"stock")} AND d.metrics->>'productKind'='MERCHANDISE' ORDER BY s."skuId" LIMIT ${STOCK_HISTORY_COHORT_LIMIT+1}`);
 if(cohort.length>STOCK_HISTORY_COHORT_LIMIT)return {...buildStockHistory(snapshot.stock.asOf,[]),unavailableReason:"COHORT_LIMIT" as const};
 if(!cohort.length)return buildStockHistory(snapshot.stock.asOf,[]);
 const dates=stockHistoryDates(snapshot.stock.asOf).dates;
 const rows=await tx.$queryRaw<StockHistoryObservation[]>(Prisma.sql`
 WITH cohort AS (SELECT x->>'skuId' "skuId",x->>'currency' currency FROM jsonb_array_elements(${JSON.stringify(cohort)}::jsonb) x),
 requested AS (SELECT value::date date FROM jsonb_array_elements_text(${JSON.stringify(dates)}::jsonb)),
 observations AS (SELECT c.currency,d.date,c."skuId",i.quantity,i."costPrice",i."observedAt",
  COALESCE(i.quantity>=0 AND i.currency IS NOT DISTINCT FROM c.currency AND i.timezone=${snapshot.sourceState.timezone} AND (i."observedAt" AT TIME ZONE ${snapshot.sourceState.timezone})::date=d.date AND i."sourceRecordKey" IS NOT NULL AND r.status IN ('SUCCESS','WARNING'),false) valid
  FROM cohort c CROSS JOIN requested d LEFT JOIN "InventorySnapshot" i ON i."tenantId"=${tenantId} AND i."sourceId"=${snapshot.sourceId} AND i."skuId"=c."skuId" AND i."snapshotDate"=d.date AND i."observedAt"<${new Date(snapshot.stock.cutoff)}
  LEFT JOIN "DataImportRun" r ON r.id=i."importRunId" AND r."tenantId"=i."tenantId" AND r."sourceId"=i."sourceId")
 SELECT date::text date,currency,count(*)::int "cohortSize",count(*) FILTER(WHERE valid)::int "observedCount",
 COALESCE(sum(quantity) FILTER(WHERE valid),0)::text quantity,
 COALESCE(sum(CASE WHEN quantity=0 THEN 0 ELSE quantity*"costPrice" END) FILTER(WHERE valid AND (quantity=0 OR "costPrice">0)),0)::text "coveredCost",
 count(*) FILTER(WHERE valid AND (quantity=0 OR "costPrice">0))::int "costCount",
 min("observedAt") FILTER(WHERE valid)::text "firstObservedAt",max("observedAt") FILTER(WHERE valid)::text "lastObservedAt"
 FROM observations GROUP BY date,currency ORDER BY date,currency NULLS LAST`);
 return buildStockHistory(snapshot.stock.asOf,rows.map(r=>({...r,firstObservedAt:r.firstObservedAt?new Date(r.firstObservedAt).toISOString():null,lastObservedAt:r.lastObservedAt?new Date(r.lastObservedAt).toISOString():null})));
}
