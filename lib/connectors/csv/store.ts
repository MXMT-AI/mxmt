import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SqlClient, SqlDatabase } from "../database";
import { encryptCredentials } from "../secrets";
import { CsvConnector } from "./adapter";
import { compileCsv, parseCsvOptions, type CsvPreview } from "./compile";
import { payloadHash } from "../order-storage";
import { retainRecord } from "../receipt-storage";
import { CsvError } from "./parser";
import { readSelectedSource } from "../source";
import type { CsvFileInput, CsvOptions } from "./schema";
export class CsvStoreError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
    this.name = "CsvStoreError";
  }
}
export interface CsvImportRow {
  id: string;
  tenantId: string;
  sourceId: string;
  importRunId: string;
  contentHash: string;
  options: CsvOptions;
  preview: CsvPreview;
  context: { revision: number; settingsHash: string; actorId: string };
  state: string;
  expiresAt: Date;
  createdAt: Date;
  activatedAt: Date | null;
}
export async function csvSettingsHash(tx: SqlClient, tenantId: string) {
  return payloadHash(
    await tx.$queryRaw(
      Prisma.sql`SELECT id,revision FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "isActive" AND "approvedAt" IS NOT NULL AND ("configType"<>'GENERAL' OR key LIKE 'settings:%') ORDER BY id`,
    ),
  );
}
async function audit(
  tx: SqlClient,
  tenantId: string,
  actorId: string,
  uploadId: string,
  action: string,
  hash: string,
) {
  await tx.$executeRaw(
    Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId",action,"entityType","entityId","idempotencyKey",context) VALUES (${randomUUID()},${tenantId},${actorId},${action},'CSV_IMPORT',${uploadId},${`${action}:${uploadId}`},${JSON.stringify({ hash })}::jsonb) ON CONFLICT ("tenantId","idempotencyKey") DO NOTHING`,
  );
}
export async function csvSource(tenantId: string, db: SqlClient = prisma) {
  const [row] = await db.$queryRaw<
    Array<{ sourceId: string; timezone: string }>
  >(
    Prisma.sql`SELECT c."sourceId",s.timezone FROM "ConnectorConnection" c JOIN "DataSource" s ON s.id=c."sourceId" AND s."tenantId"=c."tenantId" WHERE c."tenantId"=${tenantId} AND c.provider='csv'`,
  );
  return row ?? null;
}
export async function listCsvImports(tenantId: string, db: SqlClient = prisma) {
  const [source, uploads, suppliers] = await Promise.all([
    csvSource(tenantId, db),
    db.$queryRaw(
      Prisma.sql`SELECT id,"sourceId","contentHash",preview,state,"createdAt","expiresAt","activatedAt" FROM "CsvImport" WHERE "tenantId"=${tenantId} ORDER BY "createdAt" DESC LIMIT 20`,
    ),
    db.$queryRaw(
      Prisma.sql`SELECT id,name FROM "Supplier" WHERE "tenantId"=${tenantId} ORDER BY name LIMIT 100`,
    ),
  ]);
  return { source, uploads, suppliers };
}
export async function readCsvImport(
  tenantId: string,
  id: string,
  db: SqlClient = prisma,
  lock = false,
) {
  const [row] = await db.$queryRaw<CsvImportRow[]>(
    Prisma.sql`SELECT * FROM "CsvImport" WHERE id=${id} AND "tenantId"=${tenantId} ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`,
  );
  if (!row) throw new CsvStoreError("CSV_NOT_FOUND", 404);
  return row;
}
export async function readCsvFiles(
  row: CsvImportRow,
  tx: SqlClient,
): Promise<CsvFileInput[]> {
  const rows = await tx.$queryRaw<
    Array<{ payload: { file: CsvFileInput; sha256: string } }>
  >(
    Prisma.sql`SELECT payload FROM "DataSourceRecord" WHERE "tenantId"=${row.tenantId} AND "sourceId"=${row.sourceId} AND "importRunId"=${row.importRunId} AND resource='csv-file' ORDER BY payload->'file'->>'resource'`,
  );
  return rows.map((r) => {
    if (
      createHash("sha256")
        .update(Buffer.from(r.payload.file.bytes, "base64"))
        .digest("hex") !== r.payload.sha256
    )
      throw new CsvStoreError("CSV_HASH_CHANGED");
    return r.payload.file;
  });
}
export const csvContentHash = (options: CsvOptions, files: CsvFileInput[]) =>
  payloadHash({
    options,
    files: [...files].sort((a, b) => a.resource.localeCompare(b.resource)),
  });
/** Remove bytes of expired unactivated previews, retaining their audit/hash/diagnostics. */
export async function expireCsvPreviews(tenantId: string, tx: SqlClient) {
  await tx.$executeRaw(
    Prisma.sql`DELETE FROM "DataSourceRecord" r USING "CsvImport" u WHERE u."tenantId"=${tenantId} AND u."expiresAt"<now() AND u.state IN ('READY','INVALID','CANCELLED','EXPIRED') AND r."tenantId"=u."tenantId" AND r."importRunId"=u."importRunId" AND r.resource='csv-file'`,
  );
  await tx.$executeRaw(
    Prisma.sql`UPDATE "DataImportRun" r SET status='FAILED',"errorMessage"='CSV_EXPIRED',"completedAt"=now(),"updatedAt"=now() FROM "CsvImport" u WHERE u."tenantId"=${tenantId} AND u."expiresAt"<now() AND u.state IN ('READY','INVALID','CANCELLED') AND r.id=u."importRunId" AND r."tenantId"=u."tenantId"`,
  );
  await tx.$executeRaw(
    Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId",action,"entityType","entityId","idempotencyKey",context) SELECT u.id||':expired',u."tenantId",'CSV_EXPIRED','CSV_IMPORT',u.id,'CSV_EXPIRED:'||u.id,jsonb_build_object('hash',u."contentHash") FROM "CsvImport" u WHERE u."tenantId"=${tenantId} AND u."expiresAt"<now() AND u.state IN ('READY','INVALID','CANCELLED') ON CONFLICT DO NOTHING`,
  );
  await tx.$executeRaw(
    Prisma.sql`UPDATE "CsvImport" SET state='EXPIRED' WHERE "tenantId"=${tenantId} AND "expiresAt"<now() AND state IN ('READY','INVALID','CANCELLED')`,
  );
}
export async function previewCsv(
  tenantId: string,
  actorId: string,
  requestedSource: string | null,
  rawOptions: unknown,
  files: unknown,
  db: SqlDatabase = prisma,
) {
  const options = parseCsvOptions(rawOptions),
    compiled = compileCsv(files, options),
    hash = csvContentHash(options, compiled.files);
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR UPDATE`,
      );
      let source = await csvSource(tenantId, tx);
      if (requestedSource !== null && requestedSource !== source?.sourceId)
        throw new CsvStoreError("CSV_NOT_FOUND", 404);
      if (source && source.timezone !== options.timezone)
        throw new CsvStoreError("CSV_TIMEZONE_IMMUTABLE");
      if (!source) {
        const sourceId = randomUUID();
        source = { sourceId, timezone: options.timezone };
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey",name,timezone,"updatedAt") VALUES (${sourceId},${tenantId},'CSV','manual','CSV upload',${options.timezone},now())`,
        );
        const connector = new CsvConnector(),
          check = await connector.checkConnection();
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId",provider,"accountHost","encryptedConfig","lastCheck",capabilities,"checkedAt","updatedAt") VALUES (${randomUUID()},${tenantId},${sourceId},'csv','CSV upload',${encryptCredentials({ timezone: options.timezone }, tenantId, "csv")},${JSON.stringify(check)}::jsonb,${JSON.stringify(connector.capabilities)}::jsonb,now(),now())`,
        );
      }
      await expireCsvPreviews(tenantId, tx);
      const [connection] = await tx.$queryRaw<Array<{ revision: number }>>(
        Prisma.sql`SELECT revision FROM "ConnectorConnection" WHERE "tenantId"=${tenantId} AND "sourceId"=${source.sourceId}`,
      );
      const context = {
        actorId,
        revision: connection.revision,
        settingsHash: await csvSettingsHash(tx, tenantId),
      };
      const [old] = await tx.$queryRaw<CsvImportRow[]>(
        Prisma.sql`SELECT * FROM "CsvImport" WHERE "tenantId"=${tenantId} AND "sourceId"=${source.sourceId} AND "contentHash"=${hash} AND state NOT IN ('CANCELLED','EXPIRED')`,
      );
      if (old) {
        if (
          ["READY", "INVALID"].includes(old.state) &&
          (old.context.settingsHash !== context.settingsHash ||
            old.context.revision !== context.revision)
        ) {
          await tx.$executeRaw(
            Prisma.sql`UPDATE "CsvImport" SET context=${JSON.stringify(context)}::jsonb,preview=${JSON.stringify(compiled.preview)}::jsonb,"expiresAt"=now()+interval '30 days' WHERE id=${old.id}`,
          );
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId",action,"entityType","entityId","idempotencyKey",context) VALUES (${randomUUID()},${tenantId},${actorId},'CSV_PREVIEW_REFRESHED','CSV_IMPORT',${old.id},${`CSV_PREVIEW_REFRESHED:${old.id}:${payloadHash(context)}`},${JSON.stringify({ hash, settingsHash: context.settingsHash })}::jsonb) ON CONFLICT DO NOTHING`,
          );
          return readCsvImport(tenantId, old.id, tx);
        }
        return old;
      }
      const [count] = await tx.$queryRaw<Array<{ n: number }>>(
        Prisma.sql`SELECT count(*)::int n FROM "CsvImport" WHERE "tenantId"=${tenantId} AND state IN ('READY','INVALID','QUEUED')`,
      );
      if (count.n >= 20) throw new CsvStoreError("CSV_PREVIEW_LIMIT", 429);
      const supplierIds = Object.values(
        options.policy.receipts?.suppliers ?? {},
      );
      if (supplierIds.length) {
        const owned = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT id FROM "Supplier" WHERE "tenantId"=${tenantId} AND id IN (SELECT jsonb_array_elements_text(${JSON.stringify(supplierIds)}::jsonb))`,
        );
        if (new Set(owned.map((s) => s.id)).size !== new Set(supplierIds).size)
          throw new CsvStoreError("CSV_SUPPLIER_NOT_FOUND", 404);
      }
      const id = randomUUID(),
        runId = randomUUID();
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","sourceChecksum","businessDate","updatedAt") VALUES (${runId},${tenantId},${source.sourceId},'MANUAL','PENDING',${`csv:${source.sourceId}:${hash}:${id}`},${hash},now(),now())`,
      );
      const scope = { tenantId, sourceId: source.sourceId, importRunId: runId };
      for (const file of compiled.files)
        await retainRecord(
          tx,
          scope,
          "csv-file",
          file.resource,
          {
            file,
            sha256: createHash("sha256")
              .update(Buffer.from(file.bytes, "base64"))
              .digest("hex"),
          },
          new Date(),
        );
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "CsvImport" (id,"tenantId","sourceId","importRunId","contentHash",options,preview,context,state) VALUES (${id},${tenantId},${source.sourceId},${runId},${hash},${JSON.stringify(options)}::jsonb,${JSON.stringify(compiled.preview)}::jsonb,${JSON.stringify(context)}::jsonb,${compiled.preview.errors.length ? "INVALID" : "READY"})`,
      );
      await audit(tx, tenantId, actorId, id, "CSV_PREVIEWED", hash);
      return readCsvImport(tenantId, id, tx);
    },
    { timeout: 45000, maxWait: 5000 },
  );
}
export async function csvImportAction(
  tenantId: string,
  actorId: string,
  id: string,
  hash: string,
  action: "activate" | "cancel" | "retry",
  db: SqlDatabase = prisma,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR UPDATE`,
    );
    const row = await readCsvImport(tenantId, id, tx, true);
    if (row.contentHash !== hash) throw new CsvStoreError("CSV_HASH_CHANGED");
    if (action === "cancel") {
      if (row.state === "ACTIVE") throw new CsvStoreError("CSV_ALREADY_ACTIVE");
      await tx.$executeRaw(
        Prisma.sql`UPDATE "ConnectorSyncJob" SET state='CANCELLED',"leaseToken"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=now() WHERE "tenantId"=${tenantId} AND "importRunId"=${row.importRunId}`,
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE "CsvImport" SET state='CANCELLED' WHERE id=${id}`,
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE "DataImportRun" SET status='FAILED',"errorMessage"='CSV_CANCELLED',"completedAt"=now(),"updatedAt"=now() WHERE id=${row.importRunId} AND "tenantId"=${tenantId}`,
      );
      await audit(tx, tenantId, actorId, id, "CSV_CANCELLED", hash);
      return { id, state: "CANCELLED" };
    }
    if (row.state === "ACTIVE") return { id, state: "ACTIVE" };
    if (row.expiresAt < new Date()) throw new CsvStoreError("CSV_EXPIRED", 410);
    if (!["READY", "QUEUED"].includes(row.state) || row.preview.errors.length)
      throw new CsvStoreError("CSV_NOT_READY");
    const selected = await readSelectedSource(tenantId, tx);
    if (selected?.id !== row.sourceId)
      throw new CsvStoreError("CSV_SELECT_SOURCE_FIRST");
    if (row.context.settingsHash !== (await csvSettingsHash(tx, tenantId)))
      throw new CsvStoreError("CSV_SETTINGS_CHANGED");
    const [connection] = await tx.$queryRaw<Array<{ revision: number }>>(
      Prisma.sql`SELECT revision FROM "ConnectorConnection" WHERE "tenantId"=${tenantId} AND "sourceId"=${row.sourceId}`,
    );
    if (connection.revision !== row.context.revision)
      throw new CsvStoreError("CSV_SETTINGS_CHANGED");
    const [job] = await tx.$queryRaw<Array<{ id: string; state: string }>>(
      Prisma.sql`SELECT id,state FROM "ConnectorSyncJob" WHERE "tenantId"=${tenantId} AND "importRunId"=${row.importRunId} FOR UPDATE`,
    );
    if (job) {
      if (
        action === "retry" &&
        ["FAILED", "PAUSED", "RETRY"].includes(job.state)
      )
        await tx.$executeRaw(
          Prisma.sql`UPDATE "ConnectorSyncJob" SET state='PENDING',attempts=0,"errorCode"=NULL,"availableAt"=now(),"updatedAt"=now() WHERE id=${job.id}`,
        );
      return { id, state: row.state, jobId: job.id };
    }
    const jobId = randomUUID(),
      checkpoint = {
        uploadId: id,
        hash,
        selectionRevision: selected.revision,
        activationActorId: actorId,
        from: row.options.history?.from ?? null,
        to: row.options.history?.to ?? null,
        coverageFrom: row.options.history?.from ?? null,
        coverageTo: row.options.history?.to ?? null,
        historyComplete: row.options.history?.complete === true,
      };
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO "ConnectorSyncJob" (id,"tenantId","sourceId","importRunId",resource,mode,"connectionRevision",checkpoint,"updatedAt") VALUES (${jobId},${tenantId},${row.sourceId},${row.importRunId},'csv','CSV',${connection.revision},${JSON.stringify(checkpoint)}::jsonb,now())`,
    );
    await tx.$executeRaw(
      Prisma.sql`UPDATE "CsvImport" SET state='QUEUED' WHERE id=${id}`,
    );
    await audit(tx, tenantId, actorId, id, "CSV_ACTIVATION_REQUESTED", hash);
    return { id, state: "QUEUED", jobId };
  });
}
