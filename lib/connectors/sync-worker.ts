import "server-only";
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
import { loadSalesDriveRuntime } from "./service";

/** Bound enqueue work to 25 connections and rotate them independently of import progress. */
export async function scheduleSalesDriveSyncs(db: SqlDatabase = prisma, now = new Date()) {
  const decision = salesDriveScheduleDecision(now);
  const sources = await db.$queryRaw<Array<{tenantId:string;sourceId:string;hasYmlUrl:boolean}>>(Prisma.sql`SELECT "tenantId","sourceId","hasYmlUrl" FROM "ConnectorConnection" WHERE provider='salesdrive' ORDER BY "lastScheduledAt" ASC NULLS FIRST,id LIMIT 25`);
  let requested=0;
  for (const source of sources) {
    try {
      await requestSyncCycle(source.tenantId,'orders',db,{key:`orders:${decision.ordersSlot}`,reason:'CRON',now}); requested++;
      if (decision.stockDue && source.hasYmlUrl) { await requestSyncCycle(source.tenantId,'inventory',db,{key:`stock:${decision.businessDate}`,reason:'CRON',now}); requested++; }
    } finally {
      await db.$executeRaw(Prisma.sql`UPDATE "ConnectorConnection" SET "lastScheduledAt"=${now} WHERE "tenantId"=${source.tenantId} AND "sourceId"=${source.sourceId}`);
    }
  }
  return {requested,connections:sources.length,decision};
}

/** One durable dispatch and one remote page/observation fit a single function invocation. */
export async function processSalesDriveSync(tenantId?: string, db: SqlDatabase = prisma, load = loadSalesDriveRuntime) {
  await dispatchSyncCycle(db,tenantId);
  const job = await claimConnectorJob<OrderJob | InventoryJob>(null,db,tenantId);
  if (!job) return processConnectorRecalculation(tenantId,db);
  const result = job.resource==='inventory' ? await processInventoryJob(tenantId,db,load,job as InventoryJob) : await processOrderJob(tenantId,db,load,job as OrderJob);
  logInfo('connector.sync.step',{jobId:job.id,sourceId:job.sourceId,resource:job.resource});
  return result;
}
