import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  RawWorkbookValidationError,
  kyivBusinessDate,
  parseRawWorkbook,
  serializeCell,
  sha256,
} from "@/lib/data-import-workbook";

function worksheet(rows: unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
}

function validWorkbookBuffer(options?: {
  omit?: string;
  productHeaders?: string[];
}): Buffer {
  const wb = XLSX.utils.book_new();
  const sheets: Array<[string, XLSX.WorkSheet]> = [
    [
      "Product YML 2.0",
      worksheet([
        options?.productHeaders ?? ["ID", "Name", "Price", "Vendor Price", "Stock Qty"],
        ["SKU-1", "First", 100, 40, 3],
        [],
        ["SKU-2", "Second", 200, 80, 5],
      ]),
    ],
    [
      "ZAVOD_API",
      worksheet([
        [
          "id",
          "paymentDate",
          "statusId",
          "product.amount",
          "product.sku",
          "ProductPaymentAmount",
          "ProductcostPriceAmount",
        ],
        [
          "line-1",
          new Date("2026-08-01T00:00:00.000Z"),
          5,
          1,
          "SKU-1",
          100,
          40,
        ],
      ]),
    ],
    [
      "ARTICLE REPORT",
      worksheet([
        ["metadata"],
        ["metadata"],
        ["metadata"],
        ["metadata"],
        ["ID", "Name", "", ""],
        ["SKU-1", "First", "value", ""],
      ]),
    ],
    ["BY BRAND", worksheet([])],
    ["BY CATEGORY", worksheet([])],
    ["Ignored helper", worksheet([["secret"], ["not imported"]])],
  ];

  for (const [name, ws] of sheets) {
    if (name !== options?.omit) XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("raw workbook parser", () => {
  it("imports only the five allowed sheets and preserves physical row numbers", () => {
    const parsed = parseRawWorkbook(validWorkbookBuffer());

    expect(parsed.sheets.map((sheet) => sheet.sourceName)).toEqual([
      "Product YML 2.0",
      "ZAVOD_API",
      "ARTICLE REPORT",
      "BY BRAND",
      "BY CATEGORY",
    ]);
    expect(parsed.totalRows).toBe(5);

    const product = parsed.sheets[0];
    expect(product.rows.map((row) => row.rowNumber)).toEqual([2, 3, 4]);
    expect(product.rows[1].data).toEqual({
      col_a: "",
      col_b: "",
      col_c: "",
      col_d: "",
      col_e: "",
    });

    const article = parsed.sheets[2];
    expect(article.headerRow).toBe(5);
    expect(article.columns.map((column) => column.key)).toEqual([
      "col_a",
      "col_b",
      "col_c",
      "col_d",
    ]);
    expect(article.columns.map((column) => column.label)).toEqual(["ID", "Name", "", ""]);
    expect(article.rows[0].rowNumber).toBe(6);
  });

  it("serializes dates and produces deterministic row hashes", () => {
    const buffer = validWorkbookBuffer();
    const first = parseRawWorkbook(buffer);
    const second = parseRawWorkbook(buffer);
    const sale = first.sheets[1].rows[0];

    expect(sale.data.col_b).toBe("2026-08-01T00:00:00.000Z");
    expect(sale.rowHash).toBe(second.sheets[1].rows[0].rowHash);
    expect(sha256(buffer)).toHaveLength(64);
  });

  it("rejects a missing required sheet", () => {
    expect(() => parseRawWorkbook(validWorkbookBuffer({ omit: "ZAVOD_API" }))).toThrowError(
      expect.objectContaining<Partial<RawWorkbookValidationError>>({
        code: "MISSING_REQUIRED_SHEET",
      })
    );
  });

  it("rejects missing required headers", () => {
    expect(() =>
      parseRawWorkbook(
        validWorkbookBuffer({
          productHeaders: ["ID", "Name", "Price", "Vendor Price", "Wrong Stock"],
        })
      )
    ).toThrowError(
      expect.objectContaining<Partial<RawWorkbookValidationError>>({
        code: "MISSING_REQUIRED_HEADER",
      })
    );
  });

  it("uses the Kyiv local calendar date across a UTC day boundary", () => {
    expect(kyivBusinessDate(new Date("2026-01-01T22:30:00.000Z")).toISOString()).toBe(
      "2026-01-02T00:00:00.000Z"
    );
  });

  it("converts unsupported and non-finite values to JSON-safe primitives", () => {
    expect(serializeCell(Number.NaN)).toBeNull();
    expect(serializeCell(undefined)).toBe("");
    expect(serializeCell({ value: 1 })).toBe("[object Object]");
  });
});
