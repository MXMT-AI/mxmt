import "server-only";
import { processCsvJob, type CsvJob } from "./csv/worker";
import { processConnectorRecalculation } from "./recalculation";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { salesDriveScheduleDecision } from "@/lib/data-scheduler";
import { logInfo } from "@/lib/observability";
import type { SqlDatabase } from "./database";
import { claimConnectorJob } from "./jobs";
import { processOrderJob, type OrderJob } from "./order-jobs";
import { processInventoryJob, type InventoryJob } from "./inventory-jobs";
import { dispatchSyncCycle, requestSyncCycle } from "./sync-cycles";
import { loadConnectorRuntime } from "./runtime";
import { selectedConnection } from "./source";
import type { ConnectorCapabilities } from "./contract";

export async function scheduleSalesDriveSyncs(db: SqlDatabase = prisma, now = new Date()) {
  const decision = salesDriveScheduleDecision(now);
  const sources = await db.$queryRaw<Array<{tenantId:string;sourceId:string;hasYmlUrl:boolean;provider:string;capabilities:ConnectorCapabilities|null}>>(Prisma.sql`SELECT c."tenantId",c."sourceId",c."hasYmlUrl",c.provider,c.capabilities FROM "ConnectorConnection" c WHERE ${selectedConnection()} ORDER BY "lastScheduledAt" ASC NULLS FIRST,id LIMIT 25`);
  let requested=0;
  for (const source of sources) {
    try {
      if(source.provider!=="salesdrive"&&(!source.capabilities?.orders||source.capabilities.automaticSync!==true))continue;
      await requestSyncCycle(source.tenantId,'orders',db,{key:`orders:${decision.ordersSlot}`,reason:'CRON',now}); requested++;
      if (decision.stockDue && (source.provider==="salesdrive"?source.hasYmlUrl:source.capabilities?.products&&source.capabilities.stock)) { await requestSyncCycle(source.tenantId,'inventory',db,{key:`stock:${decision.businessDate}`,reason:'CRON',now}); requested++; }
    } finally {
      await db.$executeRaw(Prisma.sql`UPDATE "ConnectorConnection" SET "lastScheduledAt"=${now} WHERE "tenantId"=${source.tenantId} AND "sourceId"=${source.sourceId}`);
    }
  }
  return {requested,connections:sources.length,decision};
}

export async function processSalesDriveSync(tenantId?: string, db: SqlDatabase = prisma, load = (id:string,backfill=false,sourceId?:string)=>loadConnectorRuntime(id,backfill,db,undefined,sourceId)) {
  await dispatchSyncCycle(db,tenantId);
  const job = await claimConnectorJob<OrderJob | InventoryJob | CsvJob>(null,db,tenantId);
  if (!job) return processConnectorRecalculation(tenantId,db);
  const result = job.resource==='csv' ? await processCsvJob(tenantId,db,job as CsvJob) : job.resource==='inventory' ? await processInventoryJob(tenantId,db,load,job as InventoryJob) : await processOrderJob(tenantId,db,load,job as OrderJob);
  logInfo('connector.sync.step',{jobId:job.id,sourceId:job.sourceId,resource:job.resource});
  return result;
}

export const scheduleConnectorSyncs=scheduleSalesDriveSyncs;
export const processConnectorSync=processSalesDriveSync;
