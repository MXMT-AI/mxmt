import "server-only";
import { sheetsOrderPolicy } from "./sheets-order-policy";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { isRecord } from "../api-contracts";
import { aiTransaction } from "../ai-execution/budget";
import type { AiPrincipal } from "../ai-execution/contracts";
import type { SqlClient, SqlDatabase } from "./database";
import { payloadHash } from "./order-storage";
import {
  mappingId,
  mappingText,
  SheetsMappingError as E,
  parseSheetsMapping,
  validateMappingColumns,
  suggestSheetsMapping,
  createMappingAnalyzer,
  sheetsSchemaHash,
} from "./sheets-mapping-validation";
import type {
  SheetsMappingInput,
  SheetsMappingMetadata,
  SheetsMappingPreview,
  SheetsFieldMapping,
} from "../sheets-mapping-contract";
export const SHEETS_MAPPING_PREVIEW_TTL_MS = 30 * 60 * 1000;
const keys = (v: Record<string, unknown>, fields: string[]) =>
  Object.keys(v).sort().join() === fields.sort().join();
interface Config {
  id: string;
  revision: number;
  values: {
    sheets: {
      version: 1;
      fileId: string;
      mapping: SheetsFieldMapping;
      schemaHash: string;
    };
  };
  approvedAt: Date | null;
  isActive: boolean;
  approvalReference: string | null;
}
async function latest(p: AiPrincipal, sourceId: string, tx: SqlClient) {
  const [row] = await tx.$queryRaw<Config[]>(
    Prisma.sql`SELECT id,revision,values,"approvedAt","isActive","approvalReference" FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND "configType"='SOURCE_MAPPING' AND key=${`sheets:${sourceId}`} ORDER BY revision DESC LIMIT 1`,
  );
  return row;
}
export async function readSheetsMappingInput(
  p: AiPrincipal,
  sourceId: string,
  tx: SqlClient,
): Promise<SheetsMappingInput> {
  const [row] = await tx.$queryRaw<
    Array<Omit<SheetsMappingInput, "sheets">>
  >(Prisma.sql`
  SELECT s.id "sourceId",s."driveFileId" "fileId",s.timezone,r.id "importRunId",r."sourceChecksum",r."createdAt" "importedAt" FROM "DataSource" s
  JOIN "DataImportRun" r ON r.id=s."activeImportRunId" AND r."tenantId"=s."tenantId" AND r."sourceId"=s.id
  WHERE s."tenantId"=${p.tenantId} AND s.id=${mappingId(sourceId)} AND s.kind='GOOGLE_SHEETS' AND r.status IN ('SUCCESS','WARNING')`);
  if (!row || !row.sourceChecksum)
    throw new E("SHEETS_RAW_IMPORT_REQUIRED", 409);
  const sheets = await tx.$queryRaw<SheetsMappingInput["sheets"]>(
    Prisma.sql`SELECT id,"sheetKey","sourceName",columns,checksum,"rowCount" FROM "DataSheetSnapshot" WHERE "tenantId"=${p.tenantId} AND "importRunId"=${row.importRunId} AND "sheetKey" IN ('product_yml','zavod_api') ORDER BY "sheetKey"`,
  );
  if (
    sheets.length !== 2 ||
    sheets.some(
      (s) =>
        !Array.isArray(s.columns) ||
        s.columns.length > 256 ||
        s.columns.some(
          (c) =>
            !c ||
            typeof c.key !== "string" ||
            typeof c.label !== "string" ||
            c.label.length > 500 ||
            !/^col_[a-z]{1,4}$/.test(c.key),
        ) ||
        s.rowCount < 0,
    ) ||
    sheets.reduce((n, s) => n + s.rowCount, 0) > 100000
  )
    throw new E("SHEETS_MAPPING_INPUT_LIMIT", 422);
  return { ...row, importedAt: new Date(row.importedAt).toISOString(), sheets };
}
async function metadata(
  p: AiPrincipal,
  sourceId: string,
  tx: SqlClient,
): Promise<SheetsMappingMetadata> {
  const input = await readSheetsMappingInput(p, sourceId, tx),
    old = await latest(p, sourceId, tx),
    suggestion = suggestSheetsMapping(input);
  const [active] = await tx.$queryRaw<Array<{ revision: number }>>(
    Prisma.sql`SELECT revision FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND "configType"='SOURCE_MAPPING' AND key=${`sheets:${sourceId}`} AND "isActive" AND "approvedAt" IS NOT NULL`,
  );
  let chosen = suggestion;
  if (
    old?.values?.sheets?.fileId === input.fileId &&
    old.values.sheets.schemaHash === sheetsSchemaHash(input)
  ) {
    try {
      chosen = parseSheetsMapping(old.values.sheets.mapping);
      validateMappingColumns(chosen, input);
    } catch {
      chosen = suggestion;
    }
  }
  const dictionary = async (sheetKey: string, column: string | null) => {
    if (!column) return [];
    const sheet = input.sheets.find((s) => s.sheetKey === sheetKey)!;
    return tx.$queryRaw<Array<{ id: string; count: number }>>(Prisma.sql`
   SELECT btrim(data->>${column}) id,count(*)::int count FROM "DataSheetRow" WHERE "tenantId"=${p.tenantId}
    AND "snapshotId"=${sheet.id} AND btrim(data->>${column}) ~ '^(0|[1-9][0-9]{0,8})$'
    GROUP BY 1 ORDER BY 1 LIMIT 101`);
  };
  const categorySheet = input.sheets.find((s) => s.sheetKey === "product_yml")!;
  const [statuses, channels, categories] = await Promise.all([
    dictionary("zavod_api", chosen.orders.statusId),
    dictionary("zavod_api", chosen.orders.channelId),
    chosen.products.category
      ? tx.$queryRaw<Array<{ name: string; count: number }>>(Prisma.sql`
    SELECT btrim(data->>${chosen.products.category}) name,count(*)::int count FROM "DataSheetRow" WHERE "tenantId"=${p.tenantId}
    AND "snapshotId"=${categorySheet.id} AND length(btrim(data->>${chosen.products.category})) BETWEEN 1 AND 200
    GROUP BY 1 ORDER BY 1 LIMIT 201`)
      : Promise.resolve([]),
  ]);
  if (statuses.length > 100 || channels.length > 100 || categories.length > 200)
    throw new E("SHEETS_MAPPING_DICTIONARY_LIMIT", 422);
  for (const status of statuses)
    if (!Object.hasOwn(chosen.policy.statuses, status.id))
      chosen.policy.statuses[status.id] = "UNKNOWN";
  return {
    input,
    revision: old?.revision ?? 0,
    activeRevision: active?.revision ?? null,
    suggestion: chosen,
    observed: { statuses, channels, categories },
  };
}
export async function readSheetsMappingMetadata(
  p: AiPrincipal,
  sourceId: string,
  db: SqlDatabase = prisma,
) {
  return aiTransaction(p, db, (tx) => metadata(p, sourceId, tx), true);
}
async function analyzeSheetsMapping(
  p: AiPrincipal,
  input: SheetsMappingInput,
  mapping: SheetsFieldMapping,
  db: SqlClient,
) {
  const analyzer = createMappingAnalyzer(mapping, input.timezone);
  for (const [resource, key] of [
    ["products", "product_yml"],
    ["orders", "zavod_api"],
  ] as const) {
    const sheet = input.sheets.find((s) => s.sheetKey === key)!;
    let afterRow = 0,
      total = 0;
    const columns = [
      ...new Set(
        Object.values(mapping[resource]).filter((v): v is string => v !== null),
      ),
    ];
    const projection = Prisma.sql`jsonb_build_object(${Prisma.join(columns.flatMap((key) => [Prisma.sql`${key}::text`, Prisma.sql`r.data->${key}`]))})`;
    for (;;) {
      const rows = await db.$queryRaw<
        Array<{ rowNumber: number; data: Record<string, unknown> }>
      >(Prisma.sql`
    SELECT r."rowNumber",${projection} data FROM "DataSheetRow" r WHERE r."tenantId"=${p.tenantId} AND r."snapshotId"=${sheet.id} AND r."rowNumber">${afterRow} ORDER BY r."rowNumber" LIMIT 1000`);
      if (!rows.length) break;
      total += rows.length;
      if (total > 100000) throw new E("SHEETS_MAPPING_INPUT_LIMIT", 422);
      analyzer[resource](rows);
      afterRow = rows[rows.length - 1].rowNumber;
    }
    if (total !== sheet.rowCount)
      throw new E("SHEETS_RAW_SNAPSHOT_CHANGED", 409);
  }
  return analyzer.finish();
}
export async function previewSheetsMapping(
  p: AiPrincipal,
  sourceId: string,
  value: unknown,
  db: SqlDatabase = prisma,
  now = new Date(),
): Promise<SheetsMappingPreview> {
  mappingId(sourceId);
  if (
    !isRecord(value) ||
    !keys(value, ["expectedRevision", "importRunId", "mapping"]) ||
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 0 ||
    Number(value.expectedRevision) > 1000000
  )
    throw new E("INVALID_SHEETS_MAPPING_PREVIEW");
  const mapping = parseSheetsMapping(value.mapping),
    importRunId = mappingId(value.importRunId),
    expectedRevision = Number(value.expectedRevision);
  const input = await aiTransaction(
    p,
    db,
    (tx) => readSheetsMappingInput(p, sourceId, tx),
    true,
  );
  if (input.importRunId !== importRunId)
    throw new E("SHEETS_RAW_IMPORT_CHANGED", 409);
  validateMappingColumns(mapping, input);
  const summary = await analyzeSheetsMapping(p, input, mapping, db),
    bindingHash = payloadHash(input),
    schemaHash = sheetsSchemaHash(input);
  return aiTransaction(
    p,
    db,
    async (tx) => {
      const current = await readSheetsMappingInput(p, sourceId, tx),
        old = await latest(p, sourceId, tx);
      if (payloadHash(current) !== bindingHash)
        throw new E("SHEETS_RAW_IMPORT_CHANGED", 409);
      if ((old?.revision ?? 0) !== expectedRevision)
        throw new E("SHEETS_MAPPING_REVISION_CONFLICT", 409);
      const configId = randomUUID(),
        revision = expectedRevision + 1,
        expiresAt = new Date(
          now.getTime() + SHEETS_MAPPING_PREVIEW_TTL_MS,
        ).toISOString();
      const values = {
        sheets: { version: 1, fileId: input.fileId, schemaHash, mapping },
        ...sheetsOrderPolicy(mapping),
      };
      const previewHash = payloadHash({ input, mapping, revision, summary }),
        preview = {
          configId,
          sourceId,
          revision,
          importRunId,
          previewHash,
          expiresAt,
          summary,
        };
      if (Buffer.byteLength(JSON.stringify(preview), "utf8") > 128 * 1024)
        throw new E("SHEETS_MAPPING_PREVIEW_LIMIT", 422);
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive") VALUES (${configId},${p.tenantId},'SOURCE_MAPPING',${`sheets:${sourceId}`},${revision},${JSON.stringify(values)}::jsonb,false)`,
      );
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context,"createdAt") VALUES (${randomUUID()},${p.tenantId},${p.userId},${configId},'SHEETS_MAPPING_PREVIEW','SHEETS_MAPPING',${sourceId},${`sheets-mapping-preview:${configId}`},${JSON.stringify(preview)}::jsonb,${JSON.stringify({ version: 1, input, bindingHash, schemaHash })}::jsonb,${now})`,
      );
      return preview;
    },
    true,
  );
}
export async function approveSheetsMapping(
  p: AiPrincipal,
  sourceId: string,
  value: unknown,
  db: SqlDatabase = prisma,
  now = new Date(),
) {
  if (
    !isRecord(value) ||
    !keys(value, ["configId", "previewHash", "reference"]) ||
    typeof value.previewHash !== "string" ||
    !mappingText(value.reference, 1000)
  )
    throw new E("INVALID_SHEETS_MAPPING_APPROVAL");
  const configId = mappingId(value.configId),
    hash = value.previewHash,
    reference = value.reference;
  return aiTransaction(
    p,
    db,
    async (tx) => {
      const old = await latest(p, mappingId(sourceId), tx);
      if (!old || old.id !== configId)
        throw new E("SHEETS_MAPPING_REVISION_CONFLICT", 409);
      const [audit] = await tx.$queryRaw<
        Array<{
          after: SheetsMappingPreview;
          context: { bindingHash: string };
          actorId: string;
        }>
      >(
        Prisma.sql`SELECT after,context,"actorId" FROM "MerchandisingAction" WHERE "tenantId"=${p.tenantId} AND "configId"=${configId} AND "entityType"='SHEETS_MAPPING' AND "entityId"=${sourceId} AND "idempotencyKey"=${`sheets-mapping-preview:${configId}`}`,
      );
      if (!audit || audit.after.previewHash !== hash)
        throw new E("SHEETS_MAPPING_PREVIEW_CHANGED", 409);
      const input = await readSheetsMappingInput(p, sourceId, tx);
      if (payloadHash(input) !== audit.context.bindingHash)
        throw new E("SHEETS_RAW_IMPORT_CHANGED", 409);
      const mapping = parseSheetsMapping(old.values.sheets.mapping);
      validateMappingColumns(mapping, input);
      if (
        payloadHash({
          input,
          mapping,
          revision: old.revision,
          summary: audit.after.summary,
        }) !== hash
      )
        throw new E("SHEETS_MAPPING_PREVIEW_CHANGED", 409);
      if (old.approvedAt) {
        if (!old.isActive) throw new E("SHEETS_MAPPING_INACTIVE", 409);
        if (old.approvalReference !== reference)
          throw new E("SHEETS_MAPPING_APPROVAL_CONFLICT", 409);
        return {
          sourceId,
          configId,
          revision: old.revision,
          state: "APPROVED",
        };
      }
      if (Date.parse(audit.after.expiresAt) <= now.getTime())
        throw new E("SHEETS_MAPPING_PREVIEW_EXPIRED", 409);
      if (audit.after.summary.blockingErrors.length)
        throw new E("SHEETS_MAPPING_HAS_BLOCKING_ERRORS", 422);
      await tx.$executeRaw(
        Prisma.sql`UPDATE "MerchandisingConfig" SET "isActive"=false WHERE "tenantId"=${p.tenantId} AND "configType"='SOURCE_MAPPING' AND key=${`sheets:${sourceId}`} AND "isActive"`,
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE "MerchandisingConfig" SET values=${JSON.stringify({ sheets: { version: 1, fileId: input.fileId, schemaHash: sheetsSchemaHash(input), mapping }, ...sheetsOrderPolicy(mapping) })}::jsonb,"isActive"=true,"approvedAt"=${now},"approvedById"=${p.userId},"approvalReference"=${reference} WHERE "tenantId"=${p.tenantId} AND id=${configId}`,
      );
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context,"createdAt") VALUES (${randomUUID()},${p.tenantId},${p.userId},${configId},'SHEETS_MAPPING_APPROVED','SHEETS_MAPPING',${sourceId},${`sheets-mapping-approved:${configId}`},${JSON.stringify({ previewHash: hash, revision: old.revision, reference, summary: audit.after.summary })}::jsonb,'{"version":1}',${now})`,
      );
      return { sourceId, configId, revision: old.revision, state: "APPROVED" };
    },
    true,
  );
}
