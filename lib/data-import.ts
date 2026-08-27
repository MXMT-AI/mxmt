import { randomUUID } from "node:crypto";
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

const RAW_ROW_BATCH_SIZE = 750;

type ImportDatabaseClient = Pick<
  PrismaClient,
  "dataSource" | "dataImportRun" | "dataSheetSnapshot" | "dataSheetRow" | "importIssue" | "$transaction"
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

async function insertRawRows(
  db: ImportDatabaseClient,
  tenantId: string,
  snapshotId: string,
  rows: ParsedRawWorkbook["sheets"][number]["rows"]
): Promise<void> {
  for (let index = 0; index < rows.length; index += RAW_ROW_BATCH_SIZE) {
    const batch = rows.slice(index, index + RAW_ROW_BATCH_SIZE);
    await db.dataSheetRow.createMany({
      data: batch.map((row) => ({
        tenantId,
        snapshotId,
        rowNumber: row.rowNumber,
        data: asJson(row.data),
        rowHash: row.rowHash,
        searchText: row.searchText || null,
      })),
    });
  }
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
  const checksum = sha256(buffer);
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
          stats: true,
        },
      },
    },
  });

  const activeRun = source.activeImportRun;
  if (
    activeRun?.sourceChecksum === checksum &&
    (activeRun.status === DataRunStatus.SUCCESS || activeRun.status === DataRunStatus.WARNING)
  ) {
    const stats = (activeRun.stats ?? {}) as {
      totalRows?: number;
      sheets?: RawImportSheetResult[];
      warnings?: string[];
    };
    return {
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
      },
      select: { id: true },
    });
    importRunId = importRun.id;

    const parsed = parseRawWorkbook(buffer);
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

    const status = parsed.warnings.length > 0 ? DataRunStatus.WARNING : DataRunStatus.SUCCESS;
    const stats = {
      totalRows: parsed.totalRows,
      sheets: results,
      warnings: parsed.warnings,
    };

    await db.$transaction([
      db.dataImportRun.update({
        where: { id: importRun.id },
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
    }
    if (isUniqueConstraintError(error)) throw new RawImportInProgressError();
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
