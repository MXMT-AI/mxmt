import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ConnectorReadError } from "./salesdrive";
import type { SqlClient, SqlDatabase } from "./database";
export interface ConnectorJob { id: string; tenantId: string; sourceId: string; importRunId: string; resource: string; connectionRevision: number; attempts: number; leaseToken: string | null }
const active = Prisma.sql`('PENDING','RUNNING','RETRY','PAUSED','FAILED')`;

/** Claim one available or expired job atomically; concurrent workers skip locked rows. */
export async function claimConnectorJob<T extends ConnectorJob>(resource: string, db: SqlDatabase = prisma, tenantId?: string, now = new Date()) {
  const token = randomUUID();
  const [job] = await db.$queryRaw<T[]>(Prisma.sql`UPDATE "ConnectorSyncJob" SET state='RUNNING',"leaseToken"=${token},"leaseExpiresAt"=${new Date(now.getTime() + 120_000)},"updatedAt"=${now}
    WHERE id=(SELECT id FROM "ConnectorSyncJob" WHERE resource=${resource} AND ((state IN ('PENDING','RETRY') AND "availableAt"<=${now}) OR (state='RUNNING' AND "leaseExpiresAt"<=${now}))
      ${tenantId ? Prisma.sql`AND "tenantId"=${tenantId}` : Prisma.empty} ORDER BY "availableAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
  return job ?? null;
}

/** Resume the tenant’s latest recoverable job with its checkpoint and current connection revision. */
export async function resumeConnectorJob(tenantId: string, resource: string, db: SqlDatabase = prisma) {
  // Explicit resume acknowledges the current credential revision, preserving the page.
  return db.$executeRaw(Prisma.sql`UPDATE "ConnectorSyncJob" j SET state='PENDING',attempts=0,"errorCode"=NULL,"availableAt"=now(),"updatedAt"=now(),"connectionRevision"=c.revision
    FROM "ConnectorConnection" c WHERE j."tenantId"=${tenantId} AND c."tenantId"=j."tenantId" AND c."sourceId"=j."sourceId" AND j.resource=${resource} AND j.state IN ('PAUSED','FAILED')
    AND NOT EXISTS (SELECT 1 FROM "ConnectorSyncJob" other WHERE other."tenantId"=j."tenantId" AND other."sourceId"=j."sourceId" AND other.id<>j.id AND other.state IN ${active})
    AND j.id=(SELECT id FROM "ConnectorSyncJob" WHERE "tenantId"=${tenantId} AND "sourceId"=j."sourceId" AND resource=${resource} ORDER BY "createdAt" DESC LIMIT 1)`);
}

/** Expose sanitized progress and issue codes for the current tenant connection only. */
export async function getConnectorProgress(tenantId: string, resource: string, db: SqlClient = prisma) {
  const [job] = await db.$queryRaw<Array<{ id: string; mode: string; state: string; stats: Record<string, number>; errorCode: string | null; availableAt: Date; updatedAt: Date; issues: string[] }>>(Prisma.sql`
    SELECT j.id,j.mode,j.state,j.stats,j."errorCode",j."availableAt",j."updatedAt", ARRAY(SELECT DISTINCT i.code FROM "ImportIssue" i WHERE i."importRunId"=j."importRunId" AND i."tenantId"=j."tenantId" ORDER BY i.code LIMIT 100) AS issues FROM "ConnectorSyncJob" j JOIN "ConnectorConnection" c ON c."sourceId"=j."sourceId" AND c."tenantId"=j."tenantId"
    WHERE j."tenantId"=${tenantId} AND j.resource=${resource} ORDER BY j."createdAt" DESC LIMIT 1`);
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
    const changed = error instanceof Error && error.message === "CONNECTOR_CONFIG_CHANGED";
    const domainError = error instanceof Error && ["INVALID_CATALOG", "DUPLICATE_CATALOG_ID", "DUPLICATE_CATALOG_SKU", "CATALOG_IDENTITY_CONFLICT", "INVALID_CATALOG_NUMBER", "MIXED_CATALOG_OBSERVATION", "INVALID_RECEIPT_LINE"].includes(error.message) ? error.message : null;
    const code = domainError ?? (changed ? "CONNECTOR_CONFIG_CHANGED" : error instanceof ConnectorReadError ? error.code : error instanceof Error && error.message === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "IMPORT_FAILED");
    const attempts = job.attempts + 1;
    const pause = changed || code === "AUTH_FAILED" || code === "NOT_CONFIGURED";
    const state = pause ? "PAUSED" : attempts >= 8 && code !== "RATE_LIMITED" ? "FAILED" : "RETRY";
    const retry = error instanceof ConnectorReadError && error.retryAt ? error.retryAt : new Date(Date.now() + Math.min(3600_000, 15_000 * 2 ** Math.min(attempts, 8)) + Math.floor(Math.random() * 1000));
    await db.$transaction(async (tx) => {
      const updated = await tx.$executeRaw(Prisma.sql`UPDATE "ConnectorSyncJob" SET state=${state},attempts=${attempts},"errorCode"=${code},"availableAt"=${retry},"leaseToken"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=now() WHERE id=${job.id} AND "leaseToken"=${job.leaseToken} AND state='RUNNING'`);
      if (updated && (state === "FAILED" || state === "PAUSED")) await tx.$executeRaw(Prisma.sql`UPDATE "DataImportRun" SET status='FAILED',"errorMessage"=${code},"completedAt"=now(),"updatedAt"=now() WHERE id=${job.importRunId} AND "tenantId"=${job.tenantId}`);
    });
}
