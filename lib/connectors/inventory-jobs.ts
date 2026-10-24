import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SqlDatabase, SqlClient } from "./database";
import type { MerchandisingConnector } from "./contract";
import { payloadHash } from "./order-storage";
import { loadSalesDriveRuntime } from "./service";
import { claimConnectorJob, failConnectorJob, getConnectorProgress, recordIssues, resumeConnectorJob, type ConnectorJob } from "./jobs";
import { inventoryPolicy, type InventoryPolicy } from "./inventory-normalization";
import { storeReceipt, retainRecord } from "./receipt-storage";
import { storeCatalog } from "./catalog-storage";
import { ConnectorReadError } from "./salesdrive";

interface InventoryJob extends ConnectorJob {
  checkpoint: { stage: "receipts" | "catalog"; page: number; from?: string; to: string; policyHash: string; policy: InventoryPolicy };
  stats: Record<string, number>;
}
/** Queue receipt changes followed by one complete, current catalogue observation. */
export async function enqueueInventoryImport(tenantId: string, db: SqlDatabase = prisma) {
  return db.$transaction(async (tx) => {
    const [connection] = await tx.$queryRaw<Array<{ sourceId: string; revision: number; hasYmlUrl: boolean; hasReceiptsKey: boolean }>>(Prisma.sql`SELECT "sourceId",revision,"hasYmlUrl","hasReceiptsKey" FROM "ConnectorConnection" WHERE "tenantId"=${tenantId} AND provider='salesdrive' FOR UPDATE`);
    if (!connection?.hasYmlUrl) throw new Error("CATALOG_NOT_CONFIGURED");
    const [busy] = await tx.$queryRaw<Array<{ id: string; resource: string }>>(Prisma.sql`SELECT id,resource FROM "ConnectorSyncJob" WHERE "tenantId"=${tenantId} AND "sourceId"=${connection.sourceId} AND state IN ('PENDING','RUNNING','RETRY','PAUSED','FAILED')`);
    if (busy) { if (busy.resource !== "inventory") throw new Error("IMPORT_BUSY"); return busy.id; }
    const [cursor] = await tx.$queryRaw<Array<{ checkpoint: { through?: string; policyHash?: string } }>>(Prisma.sql`SELECT checkpoint FROM "SyncCursor" WHERE "tenantId"=${tenantId} AND "sourceId"=${connection.sourceId} AND resource='receipts'`);
    const [config] = await tx.$queryRaw<Array<{ values: unknown }>>(Prisma.sql`SELECT values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "configType"='SOURCE_MAPPING' AND key=${`salesdrive:${connection.sourceId}`} AND "isActive"=true AND "approvedAt" IS NOT NULL`);
    const now = new Date(), id = randomUUID(), runId = randomUUID();
    const policy = inventoryPolicy(config?.values), policyHash = payloadHash(policy);
    const checkpoint = { stage: connection.hasReceiptsKey ? "receipts" : "catalog", page: 1, to: now.toISOString(),
      ...(cursor?.checkpoint.through && cursor.checkpoint.policyHash === policyHash ? { from: new Date(new Date(cursor.checkpoint.through).getTime()-2*3600_000).toISOString() } : {}), policy, policyHash };
    await tx.$executeRaw(Prisma.sql`INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES (${runId},${tenantId},${connection.sourceId},'MANUAL','PENDING',${`inventory:${id}`},${now},${now})`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "ConnectorSyncJob" (id,"tenantId","sourceId","importRunId",resource,mode,"connectionRevision",checkpoint,stats,"updatedAt") VALUES (${id},${tenantId},${connection.sourceId},${runId},'inventory','REFRESH',${connection.revision},${JSON.stringify(checkpoint)}::jsonb,'{"pages":0,"receipts":0,"products":0,"snapshots":0,"prices":0,"warnings":0}',${now})`);
    if (!connection.hasReceiptsKey) await recordIssues(tx, { tenantId, importRunId: runId }, new Set(["RECEIPTS_NOT_CONFIGURED"]));
    return id;
  });
}
/** Expose observation coverage, never imply that a current feed supplies historical stock. */
export async function getInventoryProgress(tenantId: string, db: SqlClient = prisma) {
  const job = await getConnectorProgress(tenantId, "inventory", db);
  const [coverage] = await db.$queryRaw<Array<{ firstObservedAt: Date | null; lastObservedAt: Date | null; observedDays: number; missingDays: number }>>(Prisma.sql`SELECT MIN(i."observedAt") "firstObservedAt",MAX(i."observedAt") "lastObservedAt",count(DISTINCT i."snapshotDate")::int "observedDays",GREATEST(0,MAX(GREATEST(i."snapshotDate",(now() AT TIME ZONE s.timezone)::date))-MIN(i."snapshotDate")+1-count(DISTINCT i."snapshotDate"))::int "missingDays"
    FROM "InventorySnapshot" i JOIN "ConnectorConnection" c ON c."sourceId"=i."sourceId" AND c."tenantId"=i."tenantId" JOIN "DataSource" s ON s.id=c."sourceId" AND s."tenantId"=c."tenantId" WHERE i."tenantId"=${tenantId}`);
  return { job, coverage: { ...coverage, historicalStockAvailable: false } };
}
export const resumeInventoryImport = (tenantId: string, db: SqlDatabase = prisma) => resumeConnectorJob(tenantId, "inventory", db);
type Runtime = (tenantId: string) => Promise<{ sourceId: string; revision: number; timezone: string; connector: MerchandisingConnector }>;
/** One receipt page or one validated atomic catalogue refresh per worker invocation. */
export async function processInventoryJob(tenantId?: string, db: SqlDatabase = prisma, load: Runtime = loadSalesDriveRuntime) {
  const job = await claimConnectorJob<InventoryJob>("inventory", db, tenantId);
  if (!job) return { processed: false };
  try {
    const runtime = await load(job.tenantId);
    if (runtime.sourceId !== job.sourceId || runtime.revision !== job.connectionRevision) throw new Error("CONNECTOR_CONFIG_CHANGED");
    const checkpoint = { ...job.checkpoint }, stats = { ...job.stats };
    const page = checkpoint.stage === "receipts" ? await runtime.connector.getReceipts({ page: checkpoint.page, limit: 25, updatedFrom: checkpoint.from, updatedTo: checkpoint.to }) : null;
    if (page && (page.records.length>25 || page.nextPage !== null && page.nextPage !== checkpoint.page+1)) throw new ConnectorReadError("INVALID_RESPONSE");
    if (!page && !runtime.connector.getCatalogSnapshot) throw new ConnectorReadError("NOT_CONFIGURED");
    const catalog = !page ? await runtime.connector.getCatalogSnapshot!() : null;
    await db.$transaction(async (tx) => {
      const [owned] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "ConnectorSyncJob" WHERE id=${job.id} AND state='RUNNING' AND "leaseToken"=${job.leaseToken} AND "leaseExpiresAt">now() FOR UPDATE`);
      if (!owned) throw new Error("LEASE_LOST");
      const [connection] = await tx.$queryRaw<Array<{ revision: number }>>(Prisma.sql`SELECT revision FROM "ConnectorConnection" WHERE "tenantId"=${job.tenantId} AND "sourceId"=${job.sourceId} FOR SHARE`);
      if (connection?.revision !== job.connectionRevision) throw new Error("CONNECTOR_CONFIG_CHANGED");
      const scope = { ...job, timezone: runtime.timezone }, issues = new Set<string>();
      if (page) {
        if (page.rawResponse) await retainRecord(tx, scope, "receipt-pages", String(checkpoint.page), { body: page.rawResponse }, new Date(page.observedAt));
        for (const receipt of page.records) {
          const result = await storeReceipt(tx, scope, receipt, checkpoint.policy);
          stats.receipts += result.imported; result.issues.forEach((issue) => issues.add(issue));
        }
        stats.pages++;
        if (page.nextPage) checkpoint.page = page.nextPage;
        else { checkpoint.stage = "catalog"; issues.add("SOURCE_PAGINATION_NOT_SNAPSHOT"); }
      }
      if (catalog) {
        const result = await storeCatalog(tx, scope, catalog);
        stats.products=result.products; stats.snapshots=result.snapshots; stats.prices=result.prices;
        result.issues.forEach((issue) => issues.add(issue));
      }
      stats.warnings += issues.size;
      await recordIssues(tx, job, issues);
      const complete = Boolean(catalog);
      await tx.$executeRaw(Prisma.sql`UPDATE "DataImportRun" SET status=${complete ? "WARNING" : "RUNNING"}::"DataRunStatus","sourceChecksum"=${catalog ? payloadHash(catalog.rawResponse) : null},stats=${JSON.stringify(stats)}::jsonb,"errorMessage"=NULL,"completedAt"=${complete ? new Date() : null},"updatedAt"=now() WHERE id=${job.importRunId} AND "tenantId"=${job.tenantId}`);
      if (complete && !issues.has("STALE_CATALOG_OBSERVATION")) await tx.$executeRaw(Prisma.sql`UPDATE "DataSource" SET "activeImportRunId"=${job.importRunId},"updatedAt"=now() WHERE id=${job.sourceId} AND "tenantId"=${job.tenantId}`);
      // An unconfigured receipt scope cannot establish a successful receipts watermark.
      if (complete && (stats.pages ?? 0)>0) await tx.$executeRaw(Prisma.sql`INSERT INTO "SyncCursor" (id,"tenantId","sourceId",resource,checkpoint,"lastSuccessfulRunId","updatedAt") VALUES (${randomUUID()},${job.tenantId},${job.sourceId},'receipts',${JSON.stringify({ through: checkpoint.to, policyHash: checkpoint.policyHash })}::jsonb,${job.importRunId},now())
        ON CONFLICT ("tenantId","sourceId",resource) DO UPDATE SET checkpoint=EXCLUDED.checkpoint,"lastSuccessfulRunId"=EXCLUDED."lastSuccessfulRunId","updatedAt"=now() WHERE ("SyncCursor".checkpoint->>'through')::timestamptz<=${checkpoint.to}::timestamptz`);
      await tx.$executeRaw(Prisma.sql`UPDATE "ConnectorSyncJob" SET state=${complete ? "COMPLETE" : "PENDING"},checkpoint=${JSON.stringify(checkpoint)}::jsonb,stats=${JSON.stringify(stats)}::jsonb,attempts=0,"errorCode"=NULL,"leaseToken"=NULL,"leaseExpiresAt"=NULL,"availableAt"=now(),"updatedAt"=now() WHERE id=${job.id}`);
    }, { timeout: 45_000, maxWait: 5_000 });
    return { processed: true };
  } catch (error) { await failConnectorJob(job, error, db); return { processed: true }; }
}
