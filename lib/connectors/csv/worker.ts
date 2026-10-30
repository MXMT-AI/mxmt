import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SqlDatabase } from "../database";
import {
  claimConnectorJob,
  failConnectorJob,
  recordIssues,
  type ConnectorJob,
} from "../jobs";
import { ConnectorSourceError, assertSelectedSource } from "../source";
import {
  csvContentHash,
  csvSettingsHash,
  readCsvImport,
  readCsvFiles,
  CsvStoreError,
} from "./store";
import { compileCsv, parseCsvOptions } from "./compile";
import { CsvConnector } from "./adapter";
import { storeOrder, payloadHash } from "../order-storage";
import { storeReceipt } from "../receipt-storage";
import { storeCatalog } from "../catalog-storage";
import { inventoryPolicy } from "../inventory-normalization";
import { readClientSettings } from "@/lib/merchandising-settings-store";
import { applyClientOrderSettings } from "@/lib/merchandising-order-policy";
import { completeConnectorInputs } from "@/lib/data-pipeline";
export interface CsvJob extends ConnectorJob {
  checkpoint: {
    uploadId: string;
    hash: string;
    selectionRevision: number;
    activationActorId: string;
  };
}
export async function processCsvJob(
  tenantId?: string,
  db: SqlDatabase = prisma,
  claimed?: CsvJob,
  jobId?: string,
) {
  const job =
    claimed ??
    (await claimConnectorJob<CsvJob>("csv", db, tenantId, new Date(), jobId));
  if (!job) return { processed: false };
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Tenant" WHERE id=${job.tenantId} FOR UPDATE`,
        );
        const [owned] = (await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "ConnectorSyncJob" WHERE id=${job.id} AND "tenantId"=${job.tenantId} AND state='RUNNING' AND "leaseToken"=${job.leaseToken} AND "leaseExpiresAt">now() FOR UPDATE`,
        )) as Array<{ id: string }>;
        if (!owned) throw new Error("LEASE_LOST");
        const upload = await readCsvImport(
          job.tenantId,
          job.checkpoint.uploadId,
          tx,
          true,
        );
        if (
          upload.sourceId !== job.sourceId ||
          upload.importRunId !== job.importRunId ||
          upload.state !== "QUEUED" ||
          upload.contentHash !== job.checkpoint.hash
        )
          throw new CsvStoreError("CSV_NOT_READY");
        await assertSelectedSource(
          job.tenantId,
          job.sourceId,
          job.checkpoint.selectionRevision,
          tx,
        );
        const [conn] = await tx.$queryRaw<Array<{ revision: number }>>(
          Prisma.sql`SELECT revision FROM "ConnectorConnection" WHERE "tenantId"=${job.tenantId} AND "sourceId"=${job.sourceId} AND provider='csv' FOR UPDATE`,
        );
        if (
          conn?.revision !== job.connectionRevision ||
          upload.context.revision !== conn.revision ||
          upload.context.settingsHash !==
            (await csvSettingsHash(tx, job.tenantId))
        )
          throw new CsvStoreError("CSV_SETTINGS_CHANGED");
        if (upload.expiresAt < new Date())
          throw new CsvStoreError("CSV_EXPIRED");
        const options = parseCsvOptions(upload.options),
          files = await readCsvFiles(upload, tx);
        if (csvContentHash(options, files) !== upload.contentHash)
          throw new CsvStoreError("CSV_HASH_CHANGED");
        const { bundle, preview } = compileCsv(files, options);
        if (preview.errors.length)
          throw new CsvStoreError("CSV_VALIDATION_FAILED");
        if (options.history?.complete) {
          const [missing] = await tx.$queryRaw<Array<{ n: number }>>(
            Prisma.sql`SELECT count(DISTINCT "externalOrderId")::int n FROM "OrderLine" WHERE "tenantId"=${job.tenantId} AND "sourceId"=${job.sourceId} AND "orderedAt">=${options.history.from}::timestamptz AND "orderedAt"<=${options.history.to}::timestamptz AND "externalOrderId" NOT IN (SELECT jsonb_array_elements_text(${JSON.stringify(bundle.orders.map((o) => o.externalId))}::jsonb))`,
          );
          if (missing.n) throw new CsvStoreError("CSV_HISTORY_OMITS_DOCUMENTS");
        }
        if (options.receiptHistory?.complete) {
          const [missing] = await tx.$queryRaw<Array<{ n: number }>>(
            Prisma.sql`SELECT count(*)::int n FROM "Receipt" WHERE "tenantId"=${job.tenantId} AND "sourceId"=${job.sourceId} AND "receivedAt">=${options.receiptHistory.from}::timestamptz AND "receivedAt"<=${options.receiptHistory.to}::timestamptz AND "externalId" NOT IN (SELECT jsonb_array_elements_text(${JSON.stringify(bundle.receipts.map((r) => r.externalId))}::jsonb))`,
          );
          if (missing.n) throw new CsvStoreError("CSV_HISTORY_OMITS_DOCUMENTS");
        }
        const connector = new CsvConnector(bundle),
          scope = {
            tenantId: job.tenantId,
            sourceId: job.sourceId,
            importRunId: job.importRunId,
            timezone: options.timezone,
            provider: "csv",
          };
        const client = await readClientSettings(job.tenantId, tx),
          policy = client.id
            ? applyClientOrderSettings(options.policy, client.values, {
                id: client.id,
                revision: client.revision,
              })
            : options.policy;
        const mappingKey = `csv:${job.sourceId}`;
        const [old] = await tx.$queryRaw<
          Array<{ id: string; revision: number; values: unknown }>
        >(
          Prisma.sql`SELECT id,revision,values FROM "MerchandisingConfig" WHERE "tenantId"=${job.tenantId} AND "configType"='SOURCE_MAPPING' AND key=${mappingKey} AND "isActive" FOR UPDATE`,
        );
        if (
          old &&
          payloadHash(old.values) !== payloadHash(options.policy) &&
          options.mappingRevision <= old.revision
        )
          throw new CsvStoreError("CSV_MAPPING_REVISION");
        if (!old || payloadHash(old.values) !== payloadHash(options.policy)) {
          await tx.$executeRaw(
            Prisma.sql`UPDATE "MerchandisingConfig" SET "isActive"=false WHERE "tenantId"=${job.tenantId} AND "configType"='SOURCE_MAPPING' AND key=${mappingKey}`,
          );
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedById","approvedAt","approvalReference") VALUES (${randomUUID()},${job.tenantId},'SOURCE_MAPPING',${mappingKey},${options.mappingRevision},${JSON.stringify(options.policy)}::jsonb,true,${upload.context.actorId},now(),${`csv-preview:${upload.id}:${upload.contentHash}`})`,
          );
        }
        const issues = new Set(preview.warnings),
          stats = { orders: 0, receipts: 0, products: 0, snapshots: 0 };
        for (let page = 1; ; page++) {
          const result = await connector.getOrders({ page, limit: 100 });
          for (const order of result.records) {
            const saved = await storeOrder(tx, scope, order, policy);
            if (saved.outcome === "quarantined" || saved.outcome === "stale")
              throw new CsvStoreError("CSV_ORDER_VERSION_CONFLICT");
            saved.issues.forEach((i) => issues.add(i));
            stats.orders++;
          }
          if (result.nextPage === null) break;
        }
        const receiptsPolicy = inventoryPolicy(options.policy);
        for (const receipt of bundle.receipts) {
          const saved = await storeReceipt(tx, scope, receipt, receiptsPolicy);
          if (
            saved.issues.some((i) =>
              ["RECEIPT_VERSION_CONFLICT", "INVALID_RECEIPT_LINE"].includes(i),
            )
          )
            throw new CsvStoreError("CSV_RECEIPT_VERSION_CONFLICT");
          saved.issues.forEach((i) => issues.add(i));
          stats.receipts += saved.imported;
        }
        for (const catalog of bundle.catalogs) {
          const result = await storeCatalog(tx, scope, catalog);
          stats.products += result.products;
          stats.snapshots += result.snapshots;
          result.issues.forEach((i) => issues.add(i));
          if (result.issues.includes("STALE_CATALOG_OBSERVATION"))
            throw new CsvStoreError("CSV_STALE_CATALOG");
          await tx.$executeRaw(
            Prisma.sql`DROP TABLE IF EXISTS pg_temp.mxmt_catalog_stage`,
          );
        }
        for (const resource of ["statuses", "channels"] as const)
          if (bundle[resource].entries.length)
            await tx.$executeRaw(
              Prisma.sql`INSERT INTO "DataSourceRecord" (id,"tenantId","sourceId","importRunId",resource,"externalId",payload,"payloadHash","observedAt") VALUES (${randomUUID()},${job.tenantId},${job.sourceId},${job.importRunId},${resource},'dictionary',${JSON.stringify(bundle[resource])}::jsonb,${payloadHash(bundle[resource])},now()) ON CONFLICT DO NOTHING`,
            );
        await recordIssues(tx, job, issues);
        await tx.$executeRaw(
          Prisma.sql`UPDATE "DataImportRun" SET status='WARNING',stats=${JSON.stringify(stats)}::jsonb,"completedAt"=now(),"errorMessage"=NULL,"updatedAt"=now() WHERE id=${job.importRunId} AND "tenantId"=${job.tenantId}`,
        );
        if (options.history?.complete) {
          const through = options.history.to;
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO "SyncCursor" (id,"tenantId","sourceId",resource,checkpoint,"lastSuccessfulRunId","updatedAt") VALUES (${randomUUID()},${job.tenantId},${job.sourceId},'orders',${JSON.stringify({ through })}::jsonb,${job.importRunId},now()) ON CONFLICT ("tenantId","sourceId",resource) DO UPDATE SET checkpoint=EXCLUDED.checkpoint,"lastSuccessfulRunId"=EXCLUDED."lastSuccessfulRunId","updatedAt"=now() WHERE ("SyncCursor".checkpoint->>'through')::timestamptz<=${through}::timestamptz`,
          );
        }
        if (options.receiptHistory?.complete) {
          const through = options.receiptHistory.to;
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO "SyncCursor" (id,"tenantId","sourceId",resource,checkpoint,"lastSuccessfulRunId","updatedAt") VALUES (${randomUUID()},${job.tenantId},${job.sourceId},'receipts',${JSON.stringify({ through, policyHash: payloadHash(receiptsPolicy) })}::jsonb,${job.importRunId},now()) ON CONFLICT ("tenantId","sourceId",resource) DO UPDATE SET checkpoint=EXCLUDED.checkpoint,"lastSuccessfulRunId"=EXCLUDED."lastSuccessfulRunId","updatedAt"=now() WHERE ("SyncCursor".checkpoint->>'through')::timestamptz<=${through}::timestamptz`,
          );
        }
        await tx.$executeRaw(
          Prisma.sql`UPDATE "ConnectorSyncJob" SET state='COMPLETE',stats=${JSON.stringify(stats)}::jsonb,checkpoint=checkpoint||${JSON.stringify({ policy, policyHash: payloadHash(receiptsPolicy), receiptBaseline: options.receiptBaseline === true, receiptHistoryComplete: options.receiptHistory?.complete === true })}::jsonb,"errorCode"=NULL,"leaseToken"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=now() WHERE id=${job.id}`,
        );
        await tx.$executeRaw(
          Prisma.sql`UPDATE "DataSource" SET "activeImportRunId"=${job.importRunId},"updatedAt"=now() WHERE id=${job.sourceId} AND "tenantId"=${job.tenantId}`,
        );
        await tx.$executeRaw(
          Prisma.sql`UPDATE "CsvImport" SET state='ACTIVE',"activatedAt"=now() WHERE id=${upload.id} AND "tenantId"=${job.tenantId}`,
        );
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId",action,"entityType","entityId","idempotencyKey",context) VALUES (${randomUUID()},${job.tenantId},${job.checkpoint.activationActorId},'CSV_ACTIVATED','CSV_IMPORT',${upload.id},${`CSV_ACTIVATED:${upload.id}`},${JSON.stringify({ hash: upload.contentHash, jobId: job.id })}::jsonb) ON CONFLICT DO NOTHING`,
        );
        await completeConnectorInputs(tx, job);
      },
      { timeout: 45000, maxWait: 5000 },
    );
  } catch (error) {
    await failConnectorJob(
      job,
      error instanceof ConnectorSourceError
        ? new Error("CONNECTOR_CONFIG_CHANGED")
        : error,
      db,
    );
  }
  return { processed: true };
}
