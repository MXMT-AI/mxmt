import "server-only";
import { Prisma } from "@prisma/client";
import type { SqlClient } from "./database";

export async function readOrderHistory(
  tenantId: string,
  sourceId: string,
  tx: SqlClient,
) {
  const windows = await tx.$queryRaw<Array<{ from: string; to: string }>>(
    Prisma.sql`WITH verified AS (
      SELECT tstzrange(COALESCE(j.checkpoint->>'coverageFrom',j.checkpoint->>'from')::timestamptz,COALESCE(j.checkpoint->>'coverageTo',j.checkpoint->>'to')::timestamptz,'[]') span
      FROM "ConnectorSyncJob" j JOIN "DataImportRun" r ON r.id=j."importRunId" AND r."tenantId"=j."tenantId"
      JOIN "ConnectorConnection" c ON c."tenantId"=j."tenantId" AND c."sourceId"=j."sourceId"
      WHERE j."tenantId"=${tenantId} AND j."sourceId"=${sourceId} AND j.resource IN ('orders','csv') AND j.state='COMPLETE' AND r.status IN ('SUCCESS','WARNING')
      AND ((c.provider='salesdrive' AND j.mode='BACKFILL' AND j.checkpoint->>'historyComplete' IS DISTINCT FROM 'false')
        OR (c.provider<>'salesdrive' AND j.mode IN ('BACKFILL','INCREMENTAL','CSV') AND j.checkpoint->>'historyComplete'='true'))
      AND COALESCE(j.checkpoint->>'coverageFrom',j.checkpoint->>'from') IS NOT NULL
      AND COALESCE(j.checkpoint->>'coverageTo',j.checkpoint->>'to') IS NOT NULL
    ) SELECT to_char(lower(span) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "from",
      to_char(upper(span) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "to"
      FROM (SELECT unnest(range_agg(span)) span FROM verified) merged
      ORDER BY lower(span) LIMIT 1001`,
  );
  const [cursor] = await tx.$queryRaw<
    Array<{ through: string | null; coverageThrough: string | null }>
  >(
    Prisma.sql`SELECT s.checkpoint->>'through' through,
      CASE WHEN c.provider='salesdrive' THEN s.checkpoint->>'through' ELSE NULL END "coverageThrough"
      FROM "SyncCursor" s JOIN "ConnectorConnection" c ON c."tenantId"=s."tenantId" AND c."sourceId"=s."sourceId"
      WHERE s."tenantId"=${tenantId} AND s."sourceId"=${sourceId} AND s.resource='orders'`,
  );
  return { windows, cursor };
}
