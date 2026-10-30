import { selectedConnection } from "./source";
import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateSkuDaily } from "@/lib/sku-daily-store";
import { getSalesReport } from "@/lib/sales-report";
import { logInfo } from "@/lib/observability";
import type { SqlDatabase } from "./database";

const engines = { daily: calculateSkuDaily, sales: getSalesReport };
type Intent = {
  importRunId: string;
  tenantId: string;
  sourceId: string;
  state: string;
  inputProvenance: Record<string, unknown>;
};
export async function processConnectorRecalculation(
  tenantId?: string,
  db: SqlDatabase = prisma,
  calculate = engines,
) {
  const token = randomUUID();
  const intent = await db.$transaction(async (tx) => {
    let [source] = await tx.$queryRaw<
      Array<{ tenantId: string; sourceId: string; nativeRunId?: string }>
    >(Prisma.sql`
      SELECT c."tenantId",c."sourceId" FROM "ConnectorConnection" c
      WHERE ${selectedConnection()} AND (${tenantId ?? null}::text IS NULL OR c."tenantId"=${tenantId ?? null})
      AND NOT EXISTS(SELECT 1 FROM "ConnectorSyncJob" j WHERE j."tenantId"=c."tenantId" AND j."sourceId"=c."sourceId" AND j.state NOT IN ('COMPLETE','CANCELLED'))
      AND NOT EXISTS(SELECT 1 FROM "ConnectorRecalculation" r WHERE r."tenantId"=c."tenantId" AND r."sourceId"=c."sourceId" AND r.state='RUNNING' AND (r."inputProvenance"->>'leaseUntil')::timestamptz>now())
      AND EXISTS(SELECT 1 FROM "ConnectorRecalculation" r WHERE r."tenantId"=c."tenantId" AND r."sourceId"=c."sourceId" AND r.state<>'COMPLETE' AND (r.state='WAITING_ENGINE' OR COALESCE((r."inputProvenance"->>'availableAt')::timestamptz,'-infinity'::timestamptz)<=now()))
      ORDER BY (SELECT min(r."requestedAt") FROM "ConnectorRecalculation" r WHERE r."tenantId"=c."tenantId" AND r."sourceId"=c."sourceId" AND r.state<>'COMPLETE'),c.id LIMIT 1 FOR UPDATE OF c SKIP LOCKED`);
    if (!source)
      [source] = await tx.$queryRaw<
        Array<{ tenantId: string; sourceId: string; nativeRunId: string }>
      >(Prisma.sql`
      SELECT s."tenantId",s.id "sourceId",s."activeImportRunId" "nativeRunId" FROM "DataSource" s
      WHERE s.kind='GOOGLE_SHEETS' AND EXISTS(SELECT 1 FROM "ConnectorSelection" x WHERE x."tenantId"=s."tenantId" AND x."sourceId"=s.id)
      AND (${tenantId ?? null}::text IS NULL OR s."tenantId"=${tenantId ?? null})
      AND NOT EXISTS(SELECT 1 FROM "ConnectorRecalculation" r WHERE r."tenantId"=s."tenantId" AND r."sourceId"=s.id AND r.state='RUNNING' AND (r."inputProvenance"->>'leaseUntil')::timestamptz>now())
      AND EXISTS(SELECT 1 FROM "ConnectorRecalculation" r WHERE r."tenantId"=s."tenantId" AND r."sourceId"=s.id AND r."importRunId"=s."activeImportRunId" AND r.state<>'COMPLETE' AND (r.state='WAITING_ENGINE' OR COALESCE((r."inputProvenance"->>'availableAt')::timestamptz,'-infinity'::timestamptz)<=now()))
      ORDER BY s.id LIMIT 1 FOR UPDATE OF s SKIP LOCKED`);
    if (!source) return null;
    const [liveLease] = await tx.$queryRaw<
      Array<{ importRunId: string }>
    >(Prisma.sql`
      SELECT "importRunId" FROM "ConnectorRecalculation"
      WHERE "tenantId"=${source.tenantId} AND "sourceId"=${source.sourceId}
      AND state='RUNNING' AND ("inputProvenance"->>'leaseUntil')::timestamptz>now()
      LIMIT 1`);
    if (liveLease) return null;
    const [row] = await tx.$queryRaw<Intent[]>(Prisma.sql`
      SELECT "importRunId","tenantId","sourceId",state,"inputProvenance" FROM "ConnectorRecalculation"
      WHERE "tenantId"=${source.tenantId} AND "sourceId"=${source.sourceId} AND state<>'COMPLETE'
      AND (${source.nativeRunId ?? null}::text IS NULL OR "importRunId"=${source.nativeRunId ?? null})
      AND (state='WAITING_ENGINE' OR COALESCE(("inputProvenance"->>'availableAt')::timestamptz,'-infinity'::timestamptz)<=now())
      AND (state<>'RUNNING' OR COALESCE(("inputProvenance"->>'leaseUntil')::timestamptz,'-infinity'::timestamptz)<=now())
      ORDER BY (state='RUNNING') DESC,"requestedAt","importRunId" LIMIT 1 FOR UPDATE`);
    if (!row) return null;
    await tx.$executeRaw(
      Prisma.sql`UPDATE "ConnectorRecalculation" SET state='RUNNING',"inputProvenance"="inputProvenance"||jsonb_build_object('leaseToken',${token}::text,'leaseUntil',now()+interval '2 minutes','phase',${row.state === "WAITING_ENGINE" ? "DAILY" : row.inputProvenance.phase === "SALES" ? "SALES" : "DAILY"}::text) WHERE "importRunId"=${row.importRunId} AND "tenantId"=${row.tenantId}`,
    );
    return row;
  });
  if (!intent) return { processed: false };
  const phase =
    intent.state !== "WAITING_ENGINE" &&
    intent.inputProvenance.phase === "SALES"
      ? "SALES"
      : "DAILY";
  try {
    const publication =
      phase === "DAILY"
        ? {
            phase: "SALES",
            dailyCalculationId: (await calculate.daily(intent.tenantId, {}, db))
              .calculationId,
          }
        : {
            phase: "DONE",
            salesCalculationId: (await calculate.sales(intent.tenantId, {}, db))
              .calculationRunId,
          };
    const updated = await db.$executeRaw(Prisma.sql`
      UPDATE "ConnectorRecalculation" SET state=${phase === "DAILY" ? "PENDING" : "COMPLETE"},
      "inputProvenance"=("inputProvenance"-'leaseToken'-'leaseUntil'-'availableAt'-'errorCode')||${JSON.stringify(publication)}::jsonb||jsonb_build_object('engine','salesdrive-v2','phaseCompletedAt',now(),'inputConsistency','separate-immutable-phase-calculations')
      WHERE "importRunId"=${intent.importRunId} AND "tenantId"=${intent.tenantId} AND state='RUNNING' AND "inputProvenance"->>'leaseToken'=${token} AND (EXISTS(SELECT 1 FROM "ConnectorConnection" c WHERE c."tenantId"=${intent.tenantId} AND c."sourceId"=${intent.sourceId} AND ${selectedConnection()}) OR EXISTS(SELECT 1 FROM "DataSource" s JOIN "ConnectorSelection" x ON x."tenantId"=s."tenantId" AND x."sourceId"=s.id WHERE s.kind='GOOGLE_SHEETS' AND s."tenantId"=${intent.tenantId} AND s.id=${intent.sourceId} AND s."activeImportRunId"=${intent.importRunId}))`);
    return { processed: true, phase, published: updated === 1 };
  } catch (error) {
    const errorCode =
      error instanceof Error
        ? "code" in error && typeof error.code === "string"
          ? error.code
          : error.name
        : "RECALCULATION_UNAVAILABLE";
    logInfo("connector.recalculation.failed", {
      phase,
      importRunId: intent.importRunId,
      errorCode,
    });
    await db.$executeRaw(
      Prisma.sql`UPDATE "ConnectorRecalculation" SET state='FAILED',"inputProvenance"=("inputProvenance"-'leaseToken'-'leaseUntil')||jsonb_build_object('availableAt',now()+interval '5 minutes','errorCode','RECALCULATION_UNAVAILABLE') WHERE "importRunId"=${intent.importRunId} AND "tenantId"=${intent.tenantId} AND state='RUNNING' AND "inputProvenance"->>'leaseToken'=${token}`,
    );
    return { processed: true, phase, published: false };
  }
}
