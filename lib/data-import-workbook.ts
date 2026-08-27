import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { assertDriveRowLimit } from "@/lib/drive-limits";

export const DATA_SOURCE_TIMEZONE = "Europe/Kyiv";

export const RAW_SHEET_CONFIGS = [
  {
    key: "product_yml",
    name: "Product YML 2.0",
    headerRow: 1,
    required: true,
    requiredHeaders: ["ID", "Name", "Price", "Vendor Price", "Stock Qty"],
    textHeaders: ["ID", "Article", "Vendor Code", "Barcode"],
  },
  {
    key: "zavod_api",
    name: "ZAVOD_API",
    headerRow: 1,
    required: true,
    requiredHeaders: [
      "id",
      "paymentDate",
      "statusId",
      "product.amount",
      "product.sku",
      "ProductPaymentAmount",
      "ProductcostPriceAmount",
    ],
    textHeaders: [
      "id",
      "orderId",
      "externalId",
      "product.barcode",
      "product.parameter",
      "product.productId",
      "product.sku",
      "product.stockId",
    ],
  },
  {
    key: "article_report_source",
    name: "ARTICLE REPORT",
    headerRow: 5,
    required: false,
    requiredHeaders: [],
    textHeaders: ["ID", "Article"],
  },
  {
    key: "by_brand_source",
    name: "BY BRAND",
    headerRow: 1,
    required: false,
    requiredHeaders: [],
    textHeaders: [],
  },
  {
    key: "by_category_source",
    name: "BY CATEGORY",
    headerRow: 1,
    required: false,
    requiredHeaders: [],
    textHeaders: [],
  },
] as const;

export type RawSheetKey = (typeof RAW_SHEET_CONFIGS)[number]["key"];
export type JsonCellValue = string | number | boolean | null;

export interface RawColumnDefinition {
  key: string;
  label: string;
  sourceColumn: string;
  sourceIndex: number;
}

export interface ParsedRawRow {
  rowNumber: number;
  data: Record<string, JsonCellValue>;
  rowHash: string;
  searchText: string;
}

export interface ParsedRawSheet {
  key: RawSheetKey;
  sourceName: string;
  headerRow: number;
  columns: RawColumnDefinition[];
  rows: ParsedRawRow[];
  checksum: string;
  missing: boolean;
}

export interface ParsedRawWorkbook {
  sheets: ParsedRawSheet[];
  totalRows: number;
  warnings: string[];
}

export class RawWorkbookValidationError extends Error {
  constructor(
    readonly code:
      | "MISSING_REQUIRED_SHEET"
      | "MISSING_REQUIRED_HEADER"
      | "EMPTY_REQUIRED_SHEET",
    message: string
  ) {
    super(message);
    this.name = "RawWorkbookValidationError";
  }
}

export function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function serializeCell(value: unknown): JsonCellValue {
  if (value === undefined || value === null || value === "") return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  return String(value);
}

function buildColumns(header: unknown[], columnCount: number): RawColumnDefinition[] {
  return Array.from({ length: columnCount }, (_, sourceIndex) => {
    const sourceColumn = XLSX.utils.encode_col(sourceIndex);
    const rawLabel = serializeCell(header[sourceIndex]);
    return {
      key: `col_${sourceColumn.toLowerCase()}`,
      label: rawLabel === null ? "" : String(rawLabel),
      sourceColumn,
      sourceIndex,
    };
  });
}

function getWorksheetDimensions(ws: XLSX.WorkSheet): { columnCount: number; lastRowIndex: number } {
  if (!ws["!ref"]) return { columnCount: 0, lastRowIndex: -1 };
  const range = XLSX.utils.decode_range(ws["!ref"]);
  return {
    columnCount: range.e.c + 1,
    lastRowIndex: range.e.r,
  };
}

function parseSheet(
  ws: XLSX.WorkSheet,
  config: (typeof RAW_SHEET_CONFIGS)[number]
): ParsedRawSheet {
  const matrix = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true,
  }) as unknown[][];
  const { columnCount, lastRowIndex } = getWorksheetDimensions(ws);
  const headerIndex = config.headerRow - 1;
  const header = matrix[headerIndex] ?? [];
  const columns = buildColumns(header, Math.max(columnCount, header.length));
  const labels = new Set(columns.map((column) => column.label.trim()));
  const missingHeaders = config.requiredHeaders.filter((headerName) => !labels.has(headerName));

  if (missingHeaders.length > 0) {
    throw new RawWorkbookValidationError(
      "MISSING_REQUIRED_HEADER",
      `Worksheet "${config.name}" is missing required columns: ${missingHeaders.join(", ")}`
    );
  }

  const rows: ParsedRawRow[] = [];
  for (let rowIndex = headerIndex + 1; rowIndex <= lastRowIndex; rowIndex++) {
    const sourceRow = matrix[rowIndex] ?? [];
    const data: Record<string, JsonCellValue> = {};
    const searchValues: string[] = [];

    for (const column of columns) {
      const sourceValue = sourceRow[column.sourceIndex];
      const cell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: column.sourceIndex })];
      const value = (config.textHeaders as readonly string[]).includes(column.label)
        ? serializeTextCell(cell, sourceValue)
        : serializeCell(sourceValue);
      data[column.key] = value;
      if (value !== "" && value !== null) searchValues.push(String(value));
    }

    const serialized = JSON.stringify(data);
    rows.push({
      rowNumber: rowIndex + 1,
      data,
      rowHash: sha256(serialized),
      searchText: searchValues.join(" ").slice(0, 10_000),
    });
  }

  const hasData = rows.some((row) =>
    Object.values(row.data).some((value) => value !== "" && value !== null)
  );
  if (config.required && !hasData) {
    throw new RawWorkbookValidationError(
      "EMPTY_REQUIRED_SHEET",
      `Required worksheet "${config.name}" has no data rows`
    );
  }

  return {
    key: config.key,
    sourceName: config.name,
    headerRow: config.headerRow,
    columns,
    rows,
    checksum: sha256(
      JSON.stringify({
        columns,
        rows: rows.map((row) => row.rowHash),
      })
    ),
    missing: false,
  };
}

function serializeTextCell(cell: XLSX.CellObject | undefined, fallback: unknown): JsonCellValue {
  if (fallback === undefined || fallback === null || fallback === "") return "";
  if (typeof fallback === "string") return fallback;
  if (cell?.w !== undefined && cell.w !== "") return cell.w;
  return String(fallback);
}

function missingOptionalSheet(config: (typeof RAW_SHEET_CONFIGS)[number]): ParsedRawSheet {
  return {
    key: config.key,
    sourceName: config.name,
    headerRow: config.headerRow,
    columns: [],
    rows: [],
    checksum: sha256("missing"),
    missing: true,
  };
}

export function parseRawWorkbook(buffer: Buffer): ParsedRawWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheets: ParsedRawSheet[] = [];
  const warnings: string[] = [];
  let totalRows = 0;

  for (const config of RAW_SHEET_CONFIGS) {
    const ws = workbook.Sheets[config.name];
    if (!ws) {
      if (config.required) {
        throw new RawWorkbookValidationError(
          "MISSING_REQUIRED_SHEET",
          `Workbook is missing required worksheet "${config.name}"`
        );
      }
      warnings.push(`Optional worksheet "${config.name}" is missing`);
      sheets.push(missingOptionalSheet(config));
      continue;
    }

    const parsed = parseSheet(ws, config);
    totalRows += parsed.rows.length;
    assertDriveRowLimit(totalRows);
    sheets.push(parsed);
  }

  return { sheets, totalRows, warnings };
}

export function kyivBusinessDate(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DATA_SOURCE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");

  if (!year || !month || !day) throw new Error("Could not resolve Kyiv business date");
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}
