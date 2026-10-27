import { selectedConnection } from "./source";
import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ConnectorReadError } from "./read-error";
import type { SqlClient, SqlDatabase } from "./database";
import { logWarn } from "@/lib/observability";
export interface ConnectorJob { id: string; tenantId: string; sourceId: string; importRunId: string; resource: string; connectionRevision: number; attempts: number; leaseToken: string | null }

/** Claim one available or expired job atomically; concurrent workers skip locked rows. */
export async function claimConnectorJob<T extends ConnectorJob>(resource: string | null, db: SqlDatabase = prisma, tenantId?: string, now = new Date(), jobId?: string) {
  const token = randomUUID();
  const [job] = await db.$queryRaw<T[]>(Prisma.sql`WITH candidate AS (
    SELECT j.id FROM "ConnectorConnection" c JOIN LATERAL (
      SELECT q.id,q.mode,q.state,q."availableAt",q."updatedAt" FROM "ConnectorSyncJob" q
      WHERE q."tenantId"=c."tenantId" AND q."sourceId"=c."sourceId"
        AND (${resource}::text IS NULL OR q.resource=${resource})
        AND (${jobId??null}::text IS NULL OR q.id=${jobId??null})
        AND ((q.state IN ('PENDING','RETRY') AND q."availableAt"<=${now}) OR (q.state='RUNNING' AND q."leaseExpiresAt"<=${now}))
        AND NOT EXISTS (SELECT 1 FROM "ConnectorSyncJob" held WHERE held."tenantId"=q."tenantId" AND held."sourceId"=q."sourceId" AND held.state='RUNNING' AND (held."leaseExpiresAt">${now} OR held.id<>q.id))
      ORDER BY CASE WHEN q.state='RUNNING' THEN 0 WHEN q.mode='BACKFILL' THEN 2 ELSE 1 END,q."updatedAt",q."createdAt" LIMIT 1
    ) j ON true WHERE ${selectedConnection()} AND (${tenantId ?? null}::text IS NULL OR c."tenantId"=${tenantId ?? null})
    ORDER BY CASE WHEN j.state='RUNNING' THEN 0 WHEN j.mode='BACKFILL' THEN 2 ELSE 1 END,j."updatedAt"
    FOR UPDATE OF c SKIP LOCKED LIMIT 1
  ) UPDATE "ConnectorSyncJob" SET state='RUNNING',"leaseToken"=${token},"leaseExpiresAt"=${new Date(now.getTime()+120_000)},"updatedAt"=${now}
    WHERE id=(SELECT id FROM candidate) RETURNING *`);
  return job ?? null;
}

/** Resume the tenant’s latest recoverable job with its checkpoint and current connection revision. */
export async function resumeConnectorJob(tenantId:string,resource:string,db:SqlDatabase=prisma,jobId?:string,mode?:string) {
  return db.$transaction(async tx=>{
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR SHARE`);
    const [row]=await tx.$queryRaw<Array<{id:string;connectionRevision:number;checkpoint:Record<string,any>;stats:Record<string,number>;revision:number;provider:string;hasReceiptsKey:boolean;capabilities:{receipts?:boolean}|null}>>(Prisma.sql`
      SELECT j.*,c.revision,c.provider,c."hasReceiptsKey",c.capabilities FROM "ConnectorSyncJob" j JOIN "ConnectorConnection" c ON c."sourceId"=j."sourceId" AND c."tenantId"=j."tenantId"
      WHERE j."tenantId"=${tenantId} AND ${selectedConnection()} AND j.resource=${resource} AND j.state IN ('PAUSED','FAILED')
      AND (${jobId??null}::text IS NULL OR j.id=${jobId??null}) AND (${mode??null}::text IS NULL OR j.mode=${mode??null})
      AND (c.provider='salesdrive' OR c.capabilities IS NOT NULL)
      ORDER BY j."createdAt" DESC LIMIT 1 FOR UPDATE OF j,c`);
    if(!row)return 0;
    const checkpoint={...row.checkpoint};let stats=row.stats;
    if(row.connectionRevision!==row.revision) {
      delete checkpoint.continuation;delete checkpoint.catalog;
      if(row.provider!=="salesdrive") {
        checkpoint.page=1;checkpoint.stage=resource==="orders"?"statuses":row.capabilities?.receipts?"receipts":"catalog";
        checkpoint.historyComplete=false;checkpoint.receiptHistoryComplete=false;delete checkpoint.coverageFrom;delete checkpoint.coverageTo;
        stats=Object.fromEntries(Object.keys(row.stats).map(key=>[key,0]));
      }
      await tx.$executeRaw(Prisma.sql`DELETE FROM "ConnectorCatalogPage" WHERE "jobId"=${row.id} AND "tenantId"=${tenantId}`);
    }
    return tx.$executeRaw(Prisma.sql`UPDATE "ConnectorSyncJob" SET state='PENDING',attempts=0,"errorCode"=NULL,"availableAt"=now(),"updatedAt"=now(),"connectionRevision"=${row.revision},checkpoint=${JSON.stringify(checkpoint)}::jsonb,stats=${JSON.stringify(stats)}::jsonb WHERE id=${row.id} AND "tenantId"=${tenantId}`);
  });
}

/** Expose sanitized progress and issue codes for the current tenant connection only. */
export async function getConnectorProgress(tenantId: string, resource: string, db: SqlClient = prisma) {
  const [job] = await db.$queryRaw<Array<{ id: string; mode: string; state: string; stats: Record<string, number>; errorCode: string | null; availableAt: Date; updatedAt: Date; issues: string[] }>>(Prisma.sql`
    SELECT j.id,j.mode,j.state,j.stats,j."errorCode",j."availableAt",j."updatedAt", ARRAY(SELECT DISTINCT i.code FROM "ImportIssue" i WHERE i."importRunId"=j."importRunId" AND i."tenantId"=j."tenantId" ORDER BY i.code LIMIT 100) AS issues FROM "ConnectorSyncJob" j JOIN "ConnectorConnection" c ON c."sourceId"=j."sourceId" AND c."tenantId"=j."tenantId"
    WHERE j."tenantId"=${tenantId} AND ${selectedConnection()} AND j.resource=${resource} ORDER BY j."createdAt" DESC LIMIT 1`);
  return job ?? null;
}

/** Keep one diagnostic per run/code without storing source customer data in the message. */
export async function recordIssues(tx: SqlClient, job: Pick<ConnectorJob, "tenantId" | "importRunId">, codes: Set<string>) {
  for (const code of codes) await tx.$executeRaw(Prisma.sql`INSERT INTO "ImportIssue" (id,"tenantId","importRunId",code,severity,message)
    SELECT ${randomUUID()},${job.tenantId},${job.importRunId},${code},'WARNING',${code}
    WHERE NOT EXISTS (SELECT 1 FROM "ImportIssue" WHERE "importRunId"=${job.importRunId} AND code=${code})`);
}

/** Persist sanitized retry/failure state only if this worker still owns the lease. */
export async function failConnectorJob(job: ConnectorJob, error: unknown, db: SqlDatabase = prisma) {
    const csvError=error instanceof Error&&error.name==="CsvStoreError"&&/^CSV_[A-Z_]{1,64}$/.test(error.message)?error.message:null;
    const changed = error instanceof Error && error.message === "CONNECTOR_CONFIG_CHANGED";
    const unavailable=error instanceof Error && ["CONNECTOR_PROVIDER_UNAVAILABLE","CONNECTOR_BUDGET_UNVERIFIED"].includes(error.message)?error.message:null;
    const domainError = error instanceof Error && ["INVALID_CATALOG", "DUPLICATE_CATALOG_ID", "DUPLICATE_CATALOG_SKU", "CATALOG_IDENTITY_CONFLICT", "INVALID_CATALOG_NUMBER", "MIXED_CATALOG_OBSERVATION", "INVALID_RECEIPT_LINE"].includes(error.message) ? error.message : null;
    const code = csvError ?? unavailable ?? domainError ?? (changed ? "CONNECTOR_CONFIG_CHANGED" : error instanceof ConnectorReadError ? error.code : error instanceof Error && error.message === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "IMPORT_FAILED");
    const attempts = job.attempts + 1;
    const pause = Boolean(csvError) || Boolean(unavailable) || changed || code === "AUTH_FAILED" || code === "NOT_CONFIGURED";
    const state = pause ? "PAUSED" : attempts >= 8 && code !== "RATE_LIMITED" ? "FAILED" : "RETRY";
    const retry = error instanceof ConnectorReadError && error.retryAt ? error.retryAt : new Date(Date.now() + Math.min(3600_000, 15_000 * 2 ** Math.min(attempts, 8)) + Math.floor(Math.random() * 1000));
    const persisted = await db.$transaction(async (tx) => {
      const updated = await tx.$executeRaw(Prisma.sql`UPDATE "ConnectorSyncJob" SET state=${state},attempts=${attempts},"errorCode"=${code},"availableAt"=${retry},"leaseToken"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=now() WHERE id=${job.id} AND "leaseToken"=${job.leaseToken} AND state='RUNNING'`);
      if (updated && (state === "FAILED" || state === "PAUSED")) await tx.$executeRaw(Prisma.sql`UPDATE "DataImportRun" SET status='FAILED',"errorMessage"=${code},"completedAt"=now(),"updatedAt"=now() WHERE id=${job.importRunId} AND "tenantId"=${job.tenantId}`);
      return updated;
    });
    if (persisted) logWarn("connector.sync.retry", { jobId: job.id, sourceId: job.sourceId, resource: job.resource, state, code, attempts });
}
