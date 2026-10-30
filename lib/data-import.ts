import { randomUUID } from "node:crypto";
import { insertImportBatch } from "./import-batch";
import { RAW_IMPORT_MAX_RUNTIME_MS } from "./data-import-policy";
import {
  DataImportTrigger,
  DataRunStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { downloadConfiguredDriveWorkbook } from "@/lib/gdrive";
import {
  DATA_SOURCE_TIMEZONE,
  RAW_SHEET_CONFIGS,
  kyivBusinessDate,
  parseRawWorkbook,
  sha256,
  type ParsedRawWorkbook,
} from "@/lib/data-import-workbook";
import {
  normalizeRawWorkbook,
  type NormalizationIssue,
  type NormalizedWorkbook,
} from "@/lib/data-normalization";

const RAW_ROW_BATCH_SIZE = 750;
const TYPED_ROW_BATCH_SIZE = 500;
export const DATA_IMPORT_PIPELINE_VERSION = 9;
const PRUNABLE_IMPORT_STATUSES = [
  DataRunStatus.SUCCESS,
  DataRunStatus.WARNING,
  DataRunStatus.FAILED,
];

type ImportDatabaseClient = Pick<
  PrismaClient,
  | "dataSource"
  | "dataImportRun"
  | "dataSheetSnapshot"
  | "dataSheetRow"
  | "sourceProduct"
  | "sourceSaleLine"
  | "importIssue"
  | "reportCalculationRun"
  | "$transaction"
>;

export interface RawImportSheetResult {
  key: string;
  name: string;
  rows: number;
  columns: number;
  checksum: string;
  missing: boolean;
}

export interface RawImportResult {
  outcome: "imported" | "unchanged";
  sourceId: string;
  importRunId: string;
  status: DataRunStatus;
  checksum: string;
  totalRows: number;
  sheets: RawImportSheetResult[];
  warnings: string[];
}

export class RawImportInProgressError extends Error {
  constructor() {
    super("A raw data import is already running for this source");
    this.name = "RawImportInProgressError";
  }
}
export class RawImportExpiredError extends Error {
  constructor() {
    super("The import exceeded its execution window. The previous active data is retained; start a new import.");
    this.name = "RawImportExpiredError";
  }
}

export class TypedProjectionValidationError extends Error {
  constructor(readonly issueCount: number) {
    super(`Typed projection has ${issueCount} blocking validation issue(s)`);
    this.name = "TypedProjectionValidationError";
  }
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4_000);
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function sheetResults(parsed: ParsedRawWorkbook): RawImportSheetResult[] {
  return parsed.sheets.map((sheet) => ({
    key: sheet.key,
    name: sheet.sourceName,
    rows: sheet.rows.length,
    columns: sheet.columns.length,
    checksum: sheet.checksum,
    missing: sheet.missing,
  }));
}

async function pruneInactiveImportRuns(
  db: ImportDatabaseClient,
  tenantId: string,
  sourceId: string,
  activeImportRunId: string | null
): Promise<void> {
  await db.dataImportRun.deleteMany({
    where: {
      tenantId,
      sourceId,
      status: { in: PRUNABLE_IMPORT_STATUSES },
      orderLines: { none: {} },
      receipts: { none: {} },
      priceHistory: { none: {} },
      inventorySnapshots: { none: {} },
      cursors: { none: {} },
      connectorJobs: { none: {} },
      orderImportStates: { none: {} },
      ...(activeImportRunId ? { id: { not: activeImportRunId } } : {}),
    },
  });
}

async function cleanupImportPayload(
  db: ImportDatabaseClient,
  tenantId: string,
  importRunId: string
): Promise<void> {
  await db.$transaction([
    db.reportCalculationRun.deleteMany({ where: { tenantId, importRunId } }),
    db.importIssue.deleteMany({ where: { tenantId, importRunId } }),
    db.sourceSaleLine.deleteMany({ where: { tenantId, importRunId } }),
    db.sourceProduct.deleteMany({ where: { tenantId, importRunId } }),
    db.dataSheetSnapshot.deleteMany({ where: { tenantId, importRunId } }),
  ]);
}

export function sourceWorkbookChecksum(parsed: ParsedRawWorkbook): string {
  return sha256(JSON.stringify(
    parsed.sheets.map((sheet) => ({ key: sheet.key, checksum: sheet.checksum }))
  ));
}

async function insertRawRows(
  db: ImportDatabaseClient,
  tenantId: string,
  snapshotId: string,
  rows: ParsedRawWorkbook["sheets"][number]["rows"]
): Promise<void> {
  for (let index = 0; index < rows.length; index += RAW_ROW_BATCH_SIZE) {
    const batch = rows.slice(index, index + RAW_ROW_BATCH_SIZE);
    await insertImportBatch(batch.map((row) => ({
        tenantId,
        snapshotId,
        rowNumber: row.rowNumber,
        data: asJson(row.data),
        rowHash: row.rowHash,
        searchText: row.searchText || null,
      })), input=>db.dataSheetRow.createMany(input));
  }
}

async function insertInBatches<T>(
  values: T[],
  insert: (batch: T[]) => Promise<unknown>
): Promise<void> {
  for (let index = 0; index < values.length; index += TYPED_ROW_BATCH_SIZE) {
    await insert(values.slice(index, index + TYPED_ROW_BATCH_SIZE));
  }
}

async function insertIssues(
  db: ImportDatabaseClient,
  tenantId: string,
  importRunId: string,
  issues: NormalizationIssue[]
): Promise<void> {
  await insertInBatches(issues, (batch) =>
    insertImportBatch(batch.map((item) => ({
        tenantId,
        importRunId,
        sheetKey: item.sheetKey,
        rowNumber: item.rowNumber,
        code: item.code,
        severity: item.severity,
        message: item.message,
        context: asJson(item.context),
      })), input=>db.importIssue.createMany(input))
  );
}

async function insertTypedProjection(
  db: ImportDatabaseClient,
  tenantId: string,
  importRunId: string,
  normalized: NormalizedWorkbook
): Promise<void> {
  await insertInBatches(normalized.products, (batch) =>
    insertImportBatch(batch.map(({ barcode: _barcode, ...product }) => ({
        ...product,
        tenantId,
        importRunId,
        sourceValues: asJson(product.sourceValues),
      })), input=>db.sourceProduct.createMany(input))
  );
  await insertInBatches(normalized.saleLines, (batch) =>
    insertImportBatch(batch.map((saleLine) => ({ ...saleLine, tenantId, importRunId, sourceValues: asJson(saleLine.sourceValues) })), input=>db.sourceSaleLine.createMany(input))
  );
  await insertIssues(db, tenantId, importRunId, normalized.issues);
}

export async function importRawWorkbookBuffer(
  {
    tenantId,
    fileId,
    buffer,
    trigger = DataImportTrigger.MANUAL,
    now = new Date(),
  }: {
    tenantId: string;
    fileId: string;
    buffer: Buffer;
    trigger?: DataImportTrigger;
    now?: Date;
  },
  db: ImportDatabaseClient = prisma
): Promise<RawImportResult> {
  const wallStartedAt = Date.now();
  const operationNow = () => new Date(now.getTime() + Date.now() - wallStartedAt);
  const parsed = parseRawWorkbook(buffer);
  const checksum = sourceWorkbookChecksum(parsed);
  const businessDate = kyivBusinessDate(now);
  const source = await db.dataSource.upsert({
    where: { tenantId_driveFileId: { tenantId, driveFileId: fileId } },
    create: {
      tenantId,
      driveFileId: fileId,
      timezone: DATA_SOURCE_TIMEZONE,
      allowedSheets: asJson(RAW_SHEET_CONFIGS),
    },
    update: {
      timezone: DATA_SOURCE_TIMEZONE,
      allowedSheets: asJson(RAW_SHEET_CONFIGS),
    },
    include: {
      activeImportRun: {
        select: {
          id: true,
          status: true,
          sourceChecksum: true,
          businessDate: true,
          stats: true,
        },
      },
    },
  });

  const activeRun = source.activeImportRun;
  const expiredBefore = new Date(operationNow().getTime() - RAW_IMPORT_MAX_RUNTIME_MS);
  await db.dataImportRun.updateMany({
    where: {
      tenantId, sourceId: source.id, status: DataRunStatus.RUNNING,
      createdAt: { lt: expiredBefore },
      ...(activeRun ? { id: { not: activeRun.id } } : {}),
    },
    data: { status: DataRunStatus.FAILED, errorMessage: "RAW_IMPORT_EXECUTION_EXPIRED", completedAt: operationNow() },
  });
  await pruneInactiveImportRuns(db, tenantId, source.id, activeRun?.id ?? null);
  if (
    activeRun?.sourceChecksum === checksum &&
    activeRun.businessDate.getTime() === businessDate.getTime() &&
    (activeRun.status === DataRunStatus.SUCCESS || activeRun.status === DataRunStatus.WARNING)
  ) {
    const stats = (activeRun.stats ?? {}) as {
      pipelineVersion?: number;
      totalRows?: number;
      sheets?: RawImportSheetResult[];
      warnings?: string[];
    };
    if (stats.pipelineVersion === DATA_IMPORT_PIPELINE_VERSION) return {
      outcome: "unchanged",
      sourceId: source.id,
      importRunId: activeRun.id,
      status: activeRun.status,
      checksum,
      totalRows: stats.totalRows ?? 0,
      sheets: stats.sheets ?? [],
      warnings: stats.warnings ?? [],
    };
  }

  let importRunId: string | null = null;
  try {
    const importRun = await db.dataImportRun.create({
      data: {
        tenantId,
        sourceId: source.id,
        trigger,
        status: DataRunStatus.RUNNING,
        idempotencyKey: `${trigger.toLowerCase()}:${businessDate
          .toISOString()
          .slice(0, 10)}:${randomUUID()}`,
        businessDate,
        sourceChecksum: checksum,
        startedAt: now,
        createdAt: now,
      },
      select: { id: true },
    }).catch((error: unknown) => {
      if (isUniqueConstraintError(error)) throw new RawImportInProgressError();
      throw error;
    });
    importRunId = importRun.id;

    const normalized = normalizeRawWorkbook(parsed);
    const results = sheetResults(parsed);

    for (const sheet of parsed.sheets) {
      const snapshot = await db.dataSheetSnapshot.create({
        data: {
          tenantId,
          importRunId,
          sheetKey: sheet.key,
          sourceName: sheet.sourceName,
          headerRow: sheet.headerRow,
          columns: asJson(sheet.columns),
          rowCount: sheet.rows.length,
          checksum: sheet.checksum,
        },
        select: { id: true },
      });
      await insertRawRows(db, tenantId, snapshot.id, sheet.rows);
    }

    if (normalized.blockingIssues.length > 0) {
      await insertIssues(db, tenantId, importRun.id, normalized.blockingIssues);
      throw new TypedProjectionValidationError(normalized.blockingIssues.length);
    }

    await insertTypedProjection(db, tenantId, importRun.id, normalized);

    const missingSheets = parsed.sheets.filter((sheet) => sheet.missing);
    if (missingSheets.length > 0) {
      await db.importIssue.createMany({
        data: missingSheets.map((sheet) => ({
          tenantId,
          importRunId: importRun.id,
          sheetKey: sheet.key,
          code: "MISSING_OPTIONAL_SHEET",
          severity: "WARNING" as const,
          message: `Optional worksheet "${sheet.sourceName}" is missing`,
          context: asJson({ sourceName: sheet.sourceName }),
        })),
      });
    }

    const warningIssueCount = normalized.issues.filter((issue) => issue.severity === "WARNING").length;
    const status = parsed.warnings.length > 0 || warningIssueCount > 0
      ? DataRunStatus.WARNING
      : DataRunStatus.SUCCESS;
    const stats = {
      pipelineVersion: DATA_IMPORT_PIPELINE_VERSION,
      totalRows: parsed.totalRows,
      sheets: results,
      warnings: parsed.warnings,
      products: normalized.products.length,
      saleLines: normalized.saleLines.length,
      includedFinalSaleLines: normalized.saleLines.filter(
        (saleLine) => saleLine.normalizedSales !== null
      ).length,
      matchedSaleLines: normalized.saleLines.filter(
        (saleLine) => saleLine.matchStatus === "MATCHED"
      ).length,
      unmatchedSaleLines: normalized.saleLines.filter(
        (saleLine) => saleLine.matchStatus === "UNMATCHED"
      ).length,
      ambiguousSaleLines: normalized.saleLines.filter(
        (saleLine) => saleLine.matchStatus === "AMBIGUOUS"
      ).length,
      issues: normalized.issues.length,
      warningIssues: warningIssueCount,
    };

    if (operationNow().getTime() - now.getTime() >= RAW_IMPORT_MAX_RUNTIME_MS)
      throw new RawImportExpiredError();
    await db.$transaction([
      db.dataImportRun.update({
        where: { id: importRun.id, tenantId, sourceId: source.id, status: DataRunStatus.RUNNING },
        data: {
          status,
          stats: asJson(stats),
          completedAt: new Date(),
          errorMessage: null,
        },
      }),
      db.dataSource.update({
        where: { id: source.id },
        data: { activeImportRunId: importRun.id },
      }),
    ]);

    await pruneInactiveImportRuns(db, tenantId, source.id, importRun.id).catch((error) => {
      console.error("[data/import] could not prune inactive imports", error);
    });

    return {
      outcome: "imported",
      sourceId: source.id,
      importRunId: importRun.id,
      status,
      checksum,
      totalRows: parsed.totalRows,
      sheets: results,
      warnings: parsed.warnings,
    };
  } catch (error) {
    if (importRunId) {
      await db.dataImportRun
        .update({
          where: { id: importRunId },
          data: {
            status: DataRunStatus.FAILED,
            errorMessage: errorMessage(error),
            completedAt: new Date(),
          },
        })
        .catch(() => undefined);
      await cleanupImportPayload(db, tenantId, importRunId).catch((cleanupError) => {
        console.error("[data/import] could not clean failed import payload", cleanupError);
      });
    }
    throw error;
  }
}

export async function importRawDataFromDrive(
  tenantId: string,
  trigger: DataImportTrigger = DataImportTrigger.MANUAL
): Promise<RawImportResult> {
  const { fileId, buffer } = await downloadConfiguredDriveWorkbook();
  return importRawWorkbookBuffer({ tenantId, fileId, buffer, trigger });
}
