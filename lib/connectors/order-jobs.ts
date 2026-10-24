import "server-only";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isRecord } from "@/lib/api-contracts";
import type { SqlDatabase, SqlClient } from "./database";
import type { MerchandisingConnector } from "./contract";
import { claimConnectorJob, resumeConnectorJob, getConnectorProgress, recordIssues, failConnectorJob } from "./jobs";
import { ConnectorReadError } from "./salesdrive";
import { loadSalesDriveRuntime } from "./service";
import { storeOrder, payloadHash } from "./order-storage";
import type { OrderPolicy } from "./order-normalization";

export type ImportMode = "BACKFILL" | "INCREMENTAL" | "WEBHOOK";
interface Checkpoint { stage: "statuses" | "channels" | "orders"; page: number; from: string; to: string; orderId?: string; policy: OrderPolicy }
interface Stats { pages: number; orders: number; imported: number; duplicate: number; stale: number; quarantined: number; warnings: number }
export interface OrderJob {
  id: string; tenantId: string; sourceId: string; importRunId: string; resource: string; mode: ImportMode; state: string;
  connectionRevision: number; checkpoint: Checkpoint; stats: Stats; attempts: number;
  availableAt: Date; leaseToken: string | null; leaseExpiresAt: Date | null; errorCode: string | null;
}
const emptyStats = (): Stats => ({ pages: 0, orders: 0, imported: 0, duplicate: 0, stale: 0, quarantined: 0, warnings: 0 });
// Failed jobs require explicit recovery before any newer job can hide their checkpoint.
const active = Prisma.sql`('PENDING','RUNNING','RETRY','PAUSED','FAILED')`;

function parsePolicy(value: unknown): OrderPolicy {
  if (!isRecord(value)) throw new Error("INVALID_SOURCE_MAPPING");
  const policy: OrderPolicy = {};
  if (value.statuses !== undefined) {
    if (!isRecord(value.statuses) || Object.entries(value.statuses).some(([id, kind]) => !/^\d+$/.test(id) || !["UNKNOWN", "SALE", "RETURN", "PREORDER", "REFUSAL"].includes(String(kind)))) throw new Error("INVALID_SOURCE_MAPPING");
    policy.statuses = value.statuses as OrderPolicy["statuses"];
  }
  if (value.channels !== undefined) {
    if (!isRecord(value.channels) || Object.entries(value.channels).some(([id, name]) => !/^\d+$/.test(id) || typeof name !== "string" || !name.trim() || name.length > 200)) throw new Error("INVALID_SOURCE_MAPPING");
    policy.channels = value.channels as Record<string, string>;
  }
  if (value.amounts !== undefined) {
    const a = value.amounts;
    if (!isRecord(a) || !["gross_unit", "net_unit"].includes(String(a.price)) || !["line", "unit"].includes(String(a.absoluteDiscount)) || typeof a.currency !== "string" || !/^[A-Z]{3}$/.test(a.currency) || a.cost !== undefined && a.cost !== "unit") throw new Error("INVALID_SOURCE_MAPPING");
    policy.amounts = a as unknown as OrderPolicy["amounts"];
  }
  return policy;
}

/** Serialize enqueue with credential changes; incremental cannot skip the initial history. */
export async function enqueueOrderImport(tenantId: string, mode: ImportMode, options: { orderId?: string; eventKey?: string; payload?: Record<string, unknown> } = {}, db: SqlDatabase = prisma, now = new Date()) {
  return db.$transaction(async (tx) => {
    const [connection] = await tx.$queryRaw<Array<{ sourceId: string; revision: number; timezone: string }>>(Prisma.sql`
      SELECT c."sourceId",c.revision,s.timezone FROM "ConnectorConnection" c JOIN "DataSource" s ON s.id=c."sourceId" AND s."tenantId"=c."tenantId"
      WHERE c."tenantId"=${tenantId} AND c.provider='salesdrive' FOR UPDATE OF c`);
    if (!connection) throw new Error("NOT_CONFIGURED");
    if (mode === "WEBHOOK" && (!options.orderId || !/^\d{1,20}$/.test(options.orderId) || !options.eventKey || !/^[a-f0-9]{64}$/.test(options.eventKey))) throw new Error("INVALID_WEBHOOK");
    const key = `salesdrive:${connection.sourceId}:${mode}:${mode === "WEBHOOK" ? options.eventKey : randomUUID()}`;
    const [existing] = await tx.$queryRaw<OrderJob[]>(Prisma.sql`SELECT j.* FROM "ConnectorSyncJob" j JOIN "DataImportRun" r ON r.id=j."importRunId" WHERE j."tenantId"=${tenantId} AND r."idempotencyKey"=${key}`);
    if (existing) return existing;
    const [busy] = await tx.$queryRaw<OrderJob[]>(Prisma.sql`SELECT * FROM "ConnectorSyncJob" WHERE "tenantId"=${tenantId} AND "sourceId"=${connection.sourceId} AND state IN ${active}`);
    if (busy) { if (mode === "WEBHOOK" || busy.resource !== "orders") throw new Error("IMPORT_BUSY"); return busy; }
    const [cursor] = await tx.$queryRaw<Array<{ checkpoint: { through: string } }>>(Prisma.sql`SELECT checkpoint FROM "SyncCursor" WHERE "tenantId"=${tenantId} AND "sourceId"=${connection.sourceId} AND resource='orders'`);
    if (mode === "INCREMENTAL" && !cursor?.checkpoint.through) throw new Error("BACKFILL_REQUIRED");
    const [config] = await tx.$queryRaw<Array<{ values: unknown }>>(Prisma.sql`SELECT values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "configType"='SOURCE_MAPPING' AND key=${`salesdrive:${connection.sourceId}`} AND "isActive"=true AND "approvedAt" IS NOT NULL`);
    const to = now.toISOString();
    const from = mode === "INCREMENTAL" ? new Date(new Date(cursor.checkpoint.through).getTime() - 2 * 3600_000).toISOString()
      : Temporal.Instant.from(to).toZonedDateTimeISO(connection.timezone).subtract({ years: 2 }).toInstant().toString({ smallestUnit: "second" });
    const checkpoint: Checkpoint = { stage: mode === "WEBHOOK" ? "orders" : "statuses", page: 1, from, to, ...(options.orderId ? { orderId: options.orderId } : {}), policy: config ? parsePolicy(config.values) : {} };
    const runId = randomUUID(), id = randomUUID();
    await tx.$executeRaw(Prisma.sql`INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES (${runId},${tenantId},${connection.sourceId},'MANUAL','PENDING',${key},${now},${now})`);
    const [job] = await tx.$queryRaw<OrderJob[]>(Prisma.sql`INSERT INTO "ConnectorSyncJob" (id,"tenantId","sourceId","importRunId",mode,"connectionRevision",checkpoint,stats,"updatedAt")
      VALUES (${id},${tenantId},${connection.sourceId},${runId},${mode},${connection.revision},${JSON.stringify(checkpoint)}::jsonb,${JSON.stringify(emptyStats())}::jsonb,${now}) RETURNING *`);
    if (mode === "WEBHOOK" && options.payload) await tx.$executeRaw(Prisma.sql`INSERT INTO "DataSourceRecord" (id,"tenantId","sourceId","importRunId",resource,"externalId",payload,"payloadHash","observedAt")
      VALUES (${randomUUID()},${tenantId},${connection.sourceId},${runId},'order-webhooks',${options.eventKey!},${JSON.stringify(options.payload)}::jsonb,${options.eventKey!},${now})`);
    return job;
  });
}

/** Claim only order jobs; other resources share the same source admission lock. */
export async function claimOrderJob(db: SqlDatabase = prisma, tenantId?: string, now = new Date()) {
  return claimConnectorJob<OrderJob>("orders", db, tenantId, now);
}
/** Resume the latest recoverable order job without discarding its checkpoint. */
export async function resumeOrderImport(tenantId: string, db: SqlDatabase = prisma) { return resumeConnectorJob(tenantId, "orders", db); }
/** Read tenant-scoped order progress through the shared sanitized projection. */
export async function getOrderImportProgress(tenantId: string, db: SqlClient = prisma) { return getConnectorProgress(tenantId, "orders", db); }

type RuntimeLoader = (tenantId: string) => Promise<{ sourceId: string; revision: number; timezone: string; connector: MerchandisingConnector }>;
/** One bounded remote page per invocation. No sleeping, recursive drains or request-lifetime backfills. */
export async function processOrderJob(tenantId?: string, db: SqlDatabase = prisma, loadRuntime: RuntimeLoader = loadSalesDriveRuntime) {
  const job = await claimOrderJob(db, tenantId);
  if (!job) return { processed: false };
  try {
    const runtime = await loadRuntime(job.tenantId);
    if (runtime.sourceId !== job.sourceId || runtime.revision !== job.connectionRevision) throw new Error("CONNECTOR_CONFIG_CHANGED");
    const checkpoint = { ...job.checkpoint }, stats = { ...job.stats }, codes = new Set<string>();
    let dictionary: unknown = null;
    let page: Awaited<ReturnType<MerchandisingConnector["getOrders"]>> | null = null;
    if (checkpoint.stage === "statuses") { dictionary = await runtime.connector.getStatuses(); checkpoint.stage = "channels"; }
    else if (checkpoint.stage === "channels") { dictionary = await runtime.connector.getChannels(); checkpoint.stage = "orders"; codes.add("CHANNEL_METADATA_UNVERIFIED"); }
    else {
      page = await runtime.connector.getOrders({ page: checkpoint.page, limit: 100,
        ...(job.mode === "BACKFILL" ? { orderedFrom: checkpoint.from, orderedTo: checkpoint.to } : job.mode === "INCREMENTAL" ? { updatedFrom: checkpoint.from, updatedTo: checkpoint.to } : { orderId: checkpoint.orderId }) });
      // Defensive against buggy providers: never persist an unbounded result or loop backwards.
      if (page.records.length > 100 || page.nextPage !== null && page.nextPage !== checkpoint.page + 1) throw new ConnectorReadError("INVALID_RESPONSE");
      if (job.mode === "WEBHOOK" && page.records.some((order) => order.externalId !== checkpoint.orderId)) throw new ConnectorReadError("INVALID_RESPONSE");
    }
    await db.$transaction(async (tx) => {
      const [owned] = await tx.$queryRaw<OrderJob[]>(Prisma.sql`SELECT * FROM "ConnectorSyncJob" WHERE id=${job.id} AND "leaseToken"=${job.leaseToken} AND state='RUNNING' AND "leaseExpiresAt">now() FOR UPDATE`);
      if (!owned) throw new Error("LEASE_LOST");
      const [connection] = await tx.$queryRaw<Array<{ revision: number }>>(Prisma.sql`SELECT revision FROM "ConnectorConnection" WHERE "tenantId"=${job.tenantId} AND "sourceId"=${job.sourceId} FOR SHARE`);
      if (connection?.revision !== job.connectionRevision) throw new Error("CONNECTOR_CONFIG_CHANGED");
      if (dictionary) {
        const resource = job.checkpoint.stage;
        await tx.$executeRaw(Prisma.sql`INSERT INTO "DataSourceRecord" (id,"tenantId","sourceId","importRunId",resource,"externalId",payload,"payloadHash","observedAt")
          VALUES (${randomUUID()},${job.tenantId},${job.sourceId},${job.importRunId},${resource},'dictionary',${JSON.stringify(dictionary)}::jsonb,${payloadHash(dictionary)},now()) ON CONFLICT ("importRunId",resource,"externalId") DO NOTHING`);
      }
      if (page) {
        if (page.rawResponse !== undefined) {
          const hash = payloadHash(page.rawResponse);
          await tx.$executeRaw(Prisma.sql`INSERT INTO "DataSourceRecord" (id,"tenantId","sourceId","importRunId",resource,"externalId",payload,"payloadHash","observedAt")
            VALUES (${randomUUID()},${job.tenantId},${job.sourceId},${job.importRunId},'order-pages',${`${job.checkpoint.page}:${hash}`},${JSON.stringify({ contentType: "application/json", body: page.rawResponse })}::jsonb,${hash},${new Date(page.observedAt)})
            ON CONFLICT ("importRunId",resource,"externalId") DO NOTHING`);
        }
        for (const order of page.records) {
          const result = await storeOrder(tx, { ...job, timezone: runtime.timezone }, order, checkpoint.policy);
          stats.orders++; stats[result.outcome as "imported" | "duplicate" | "stale" | "quarantined"]++;
          result.issues.forEach((code) => codes.add(code));
        }
        stats.pages++;
        if (page.nextPage) checkpoint.page = page.nextPage;
      }
      stats.warnings += codes.size;
      await recordIssues(tx, job, codes);
      const complete = Boolean(page && page.nextPage === null);
      // A fixed source window plus overlap is not an API snapshot; make that limitation visible.
      if (complete && job.mode !== "WEBHOOK") {
        await recordIssues(tx, job, new Set(["SOURCE_PAGINATION_NOT_SNAPSHOT"])); stats.warnings++;
      }
      await tx.$executeRaw(Prisma.sql`UPDATE "DataImportRun" SET status=${complete ? stats.warnings ? "WARNING" : "SUCCESS" : "RUNNING"}::"DataRunStatus",stats=${JSON.stringify(stats)}::jsonb,"completedAt"=${complete ? new Date() : null},"errorMessage"=NULL,"updatedAt"=now() WHERE id=${job.importRunId} AND "tenantId"=${job.tenantId}`);
      if (complete && job.mode !== "WEBHOOK") {
        // Never move an existing watermark backwards when replaying a historical baseline.
        await tx.$executeRaw(Prisma.sql`INSERT INTO "SyncCursor" (id,"tenantId","sourceId",resource,checkpoint,"lastSuccessfulRunId","updatedAt")
          VALUES (${randomUUID()},${job.tenantId},${job.sourceId},'orders',${JSON.stringify({ through: checkpoint.to })}::jsonb,${job.importRunId},now())
          ON CONFLICT ("tenantId","sourceId",resource) DO UPDATE SET checkpoint=EXCLUDED.checkpoint,"lastSuccessfulRunId"=EXCLUDED."lastSuccessfulRunId","updatedAt"=now()
          WHERE ("SyncCursor".checkpoint->>'through')::timestamptz <= ${checkpoint.to}::timestamptz`);
      }
      await tx.$executeRaw(Prisma.sql`UPDATE "ConnectorSyncJob" SET state=${complete ? "COMPLETE" : "PENDING"},checkpoint=${JSON.stringify(checkpoint)}::jsonb,stats=${JSON.stringify(stats)}::jsonb,
        attempts=0,"errorCode"=NULL,"leaseToken"=NULL,"leaseExpiresAt"=NULL,"availableAt"=now(),"updatedAt"=now() WHERE id=${job.id}`);
    }, { timeout: 45_000, maxWait: 5_000 });
    return { processed: true };
  } catch (error) {
    await failConnectorJob(job, error, db);
    return { processed: true };
  }
}
