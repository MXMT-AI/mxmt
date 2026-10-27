import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SqlDatabase, SqlClient } from "./database";
import type { MerchandisingConnector } from "./contract";
import { payloadHash } from "./order-storage";
import { loadConnectorRuntime } from "./runtime";
import { selectedConnection, mappingKey } from "./source";
import { continuation, pageRequest, advancePage, type ContinuationState } from "./continuation";
import { readCatalogPage, stageCatalogPage, type CatalogPageState } from "./catalog-pages";
import type { ConnectorCapabilities } from "./contract";
import { claimConnectorJob, failConnectorJob, getConnectorProgress, recordIssues, resumeConnectorJob, type ConnectorJob } from "./jobs";
import { inventoryPolicy, type InventoryPolicy } from "./inventory-normalization";
import { storeReceipt, retainRecord } from "./receipt-storage";
import { storeCatalog } from "./catalog-storage";
import { completeConnectorInputs } from "@/lib/data-pipeline";
import { ConnectorReadError } from "./read-error";

export interface InventoryJob extends ConnectorJob {
  checkpoint: { stage: "receipts" | "catalog"; page: number; from?: string; to: string; policyHash: string; policy: InventoryPolicy; provider?:string; continuation?:ContinuationState;catalog?:CatalogPageState;receiptHistoryComplete?:boolean };
  stats: Record<string, number>;
}
/** Queue receipt changes followed by one complete, current catalogue observation. */
export async function enqueueInventoryImport(tenantId: string, db: SqlDatabase = prisma, options: { requestKey?: string; expectedSourceId?: string; trigger?: "MANUAL" | "CRON" } = {}) {
  return db.$transaction(async (tx) => {
    const [connection] = await tx.$queryRaw<Array<{ sourceId: string; revision: number; hasYmlUrl: boolean; hasReceiptsKey: boolean;provider:string;capabilities:ConnectorCapabilities|null }>>(Prisma.sql`SELECT "sourceId",revision,"hasYmlUrl","hasReceiptsKey",provider,capabilities FROM "ConnectorConnection" WHERE "tenantId"=${tenantId} AND ${options.expectedSourceId?Prisma.sql`"sourceId"=${options.expectedSourceId}`:selectedConnection("ConnectorConnection")} FOR UPDATE`);
    if (!connection || !(connection.provider==="salesdrive"?connection.hasYmlUrl:connection.capabilities?.products&&connection.capabilities.stock)) throw new Error("CATALOG_NOT_CONFIGURED");
    const hasReceipts=connection.provider==="salesdrive"?connection.hasReceiptsKey:connection.capabilities?.receipts===true;
    if (options.expectedSourceId && connection.sourceId !== options.expectedSourceId) throw new Error("CONNECTOR_CONFIG_CHANGED");
    if (options.requestKey) {
      const [existing] = await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT j.id FROM "ConnectorSyncJob" j JOIN "DataImportRun" r ON r.id=j."importRunId" WHERE j."tenantId"=${tenantId} AND r."idempotencyKey"=${`inventory:${connection.sourceId}:${options.requestKey}`}`);
      if (existing) return existing.id;
    } else {
      const [busy] = await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "ConnectorSyncJob" WHERE "tenantId"=${tenantId} AND "sourceId"=${connection.sourceId} AND resource='inventory' AND state IN ('PENDING','RUNNING','RETRY','PAUSED','FAILED') ORDER BY "createdAt" DESC LIMIT 1`);
      if (busy) return busy.id;
    }
    const [queued] = await tx.$queryRaw<Array<{n:number}>>(Prisma.sql`SELECT count(*)::int n FROM "ConnectorSyncJob" WHERE "tenantId"=${tenantId} AND "sourceId"=${connection.sourceId} AND state IN ('PENDING','RUNNING','RETRY')`);
    if (queued.n >= 200) throw new Error("SYNC_QUEUE_FULL");
    const [cursor] = await tx.$queryRaw<Array<{ checkpoint: { through?: string; policyHash?: string } }>>(Prisma.sql`SELECT checkpoint FROM "SyncCursor" WHERE "tenantId"=${tenantId} AND "sourceId"=${connection.sourceId} AND resource='receipts'`);
    const [config] = await tx.$queryRaw<Array<{ values: unknown }>>(Prisma.sql`SELECT values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "configType"='SOURCE_MAPPING' AND key=${mappingKey(connection.provider,connection.sourceId)} AND "isActive"=true AND "approvedAt" IS NOT NULL`);
    const now = new Date(), id = randomUUID(), runId = randomUUID();
    const policy = inventoryPolicy(config?.values), policyHash = payloadHash(policy);
    const checkpoint = { provider:connection.provider, stage: hasReceipts ? "receipts" : "catalog", page: 1, to: now.toISOString(),
      ...(cursor?.checkpoint.through && cursor.checkpoint.policyHash === policyHash ? { from: new Date(new Date(cursor.checkpoint.through).getTime()-2*3600_000).toISOString() } : {}), policy, policyHash };
    await tx.$executeRaw(Prisma.sql`INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES (${runId},${tenantId},${connection.sourceId},${options.trigger ?? 'MANUAL'}::"DataImportTrigger",'PENDING',${`inventory:${connection.sourceId}:${options.requestKey ?? id}`},${now},${now})`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "ConnectorSyncJob" (id,"tenantId","sourceId","importRunId",resource,mode,"connectionRevision",checkpoint,stats,"updatedAt") VALUES (${id},${tenantId},${connection.sourceId},${runId},'inventory','REFRESH',${connection.revision},${JSON.stringify(checkpoint)}::jsonb,'{"pages":0,"receipts":0,"products":0,"snapshots":0,"prices":0,"warnings":0}',${now})`);
    if (!hasReceipts) await recordIssues(tx, { tenantId, importRunId: runId }, new Set(["RECEIPTS_NOT_CONFIGURED"]));
    return id;
  });
}
/** Expose observation coverage, never imply that a current feed supplies historical stock. */
export async function getInventoryProgress(tenantId: string, db: SqlClient = prisma) {
  const job = await getConnectorProgress(tenantId, "inventory", db);
  const [coverage] = await db.$queryRaw<Array<{ firstObservedAt: Date | null; lastObservedAt: Date | null; observedDays: number; missingDays: number }>>(Prisma.sql`SELECT MIN(i."observedAt") "firstObservedAt",MAX(i."observedAt") "lastObservedAt",count(DISTINCT i."snapshotDate")::int "observedDays",GREATEST(0,MAX(GREATEST(i."snapshotDate",(now() AT TIME ZONE s.timezone)::date))-MIN(i."snapshotDate")+1-count(DISTINCT i."snapshotDate"))::int "missingDays"
    FROM "InventorySnapshot" i JOIN "ConnectorConnection" c ON c."sourceId"=i."sourceId" AND c."tenantId"=i."tenantId" JOIN "DataSource" s ON s.id=c."sourceId" AND s."tenantId"=c."tenantId" WHERE i."tenantId"=${tenantId} AND ${selectedConnection()}`);
  return { job, coverage: { ...coverage, historicalStockAvailable: false } };
}
/** Resume a failed or paused inventory job at its retained receipt/catalog stage. */
export const resumeInventoryImport = (tenantId: string, db: SqlDatabase = prisma) => resumeConnectorJob(tenantId, "inventory", db);
type Runtime = (tenantId: string, backfill?:boolean,sourceId?:string) => Promise<{ sourceId: string; revision: number; timezone: string; connector: MerchandisingConnector }>;
/** One receipt page or one validated atomic catalogue refresh per worker invocation. */
export async function processInventoryJob(tenantId?: string, db: SqlDatabase = prisma, load: Runtime = (id,backfill,sourceId)=>loadConnectorRuntime(id,backfill,db,undefined,sourceId), claimed?: InventoryJob) {
  const job = claimed ?? await claimConnectorJob<InventoryJob>("inventory", db, tenantId);
  if (!job) return { processed: false };
  try {
    const runtime = await load(job.tenantId,false,job.sourceId);
    if (runtime.sourceId !== job.sourceId || runtime.revision !== job.connectionRevision) throw new Error("CONNECTOR_CONFIG_CHANGED");
    const checkpoint = { ...job.checkpoint }, stats = { ...job.stats };
    if(checkpoint.provider&&checkpoint.provider!==runtime.connector.provider) throw new Error("CONNECTOR_CONFIG_CHANGED");
    let page:Awaited<ReturnType<MerchandisingConnector["getReceipts"]>>|null=null;
    let receiptsDone=false;
    if(checkpoint.stage==="receipts") {
      if(!runtime.connector.capabilities.receipts) throw new ConnectorReadError("NOT_CONFIGURED");
      const state=continuation(checkpoint.continuation,{sourceId:job.sourceId,provider:runtime.connector.provider,revision:job.connectionRevision,resource:"receipts",from:checkpoint.from??null,to:checkpoint.to,policyHash:checkpoint.policyHash,limit:25},runtime.connector.capabilities.pagination?.receipts??"page",checkpoint.page);
      page=await runtime.connector.getReceipts({...pageRequest(state),limit:25,...(runtime.connector.capabilities.incrementalReceipts?{updatedFrom:checkpoint.from,updatedTo:checkpoint.to}:{})});
      const next=advancePage(state,page,25);receiptsDone=next===null;
      checkpoint.continuation=next??state;
      if(runtime.connector.provider!=="salesdrive") {
        const coverage=page.historyCoverage;
        const complete=Boolean(coverage?.complete === true && Number.isFinite(Date.parse(coverage.from)) && Date.parse(coverage.from)<=Date.parse(coverage.to) && Date.parse(coverage.to)>=Date.parse(checkpoint.to) && (!checkpoint.from || Date.parse(coverage.from)<=Date.parse(checkpoint.from)));
        checkpoint.receiptHistoryComplete=state.sequence===0?complete:checkpoint.receiptHistoryComplete===true&&complete;
      }
    }
    const staged=!page&&!runtime.connector.getCatalogSnapshot?await readCatalogPage(runtime.connector,job,checkpoint.catalog??{}):null;
    let catalog=!page&&runtime.connector.getCatalogSnapshot?await runtime.connector.getCatalogSnapshot():null;
    if(catalog&&runtime.connector.provider!=="salesdrive"&&(!catalog.completePopulation||!catalog.observationId)) throw new ConnectorReadError("INVALID_RESPONSE");
    await db.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Tenant" WHERE id=${job.tenantId} FOR SHARE`);
      const [owned] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "ConnectorSyncJob" WHERE id=${job.id} AND state='RUNNING' AND "leaseToken"=${job.leaseToken} AND "leaseExpiresAt">now() FOR UPDATE`);
      if (!owned) throw new Error("LEASE_LOST");
      const [connection] = await tx.$queryRaw<Array<{ revision: number }>>(Prisma.sql`SELECT revision FROM "ConnectorConnection" WHERE "tenantId"=${job.tenantId} AND "sourceId"=${job.sourceId} AND ${selectedConnection("ConnectorConnection")} FOR SHARE`);
      if (connection?.revision !== job.connectionRevision) throw new Error("CONNECTOR_CONFIG_CHANGED");
      const scope = { ...job, timezone: runtime.timezone,provider:runtime.connector.provider }, issues = new Set<string>();
      if (page) {
        if (page.rawResponse) await retainRecord(tx, scope, "receipt-pages", String(checkpoint.page), { body: page.rawResponse }, new Date(page.observedAt));
        for (const receipt of page.records) {
          const result = await storeReceipt(tx, scope, receipt, checkpoint.policy);
          stats.receipts += result.imported; result.issues.forEach((issue) => issues.add(issue));
        }
        stats.pages++;
        if (checkpoint.continuation?.position.kind==="page") checkpoint.page=checkpoint.continuation.position.page;
        if(receiptsDone) {checkpoint.stage="catalog";issues.add("SOURCE_PAGINATION_NOT_SNAPSHOT");}
      }
      if(staged) {
        issues.add("SOURCE_PAGINATION_NOT_SNAPSHOT");
        catalog=await stageCatalogPage(tx,job,staged);
        checkpoint.catalog={continuation:staged.next,observationId:staged.page.observationId,observedAt:staged.page.observedAt};
      }
      if (catalog) {
        const result = await storeCatalog(tx, scope, catalog);
        stats.products=result.products; stats.snapshots=result.snapshots; stats.prices=result.prices;
        result.issues.forEach((issue) => issues.add(issue));
      }
      stats.warnings += issues.size;
      await recordIssues(tx, job, issues);
      const complete = Boolean(catalog);
      // The lease yields after this page; keep unfinished runs queued so sibling resources can progress.
      await tx.$executeRaw(Prisma.sql`UPDATE "DataImportRun" SET status=${complete ? "WARNING" : "PENDING"}::"DataRunStatus","sourceChecksum"=${catalog ? payloadHash(catalog.rawResponse) : null},stats=${JSON.stringify(stats)}::jsonb,"errorMessage"=NULL,"completedAt"=${complete ? new Date() : null},"updatedAt"=now() WHERE id=${job.importRunId} AND "tenantId"=${job.tenantId}`);
      if (complete && !issues.has("STALE_CATALOG_OBSERVATION")) await tx.$executeRaw(Prisma.sql`UPDATE "DataSource" SET "activeImportRunId"=${job.importRunId},"updatedAt"=now() WHERE id=${job.sourceId} AND "tenantId"=${job.tenantId}`);
      // An unconfigured receipt scope cannot establish a successful receipts watermark.
      if (complete && (stats.pages ?? 0)>0 && (runtime.connector.provider==="salesdrive"||checkpoint.receiptHistoryComplete===true)) await tx.$executeRaw(Prisma.sql`INSERT INTO "SyncCursor" (id,"tenantId","sourceId",resource,checkpoint,"lastSuccessfulRunId","updatedAt") VALUES (${randomUUID()},${job.tenantId},${job.sourceId},'receipts',${JSON.stringify({ through: checkpoint.to, policyHash: checkpoint.policyHash })}::jsonb,${job.importRunId},now())
        ON CONFLICT ("tenantId","sourceId",resource) DO UPDATE SET checkpoint=EXCLUDED.checkpoint,"lastSuccessfulRunId"=EXCLUDED."lastSuccessfulRunId","updatedAt"=now() WHERE ("SyncCursor".checkpoint->>'through')::timestamptz<=${checkpoint.to}::timestamptz`);
      if (complete && !issues.has("STALE_CATALOG_OBSERVATION")) await completeConnectorInputs(tx, job);
      if(complete&&staged) await tx.$executeRaw(Prisma.sql`DELETE FROM "ConnectorCatalogPage" WHERE "jobId"=${job.id} AND "tenantId"=${job.tenantId}`);
      await tx.$executeRaw(Prisma.sql`UPDATE "ConnectorSyncJob" SET state=${complete ? "COMPLETE" : "PENDING"},checkpoint=${JSON.stringify(checkpoint)}::jsonb,stats=${JSON.stringify(stats)}::jsonb,attempts=0,"errorCode"=NULL,"leaseToken"=NULL,"leaseExpiresAt"=NULL,"availableAt"=now(),"updatedAt"=now() WHERE id=${job.id}`);
    }, { timeout: 45_000, maxWait: 5_000 });
    return { processed: true };
  } catch (error) { await failConnectorJob(job, error, db); return { processed: true }; }
}
