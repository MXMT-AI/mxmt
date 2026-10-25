import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateSkuDaily } from "@/lib/sku-daily-store";
import { getSalesReport } from "@/lib/sales-report";
import type { SqlDatabase } from "./database";

const engines = { daily: calculateSkuDaily, sales: getSalesReport };
type Intent = {
  importRunId: string;
  tenantId: string;
  sourceId: string;
  state: string;
  inputProvenance: Record<string, unknown>;
};
/** One local calculation per tick, separate from remote import work (Hobby's 60-second budget).
 * Each phase is independently immutable; these two result IDs are not one financial/stock snapshot.
 */
export async function processConnectorRecalculation(
  tenantId?: string,
  db: SqlDatabase = prisma,
  calculate = engines,
) {
  const token = randomUUID();
  const intent = await db.$transaction(async (tx) => {
    // Serialize claims for a source, without holding a lock during the calculation.
    const [source] = await tx.$queryRaw<
      Array<{ tenantId: string; sourceId: string }>
    >(Prisma.sql`
      SELECT c."tenantId",c."sourceId" FROM "ConnectorConnection" c
      WHERE c.provider='salesdrive' AND (${tenantId ?? null}::text IS NULL OR c."tenantId"=${tenantId ?? null})
      AND NOT EXISTS(SELECT 1 FROM "ConnectorSyncJob" j WHERE j."tenantId"=c."tenantId" AND j."sourceId"=c."sourceId" AND j.state<>'COMPLETE')
      AND NOT EXISTS(SELECT 1 FROM "ConnectorRecalculation" r WHERE r."tenantId"=c."tenantId" AND r."sourceId"=c."sourceId" AND r.state='RUNNING' AND (r."inputProvenance"->>'leaseUntil')::timestamptz>now())
      AND EXISTS(SELECT 1 FROM "ConnectorRecalculation" r WHERE r."tenantId"=c."tenantId" AND r."sourceId"=c."sourceId" AND r.state<>'COMPLETE' AND (r.state='WAITING_ENGINE' OR COALESCE((r."inputProvenance"->>'availableAt')::timestamptz,'-infinity'::timestamptz)<=now()))
      ORDER BY (SELECT min(r."requestedAt") FROM "ConnectorRecalculation" r WHERE r."tenantId"=c."tenantId" AND r."sourceId"=c."sourceId" AND r.state<>'COMPLETE'),c.id LIMIT 1 FOR UPDATE OF c SKIP LOCKED`);
    if (!source) return null;
    const [row] = await tx.$queryRaw<Intent[]>(Prisma.sql`
      SELECT "importRunId","tenantId","sourceId",state,"inputProvenance" FROM "ConnectorRecalculation"
      WHERE "tenantId"=${source.tenantId} AND "sourceId"=${source.sourceId} AND state<>'COMPLETE'
      AND (state='WAITING_ENGINE' OR COALESCE(("inputProvenance"->>'availableAt')::timestamptz,'-infinity'::timestamptz)<=now())
      ORDER BY (state='RUNNING') DESC,"requestedAt","importRunId" LIMIT 1 FOR UPDATE`);
    if (!row) return null;
    await tx.$executeRaw(
      Prisma.sql`UPDATE "ConnectorRecalculation" SET state='RUNNING',"inputProvenance"="inputProvenance"||jsonb_build_object('leaseToken',${token}::text,'leaseUntil',now()+interval '2 minutes','phase',${row.state === "WAITING_ENGINE" ? "DAILY" : row.inputProvenance.phase === "SALES" ? "SALES" : "DAILY"}::text) WHERE "importRunId"=${row.importRunId} AND "tenantId"=${row.tenantId}`,
    );
    return row;
  });
  if (!intent) return { processed: false };
  // A settings/metadata edit resets state to WAITING_ENGINE and therefore restarts daily inputs.
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
      WHERE "importRunId"=${intent.importRunId} AND "tenantId"=${intent.tenantId} AND state='RUNNING' AND "inputProvenance"->>'leaseToken'=${token}`);
    return { processed: true, phase, published: updated === 1 };
  } catch {
    await db.$executeRaw(
      Prisma.sql`UPDATE "ConnectorRecalculation" SET state='FAILED',"inputProvenance"=("inputProvenance"-'leaseToken'-'leaseUntil')||jsonb_build_object('availableAt',now()+interval '5 minutes','errorCode','RECALCULATION_UNAVAILABLE') WHERE "importRunId"=${intent.importRunId} AND "tenantId"=${intent.tenantId} AND state='RUNNING' AND "inputProvenance"->>'leaseToken'=${token}`,
    );
    return { processed: true, phase, published: false };
  }
}
