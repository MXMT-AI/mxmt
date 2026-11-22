import "server-only";
import { Prisma } from "@prisma/client";
import type { SqlClient } from "../database";
import { CsvStoreError } from "./store";

type ImportScope = { tenantId: string; sourceId: string; importRunId: string };

const sourceTables = [
  "OrderLine", "OrderImportState", "Receipt", "InventorySnapshot", "PriceHistory", "DataSourceRecord",
] as const;

export async function removeSupersededCsvInputs(
  tx: SqlClient,
  { tenantId, sourceId, importRunId }: ImportScope,
  businessDate: string,
) {
  const [latest] = await tx.$queryRaw<Array<{ date: string | null }>>(Prisma.sql`
    SELECT max("snapshotDate")::text AS date FROM "InventorySnapshot"
    WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId}
  `);
  if (latest?.date && latest.date >= businessDate)
    throw new CsvStoreError("CSV_REPLACEMENT_REQUIRES_NEWER_DATE");

  const previous = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "DataImportRun"
    WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND id<>${importRunId}
      AND status IN ('SUCCESS','WARNING')
      AND stats->>'publishedAgentInput' IS DISTINCT FROM 'true'
  `);
  if (!previous.length) return [];

  const ids = Prisma.join(previous.map(({ id }) => id));
  const [busy] = await tx.$queryRaw<Array<{ exists: number }>>(Prisma.sql`
    SELECT 1 FROM "ConnectorRecalculation"
    WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND "importRunId" IN (${ids})
      AND state='RUNNING' AND ("inputProvenance"->>'leaseUntil')::timestamptz>now()
    UNION ALL
    SELECT 1 FROM "ConnectorSyncJob"
    WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND "importRunId" IN (${ids})
      AND state NOT IN ('COMPLETE','CANCELLED')
    LIMIT 1
  `);
  if (busy) throw new CsvStoreError("CSV_REPLACEMENT_BUSY");

  for (const table of sourceTables) {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM ${Prisma.raw('"' + table + '"')}
      WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND "importRunId" IN (${ids})
    `);
  }
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM "SyncCursor"
    WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND "lastSuccessfulRunId" IN (${ids})
  `);
  return previous.map(({ id }) => id);
}

export async function removeSupersededCsvRuns(
  tx: SqlClient,
  { tenantId, sourceId }: ImportScope,
  previousRunIds: string[],
) {
  if (!previousRunIds.length) return;
  const ids = Prisma.join(previousRunIds);
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM "ConnectorSyncCycle" c USING "ConnectorSyncJob" j
    WHERE c."tenantId"=${tenantId} AND c."sourceId"=${sourceId}
      AND j."tenantId"=c."tenantId" AND j."sourceId"=c."sourceId" AND j."importRunId" IN (${ids})
      AND (c."ordersJobId"=j.id OR c."inventoryJobId"=j.id)
  `);
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM "ConnectorSyncJob"
    WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND "importRunId" IN (${ids})
  `);
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM "DataImportRun"
    WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND id IN (${ids})
  `);
}
