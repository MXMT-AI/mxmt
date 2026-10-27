import { resumeConnectorJob } from "./jobs";
import { selectedConnection } from "./source";
import type { ConnectorCapabilities } from "./contract";
import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SqlDatabase, SqlClient } from "./database";
import { enqueueOrderImport } from "./order-jobs";
import { enqueueInventoryImport } from "./inventory-jobs";

export type SyncResource = "orders" | "inventory" | "both";
interface Cycle { id: string; tenantId: string; sourceId: string; resource: SyncResource; reason: string; requestedAt: Date }

/** Persist an intent before dispatching remote work; schedule keys make repeats harmless. */
export async function requestSyncCycle(tenantId: string, resource: SyncResource, db: SqlDatabase = prisma, options: { key?: string; reason?: "MANUAL" | "CRON"; now?: Date } = {}) {
  return db.$transaction(async (tx) => {
    const [connection] = await tx.$queryRaw<Array<{sourceId: string; hasYmlUrl: boolean;provider:string;capabilities:ConnectorCapabilities|null}>>(Prisma.sql`SELECT "sourceId","hasYmlUrl",provider,capabilities FROM "ConnectorConnection" WHERE "tenantId"=${tenantId} AND ${selectedConnection("ConnectorConnection")} FOR UPDATE`);
    if (!connection) throw new Error("NOT_CONFIGURED");
    if(resource!=="inventory" && connection.provider!=="salesdrive" && !connection.capabilities?.orders) throw new Error("NOT_CONFIGURED");
    if (resource !== "orders" && !(connection.provider==="salesdrive"?connection.hasYmlUrl:connection.capabilities?.products&&connection.capabilities.stock)) throw new Error("CATALOG_NOT_CONFIGURED");
    const key = options.key ?? `manual:${randomUUID()}`;
    // A double-click/retry joins the current manual cycle instead of queuing unbounded refreshes.
    if (!options.key) {
      const [pending] = await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT c.id FROM "ConnectorSyncCycle" c
        WHERE c."tenantId"=${tenantId} AND c."sourceId"=${connection.sourceId} AND c.reason='MANUAL' AND c.resource=${resource}
        AND c."completedAt" IS NULL AND (c."dispatchedAt" IS NULL OR EXISTS (SELECT 1 FROM "ConnectorSyncJob" j WHERE j.id IN (c."ordersJobId",c."inventoryJobId") AND j.state<>'COMPLETE')) ORDER BY c."requestedAt" DESC LIMIT 1`);
      if (pending) return pending.id;
    }
    const [cycle] = await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`INSERT INTO "ConnectorSyncCycle" (id,"tenantId","sourceId","requestKey",reason,resource,"requestedAt")
      VALUES (${randomUUID()},${tenantId},${connection.sourceId},${key},${options.reason ?? 'MANUAL'},${resource},${options.now ?? new Date()})
      ON CONFLICT ("tenantId","sourceId","requestKey") DO UPDATE SET "requestKey"=EXCLUDED."requestKey" RETURNING id`);
    return cycle.id;
  });
}

/** Recover partially dispatched intents using stable per-cycle job identities. */
export async function dispatchSyncCycle(db: SqlDatabase = prisma, tenantId?: string) {
  const [cycle] = await db.$queryRaw<Cycle[]>(Prisma.sql`SELECT c.* FROM "ConnectorSyncCycle" c JOIN "ConnectorConnection" cfg ON cfg."sourceId"=c."sourceId" AND cfg."tenantId"=c."tenantId"
    WHERE ${selectedConnection("cfg")} AND c."dispatchedAt" IS NULL AND c."availableAt"<=now() AND (${tenantId ?? null}::text IS NULL OR c."tenantId"=${tenantId ?? null})
    ORDER BY c."availableAt",c."requestedAt" LIMIT 1`);
  if (!cycle) return false;
  try {
    const orders = cycle.resource !== 'inventory' ? await enqueueOrderImport(cycle.tenantId, "INCREMENTAL", { requestKey: cycle.id, expectedSourceId: cycle.sourceId, trigger: cycle.reason as "MANUAL" | "CRON" }, db) : null;
    const inventory = cycle.resource !== 'orders' ? await enqueueInventoryImport(cycle.tenantId, db, { requestKey: cycle.id, expectedSourceId: cycle.sourceId, trigger: cycle.reason as "MANUAL" | "CRON" }) : null;
    await db.$executeRaw(Prisma.sql`UPDATE "ConnectorSyncCycle" SET "ordersJobId"=${orders?.id ?? null},"inventoryJobId"=${inventory},"dispatchedAt"=now(),"errorCode"=NULL WHERE id=${cycle.id} AND "tenantId"=${cycle.tenantId}`);
    return true;
  } catch (error) {
    const code = error instanceof Error && ['NOT_CONFIGURED','CATALOG_NOT_CONFIGURED','INVALID_SOURCE_MAPPING','CONNECTOR_CONFIG_CHANGED','SYNC_QUEUE_FULL'].includes(error.message) ? error.message : 'DISPATCH_UNAVAILABLE';
    await db.$executeRaw(Prisma.sql`UPDATE "ConnectorSyncCycle" SET "errorCode"=${code},attempts=attempts+1,"availableAt"=now()+make_interval(secs=>LEAST(3600,60*power(2,LEAST(attempts,6)))::int) WHERE id=${cycle.id}`);
    return false;
  }
}

/** Reconcile completed cycles and expose durable completion IDs plus input readiness. */
export async function getSyncProgress(tenantId: string, db: SqlClient = prisma) {
  await db.$executeRaw(Prisma.sql`UPDATE "ConnectorSyncCycle" c SET "completedAt"=GREATEST(
    (SELECT "updatedAt" FROM "ConnectorSyncJob" WHERE id=c."ordersJobId"),
    (SELECT "updatedAt" FROM "ConnectorSyncJob" WHERE id=c."inventoryJobId"),c."dispatchedAt")
    WHERE c."tenantId"=${tenantId} AND EXISTS(SELECT 1 FROM "ConnectorConnection" cfg WHERE cfg."sourceId"=c."sourceId" AND cfg."tenantId"=c."tenantId" AND ${selectedConnection("cfg")}) AND c."completedAt" IS NULL AND c."dispatchedAt" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "ConnectorSyncJob" j WHERE j.id IN (c."ordersJobId",c."inventoryJobId") AND j.state<>'COMPLETE')`);
  const [cycleRows, resources, calculationRows, backfillRows, heartbeatRows] = await Promise.all([
    db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`SELECT c.id,c.reason,c.resource,c."requestedAt",c."completedAt",c."errorCode",
    CASE WHEN c."completedAt" IS NOT NULL THEN 'COMPLETE' WHEN o.state IN ('FAILED','PAUSED') OR i.state IN ('FAILED','PAUSED') THEN 'ACTION_REQUIRED' WHEN c."dispatchedAt" IS NULL THEN 'QUEUED' ELSE 'RUNNING' END state,
    o.id "ordersJobId",o.state "ordersState",i.id "inventoryJobId",i.state "inventoryState"
    FROM "ConnectorSyncCycle" c JOIN "ConnectorConnection" cfg ON cfg."sourceId"=c."sourceId" AND cfg."tenantId"=c."tenantId"
    LEFT JOIN "ConnectorSyncJob" o ON o.id=c."ordersJobId" LEFT JOIN "ConnectorSyncJob" i ON i.id=c."inventoryJobId"
    WHERE c."tenantId"=${tenantId} AND ${selectedConnection("cfg")} ORDER BY (c.reason='MANUAL') DESC,c."requestedAt" DESC,c.id LIMIT 1`),
    db.$queryRaw<Array<{resource:string;lastSuccess:Date|null;through:string|null;pending:number;errorCode:string|null}>>(Prisma.sql`SELECT r.resource,
    (SELECT MAX(j."updatedAt") FROM "ConnectorSyncJob" j WHERE j."tenantId"=cfg."tenantId" AND j."sourceId"=cfg."sourceId" AND j.resource=r.resource AND j.state='COMPLETE') "lastSuccess",
    (SELECT checkpoint->>'through' FROM "SyncCursor" WHERE "tenantId"=cfg."tenantId" AND "sourceId"=cfg."sourceId" AND resource=r.resource) through,
    (SELECT count(*)::int FROM "ConnectorSyncJob" j WHERE j."tenantId"=cfg."tenantId" AND j."sourceId"=cfg."sourceId" AND j.resource=r.resource AND j.state IN ('PENDING','RUNNING','RETRY')) pending,
    (SELECT "errorCode" FROM "ConnectorSyncJob" j WHERE j."tenantId"=cfg."tenantId" AND j."sourceId"=cfg."sourceId" AND j.resource=r.resource AND j.state IN ('FAILED','PAUSED','RETRY') ORDER BY j."updatedAt" DESC LIMIT 1) "errorCode"
    FROM "ConnectorConnection" cfg CROSS JOIN (VALUES ('orders'),('inventory')) r(resource) WHERE cfg."tenantId"=${tenantId} AND ${selectedConnection("cfg")}`),
    db.$queryRaw<Array<{state:string;requestedAt:Date}>>(Prisma.sql`SELECT r.state,r."requestedAt" FROM "ConnectorRecalculation" r JOIN "ConnectorConnection" cfg ON cfg."sourceId"=r."sourceId" AND cfg."tenantId"=r."tenantId" WHERE r."tenantId"=${tenantId} AND ${selectedConnection("cfg")} ORDER BY r."requestedAt" DESC LIMIT 1`),
    db.$queryRaw<Array<{id:string;state:string;stats:unknown;errorCode:string|null}>>(Prisma.sql`SELECT j.id,j.state,j.stats,j."errorCode" FROM "ConnectorSyncJob" j JOIN "ConnectorConnection" cfg ON cfg."sourceId"=j."sourceId" AND cfg."tenantId"=j."tenantId" WHERE j."tenantId"=${tenantId} AND ${selectedConnection("cfg")} AND j.mode='BACKFILL' ORDER BY j."createdAt" DESC LIMIT 1`),
    db.$queryRaw<Array<{lastTickAt:Date|null}>>(Prisma.sql`SELECT "lastScheduledAt" "lastTickAt" FROM "ConnectorConnection" WHERE "tenantId"=${tenantId} AND ${selectedConnection("ConnectorConnection")}`)
  ]);
  const [cycle]=cycleRows, [calculation]=calculationRows, [backfill]=backfillRows, [heartbeat]=heartbeatRows;
  return { lastTickAt: heartbeat?.lastTickAt ?? null, backfill: backfill ?? null, cycle: cycle ?? null, resources: resources.map((r) => ({...r,lagSeconds:(r.through || r.lastSuccess) ? Math.max(0,Math.floor((Date.now()-new Date(r.through ?? r.lastSuccess!).getTime())/1000)) : null})), calculation: calculation ?? null };
}

/** Resume only failed jobs belonging to the cycle displayed to this tenant. */
export async function resumeSyncCycle(tenantId: string, db: SqlDatabase = prisma) {
  const progress=await getSyncProgress(tenantId,db), id=progress.cycle?.id;
  if (!id) return 0;
  let count=0;
  for(const [resource,key] of [["orders","ordersJobId"],["inventory","inventoryJobId"]] as const) {
    const job=progress.cycle?.[key];
    if(typeof job==="string")count+=await resumeConnectorJob(tenantId,resource,db,job);
  }
  return count;
}

/** Recover historical progress independently from newer routine jobs. */
export async function resumeSyncBackfill(tenantId: string, db: SqlDatabase = prisma) {
  return resumeConnectorJob(tenantId,"orders",db,undefined,"BACKFILL");
}
