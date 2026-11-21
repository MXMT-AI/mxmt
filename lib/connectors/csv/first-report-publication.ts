import "server-only";
import { Prisma } from "@prisma/client";
import { configuredReportStorage } from "@/lib/merchandising-publication-storage";
import { publishMerchandisingReports, readReportPublication } from "@/lib/merchandising-publication";
import type { SqlDatabase } from "../database";

export async function publishFirstCsvReport(
  intent: { tenantId: string; sourceId: string; importRunId: string },
  db: SqlDatabase,
) {
  const storage = configuredReportStorage(intent.tenantId);
  if (!storage || await readReportPublication(intent.tenantId, storage)) return;

  const [selection] = await db.$queryRaw<Array<{ dateFrom: string; dateTo: string }>>(Prisma.sql`
    WITH coverage AS (
      SELECT s.id, s."tenantId", s."activeImportRunId",
        ((u.options->'history'->>'from')::timestamptz AT TIME ZONE s.timezone)::date AS first_day,
        LEAST(((u.options->'history'->>'to')::timestamptz AT TIME ZONE s.timezone)::date,
          (now() AT TIME ZONE s.timezone)::date) AS last_day
      FROM "DataSource" s
      JOIN "CsvImport" u ON u."tenantId"=s."tenantId" AND u."sourceId"=s.id
        AND u."importRunId"=s."activeImportRunId" AND u.state='ACTIVE'
      JOIN "ConnectorSelection" x ON x."tenantId"=s."tenantId" AND x."sourceId"=s.id
      WHERE s."tenantId"=${intent.tenantId} AND s.id=${intent.sourceId}
        AND s."activeImportRunId"=${intent.importRunId}
        AND u.options->'history'->>'complete'='true'
    ), candidate AS (
      SELECT c.first_day, max(i."snapshotDate") AS last_day
      FROM coverage c JOIN "InventorySnapshot" i ON i."tenantId"=c."tenantId"
        AND i."sourceId"=c.id AND i."importRunId"=c."activeImportRunId"
        AND i."snapshotDate" BETWEEN c.first_day AND c.last_day
      GROUP BY c.first_day
    )
    SELECT GREATEST(first_day, date_trunc('month',last_day)::date)::text AS "dateFrom",
      last_day::text AS "dateTo" FROM candidate
  `);
  if (selection)
    await publishMerchandisingReports(intent.tenantId, selection, storage, db, {
      firstOnly: true, expectedSourceId: intent.sourceId,
    });
}
