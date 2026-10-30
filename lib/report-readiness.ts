import { Prisma } from "@prisma/client";
import type { SqlClient } from "./connectors/database";
import type { ScreenSnapshot } from "./merchandising-snapshot";

/** Aggregate evidence from the pinned source snapshot; display filters do not change these diagnostics. */
export async function readReportReadiness(tenantId: string, snapshot: ScreenSnapshot, tx: SqlClient) {
  const [result] = await tx.$queryRaw<Array<{
    total: number; missingStock: number; missingReceipt: number; missingVelocity: number;
    unknownOwnership: number; unknownKind: number; unclassified: number;
  }>>(Prisma.sql`SELECT count(*)::int total,
    count(*) FILTER(WHERE d.quantity IS NULL)::int "missingStock",
    count(*) FILTER(WHERE COALESCE(d.metrics->'classificationErrors','[]'::jsonb) ? 'RECEIPT_HISTORY_UNVERIFIED')::int "missingReceipt",
    count(*) FILTER(WHERE COALESCE(d.metrics->'classificationErrors','[]'::jsonb) ? 'VELOCITY_UNAVAILABLE')::int "missingVelocity",
    count(*) FILTER(WHERE d.metrics->>'productKind'='MERCHANDISE' AND d.metrics->>'ownership'='UNKNOWN')::int "unknownOwnership",
    count(*) FILTER(WHERE d.metrics->>'productKind'='UNKNOWN')::int "unknownKind",
    count(*) FILTER(WHERE d.classification='DATA_ERROR')::int unclassified
    FROM "MerchandisingScreenSku" s JOIN "SkuDaily" d ON d.id=s."dailyId" AND d."tenantId"=s."tenantId" AND d."skuId"=s."skuId"
    WHERE s."tenantId"=${tenantId} AND s."snapshotId"=${snapshot.snapshotId}`);
  return { scope: "SOURCE_SNAPSHOT" as const, ...result };
}
