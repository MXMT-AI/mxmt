import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { SqlClient } from "./connectors/database";
/** Bounded current-source import warnings with explicitly allowlisted lineage, never raw customer payloads. */
export async function getSalesDriveIssues(
  tenantId: string,
  options: {
    page: number;
    pageSize: number;
    code?: string;
    severity?: string;
    importRunId?: string;
    skuId?: string;
  },
  db: SqlClient = prisma,
) {
  const where = Prisma.sql`q."tenantId"=${tenantId} AND (${options.code ?? null}::text IS NULL OR q.code=${options.code ?? null}) AND (${options.severity ?? null}::text IS NULL OR q.severity::text=${options.severity ?? null}) AND (${options.importRunId ?? null}::text IS NULL OR q."importRunId"=${options.importRunId ?? null}) AND (${options.skuId ?? null}::text IS NULL OR q.context->>'skuId'=${options.skuId ?? null})
 AND (q.code<>'SKU_ALIAS_UNRESOLVED' OR EXISTS (SELECT 1 FROM "OrderLine" l WHERE l."tenantId"=q."tenantId" AND l."importRunId"=q."importRunId" AND l."sourceId"=r."sourceId" AND l."eventKey"='current' AND l."skuId" IS NULL AND q."entityKey"='order:'||l."externalOrderId"||':'||l."externalLineId"))`;
  const from = Prisma.sql`FROM "ImportIssue" q JOIN "DataImportRun" r ON r.id=q."importRunId" AND r."tenantId"=q."tenantId" JOIN "ConnectorConnection" c ON c."tenantId"=r."tenantId" AND c."sourceId"=r."sourceId" AND c.provider='salesdrive' WHERE ${where}`;
  const [rows, total] = await Promise.all([
    db.$queryRaw<
      Array<{
        id: string;
        code: string;
        severity: string;
        importRunId: string;
        createdAt: Date;
        sourceId: string;
        entityKey: string | null;
        rowNumber: number | null;
        sheetKey: string | null;
        context: Record<string, string | null>;
      }>
    >(
      Prisma.sql`SELECT q.id,q.code,q.severity,q."importRunId",q."createdAt",r."sourceId",q."entityKey",q."rowNumber",q."sheetKey",jsonb_strip_nulls(jsonb_build_object('skuId',q.context->>'skuId','sku',q.context->>'sku','sourceSku',q.context->>'sourceSku','orderId',q.context->>'orderId','lineId',q.context->>'lineId','sourceRecordKey',q.context->>'sourceRecordKey')) context ${from} ORDER BY q."createdAt" DESC,q.id LIMIT ${options.pageSize} OFFSET ${(options.page - 1) * options.pageSize}`,
    ),
    db.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`SELECT count(*)::int count ${from}`,
    ),
  ]);
  return {
    rows,
    pagination: {
      page: options.page,
      pageSize: options.pageSize,
      totalRows: total[0].count,
      totalPages: Math.ceil(total[0].count / options.pageSize),
    },
    scope: "CURRENT_SALESDRIVE_SOURCE_IMPORT_HISTORY",
  };
}
