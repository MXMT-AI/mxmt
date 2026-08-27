import { DataRunStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import {
  DATA_IMPORT_PIPELINE_VERSION,
  TypedProjectionValidationError,
  importRawWorkbookBuffer,
} from "@/lib/data-import";
import { sha256 } from "@/lib/data-import-workbook";

function importBuffer(options?: { duplicateProduct?: boolean }): Buffer {
  const wb = XLSX.utils.book_new();
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
    },
    dataSheetSnapshot: {
      create: vi.fn(async () => ({ id: `snapshot-${++snapshotNumber}` })),
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
    },
    sourceSaleLine: {
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
    },
    importIssue: {
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    spies: { dataSourceUpdate, dataImportRunUpdate },
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
  });

  it("reuses the active run when the workbook checksum is unchanged", async () => {
    const buffer = importBuffer();
    const db = fakeDatabase({ activeChecksum: sha256(buffer) });

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
    const db = fakeDatabase({ activeChecksum: sha256(buffer), activePipelineVersion: 1 });

    const result = await importRawWorkbookBuffer(
      { tenantId: "tenant-1", fileId: "file-1", buffer },
      db as never
    );

    expect(result.outcome).toBe("imported");
    expect(db.dataImportRun.create).toHaveBeenCalledTimes(1);
    expect(db.sourceProduct.createMany).toHaveBeenCalledTimes(1);
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
