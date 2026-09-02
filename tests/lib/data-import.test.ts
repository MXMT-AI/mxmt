import { DataRunStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import {
  DATA_IMPORT_PIPELINE_VERSION,
  TypedProjectionValidationError,
  importRawWorkbookBuffer,
  sourceWorkbookChecksum,
} from "@/lib/data-import";
import { parseRawWorkbook, sha256 } from "@/lib/data-import-workbook";

function importBuffer(options?: { duplicateProduct?: boolean; metadataTitle?: string }): Buffer {
  const wb = XLSX.utils.book_new();
  if (options?.metadataTitle) wb.Props = { Title: options.metadataTitle };
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["ID", "Name", "Price", "Vendor Price", "Stock Qty"],
      ["SKU-1", "First", 100, 40, 3],
      ...(options?.duplicateProduct ? [["SKU-1", "Duplicate", 120, 50, 2]] : []),
    ]),
    "Product YML 2.0"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [
        "id",
        "paymentDate",
        "statusId",
        "product.amount",
        "product.sku",
        "ProductPaymentAmount",
        "ProductcostPriceAmount",
      ],
      ["line-1", "2026-08-01", 5, 1, "SKU-1", 100, 40],
    ]),
    "ZAVOD_API"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([[], [], [], [], ["ID"], ["SKU-1"]]),
    "ARTICLE REPORT"
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), "BY BRAND");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), "BY CATEGORY");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function fakeDatabase(options?: {
  activeChecksum?: string;
  activePipelineVersion?: number;
  failRows?: boolean;
}) {
  const dataSourceUpdate = vi.fn(async () => ({ id: "source-1" }));
  const dataImportRunUpdate = vi.fn(async () => ({ id: "run-1" }));
  const dataImportRunDeleteMany = vi.fn(async () => ({ count: 0 }));
  let snapshotNumber = 0;

  return {
    dataSource: {
      upsert: vi.fn(async () => ({
        id: "source-1",
        activeImportRun: options?.activeChecksum
          ? {
              id: "active-run",
              status: DataRunStatus.SUCCESS,
              sourceChecksum: options.activeChecksum,
              stats: {
                pipelineVersion:
                  options.activePipelineVersion ?? DATA_IMPORT_PIPELINE_VERSION,
                totalRows: 2,
                sheets: [],
                warnings: [],
              },
            }
          : null,
      })),
      update: dataSourceUpdate,
    },
    dataImportRun: {
      create: vi.fn(async () => ({ id: "run-1" })),
      update: dataImportRunUpdate,
      deleteMany: dataImportRunDeleteMany,
    },
    dataSheetSnapshot: {
      create: vi.fn(async () => ({ id: `snapshot-${++snapshotNumber}` })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    dataSheetRow: {
      createMany: options?.failRows
        ? vi.fn(async () => {
            throw new Error("row insert failed");
          })
        : vi.fn(async () => ({ count: 1 })),
    },
    sourceProduct: {
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    sourceSaleLine: {
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    importIssue: {
      createMany: vi.fn(async () => ({ count: 0 })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    reportCalculationRun: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    spies: { dataSourceUpdate, dataImportRunUpdate, dataImportRunDeleteMany },
  };
}

describe("atomic raw import", () => {
  it("stages all allowed sheets before atomically activating the run", async () => {
    const buffer = importBuffer();
    const db = fakeDatabase();

    const result = await importRawWorkbookBuffer(
      {
        tenantId: "tenant-1",
        fileId: "file-1",
        buffer,
        now: new Date("2026-08-27T07:15:00.000Z"),
      },
      db as never
    );

    expect(result.outcome).toBe("imported");
    expect(result.status).toBe(DataRunStatus.SUCCESS);
    expect(db.dataSheetSnapshot.create).toHaveBeenCalledTimes(5);
    expect(db.sourceProduct.createMany).toHaveBeenCalledTimes(1);
    expect(db.sourceSaleLine.createMany).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.spies.dataSourceUpdate).toHaveBeenCalledWith({
      where: { id: "source-1" },
      data: { activeImportRunId: "run-1" },
    });
  });

  it("does not activate a partially written run", async () => {
    const db = fakeDatabase({ failRows: true });

    await expect(
      importRawWorkbookBuffer(
        {
          tenantId: "tenant-1",
          fileId: "file-1",
          buffer: importBuffer(),
        },
        db as never
      )
    ).rejects.toThrow("row insert failed");

    expect(db.spies.dataSourceUpdate).not.toHaveBeenCalled();
    expect(db.spies.dataImportRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: DataRunStatus.FAILED }),
      })
    );
    expect(db.dataSheetSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", importRunId: "run-1" },
    });
  });

  it("prunes terminal inactive imports while preserving the active and running runs", async () => {
    const buffer = importBuffer();
    const db = fakeDatabase({
      activeChecksum: sourceWorkbookChecksum(parseRawWorkbook(buffer)),
      activePipelineVersion: DATA_IMPORT_PIPELINE_VERSION - 1,
    });

    await importRawWorkbookBuffer(
      { tenantId: "tenant-1", fileId: "file-1", buffer },
      db as never
    );

    expect(db.spies.dataImportRunDeleteMany).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId: "tenant-1",
        sourceId: "source-1",
        status: {
          in: [DataRunStatus.SUCCESS, DataRunStatus.WARNING, DataRunStatus.FAILED],
        },
        id: { not: "active-run" },
      },
    });
    expect(db.spies.dataImportRunDeleteMany).toHaveBeenNthCalledWith(2, {
      where: {
        tenantId: "tenant-1",
        sourceId: "source-1",
        status: {
          in: [DataRunStatus.SUCCESS, DataRunStatus.WARNING, DataRunStatus.FAILED],
        },
        id: { not: "run-1" },
      },
    });
  });

  it("reuses the active run when the workbook checksum is unchanged", async () => {
    const buffer = importBuffer();
    const db = fakeDatabase({ activeChecksum: sourceWorkbookChecksum(parseRawWorkbook(buffer)) });

    const result = await importRawWorkbookBuffer(
      { tenantId: "tenant-1", fileId: "file-1", buffer },
      db as never
    );

    expect(result.outcome).toBe("unchanged");
    expect(result.importRunId).toBe("active-run");
    expect(db.dataImportRun.create).not.toHaveBeenCalled();
    expect(db.dataSheetSnapshot.create).not.toHaveBeenCalled();
  });

  it("rebuilds an unchanged workbook created by an older import pipeline", async () => {
    const buffer = importBuffer();
    const db = fakeDatabase({
      activeChecksum: sourceWorkbookChecksum(parseRawWorkbook(buffer)),
      activePipelineVersion: 1,
    });

    const result = await importRawWorkbookBuffer(
      { tenantId: "tenant-1", fileId: "file-1", buffer },
      db as never
    );

    expect(result.outcome).toBe("imported");
    expect(db.dataImportRun.create).toHaveBeenCalledTimes(1);
    expect(db.sourceProduct.createMany).toHaveBeenCalledTimes(1);
  });

  it("ignores XLSX package metadata when comparing workbook contents", () => {
    const first = importBuffer({ metadataTitle: "First export" });
    const second = importBuffer({ metadataTitle: "Second export" });

    expect(sha256(first)).not.toBe(sha256(second));
    expect(sourceWorkbookChecksum(parseRawWorkbook(first)))
      .toBe(sourceWorkbookChecksum(parseRawWorkbook(second)));
  });

  it("persists blocking product issues and does not activate the run", async () => {
    const db = fakeDatabase();

    await expect(
      importRawWorkbookBuffer(
        { tenantId: "tenant-1", fileId: "file-1", buffer: importBuffer({ duplicateProduct: true }) },
        db as never
      )
    ).rejects.toBeInstanceOf(TypedProjectionValidationError);

    expect(db.importIssue.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_PRODUCT_ID", severity: "ERROR" }),
      ]),
    });
    expect(db.sourceProduct.createMany).not.toHaveBeenCalled();
    expect(db.spies.dataSourceUpdate).not.toHaveBeenCalled();
  });
});
