import "server-only";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import type { SqlClient, SqlDatabase } from "./connectors/database";
import { withCalculationSnapshot } from "./calculation-snapshot";
import { payloadHash } from "./connectors/order-storage";
import { isRecord } from "./api-contracts";
import { parseRepricingRequest } from "./repricing";
import { parseReorderingRequest } from "./reorder-calc";
import { calculateRepricingInSnapshot } from "./repricing-store";
import { calculateReorderingInSnapshot } from "./reordering-store";
import {
  repricingCsv,
  reorderingCsv,
  ScenarioExportError,
  type CsvFile,
} from "./scenario-csv";
import {
  SCENARIO_EXPORT_VERSION,
  type ExportKind,
  type ScenarioExportReceipt,
} from "./scenario-export-contract";
export { ScenarioExportError } from "./scenario-csv";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface StoredExport {
  receipt: ScenarioExportReceipt;
  files: CsvFile[];
  rows: unknown[];
  totals: unknown;
}
interface ExportRecord {
  actorId: string;
  context: { kind: string; requestHash: string };
  after: StoredExport;
}
/** Parse only scenario intent and expected preview identity; all exported values are recalculated on the server. */
export function parseScenarioExport(value: unknown) {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (k) =>
        !["exportId", "kind", "previewId", "scenario", "target"].includes(k),
    ) ||
    typeof value.exportId !== "string" ||
    !uuid.test(value.exportId) ||
    typeof value.kind !== "string" ||
    !["reprice", "reorder"].includes(value.kind) ||
    typeof value.previewId !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.previewId)
  )
    throw new ScenarioExportError("INVALID_EXPORT_REQUEST");
  const kind = value.kind as ExportKind;
  let target: { supplierId: string; currency: string } | undefined;
  if (value.target !== undefined) {
    const t = value.target;
    if (
      kind !== "reorder" ||
      !isRecord(t) ||
      Object.keys(t).some((k) => !["supplierId", "currency"].includes(k)) ||
      typeof t.supplierId !== "string" ||
      !t.supplierId.trim() ||
      t.supplierId !== t.supplierId.trim() ||
      t.supplierId.length > 200 ||
      /[\u0000-\u001f]/.test(t.supplierId) ||
      typeof t.currency !== "string" ||
      !/^[A-Z]{3}$/.test(t.currency)
    )
      throw new ScenarioExportError("INVALID_EXPORT_TARGET");
    target = { supplierId: t.supplierId, currency: t.currency };
  }
  const parsed =
    kind === "reprice"
      ? parseRepricingRequest(value.scenario)
      : parseReorderingRequest(value.scenario);
  const scenario = { ...parsed, page: 1, pageSize: 25 };
  return {
    exportId: value.exportId.toLowerCase(),
    kind,
    previewId: value.previewId,
    scenario,
    ...(target ? { target } : {}),
  };
}
/** Scope idempotency by tenant; another actor cannot reuse an export ID to obtain a conflicting audit attribution. */
async function readExport(tenantId: string, exportId: string, tx: SqlClient) {
  const [row] = await tx.$queryRaw<ExportRecord[]>(
    Prisma.sql`SELECT "actorId",context,after FROM "MerchandisingAction" WHERE "tenantId"=${tenantId} AND "idempotencyKey"=${`export:${exportId}`} AND "entityType"='SCENARIO_EXPORT' AND context->>'kind'='SCENARIO_EXPORT_V1'`,
  );
  return row ?? null;
}
/** Publish generated files and the actor/scenario audit as one atomic, retry-safe database operation. */
export async function createScenarioExport(
  tenantId: string,
  actorId: string,
  value: unknown,
  db: SqlDatabase = prisma,
  now = new Date(),
) {
  const command = parseScenarioExport(value),
    requestHash = payloadHash(command);
  return withCalculationSnapshot(db, async (tx) => {
    // Serialize new financial actions with source selection before establishing their snapshot.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR SHARE`);
    const existing = await readExport(tenantId, command.exportId, tx);
    if (existing) {
      if (
        existing.actorId !== actorId ||
        existing.context.requestHash !== requestHash
      )
        throw new ScenarioExportError("EXPORT_ID_CONFLICT", 409);
      return existing.after.receipt;
    }
    const [actor] = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM "User" WHERE id=${actorId} AND "tenantId"=${tenantId}`,
    );
    if (!actor) throw new ScenarioExportError("EXPORT_ACTOR_UNAVAILABLE", 403);
    const result =
      command.kind === "reprice"
        ? await calculateRepricingInSnapshot(
            tenantId,
            parseRepricingRequest(command.scenario),
            tx,
          )
        : await calculateReorderingInSnapshot(
            tenantId,
            parseReorderingRequest(command.scenario),
            tx,
          );
    if (result.previewId !== command.previewId)
      throw new ScenarioExportError("EXPORT_PREVIEW_MISMATCH", 409);
    const built =
      command.kind === "reprice"
        ? repricingCsv(
            result as Parameters<typeof repricingCsv>[0],
            command.exportId,
          )
        : reorderingCsv(
            result as Parameters<typeof reorderingCsv>[0],
            command.exportId,
            command.target,
          );
    if (built.files.reduce((n, f) => n + f.byteLength, 0) > 4 * 1024 * 1024)
      throw new ScenarioExportError("EXPORT_SIZE_LIMIT", 422);
    const actionId = randomUUID(),
      receipt: ScenarioExportReceipt = {
        exportId: command.exportId,
        actionId,
        kind: command.kind,
        previewId: result.previewId,
        createdAt: now.toISOString(),
        actorId,
        files: built.files.map(({ content: _, ...file }) => ({
          ...file,
          url: `/api/merchandising/exports/${command.exportId}?fileId=${file.id}`,
        })),
      };
    // Keep receipts and ten-entry history responses within the hosting response limit.
    if (Buffer.byteLength(JSON.stringify(receipt), "utf8") > 256 * 1024)
      throw new ScenarioExportError("EXPORT_METADATA_SIZE_LIMIT", 422);
    const after: StoredExport = {
      receipt,
      files: built.files,
      rows: built.rows,
      totals: built.totals,
    };
    const context = {
      kind: "SCENARIO_EXPORT_V1",
      schemaVersion: SCENARIO_EXPORT_VERSION,
      requestHash,
      request: command,
      dataVersion: {
        snapshotId: result.snapshotId,
        calculationVersion: result.calculationVersion,
        ...("inputSetId" in result ? { inputSetId: result.inputSetId } : {}),
        context: result.context,
      },
    };
    if (
      Buffer.byteLength(JSON.stringify({ after, context }), "utf8") >
      16 * 1024 * 1024
    )
      throw new ScenarioExportError("EXPORT_AUDIT_SIZE_LIMIT", 422);
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context,"createdAt") VALUES (${actionId},${tenantId},${actorId},${result.snapshotId},${command.kind},'SCENARIO_EXPORT',${command.exportId},${`export:${command.exportId}`},${JSON.stringify(after)}::jsonb,${JSON.stringify(context)}::jsonb,${now.toISOString()}::timestamptz) ON CONFLICT ("tenantId","idempotencyKey") DO NOTHING`,
    );
    const published = await readExport(tenantId, command.exportId, tx);
    if (!published)
      throw new ScenarioExportError("EXPORT_PUBLICATION_FAILED", 503);
    if (
      published.actorId !== actorId ||
      published.context.requestHash !== requestHash
    )
      throw new ScenarioExportError("EXPORT_ID_CONFLICT", 409);
    return published.after.receipt;
  });
}
/** Replay stored bytes, not newly calculated prices or mutable source data. */
export async function readScenarioExportFile(
  tenantId: string,
  exportId: string,
  fileId: string,
  db: SqlClient = prisma,
) {
  if (!uuid.test(exportId) || !/^[a-f0-9]{24}$/.test(fileId))
    throw new ScenarioExportError("EXPORT_NOT_FOUND", 404);
  const row = await readExport(tenantId, exportId.toLowerCase(), db),
    file = row?.after.files.find((f) => f.id === fileId);
  if (!file) throw new ScenarioExportError("EXPORT_NOT_FOUND", 404);
  return file;
}
/** Return bounded audit metadata without exposing CSV bodies, full rows or other tenants' actions. */
export async function readScenarioExportHistory(
  tenantId: string,
  kind: ExportKind,
  db: SqlClient = prisma,
) {
  if (!["reprice", "reorder"].includes(kind))
    throw new ScenarioExportError("INVALID_EXPORT_KIND");
  const rows = await db.$queryRaw<Array<{ receipt: ScenarioExportReceipt }>>(
    Prisma.sql`SELECT after->'receipt' receipt FROM "MerchandisingAction" WHERE "tenantId"=${tenantId} AND "entityType"='SCENARIO_EXPORT' AND action=${kind} AND context->>'kind'='SCENARIO_EXPORT_V1' ORDER BY "createdAt" DESC,id DESC LIMIT 10`,
  );
  return { rows: rows.map((r) => r.receipt) };
}
