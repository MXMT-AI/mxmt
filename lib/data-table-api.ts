import { DataRunStatus, Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ARTICLE_CALCULATION_VERSION } from "@/lib/article-report";

export const DATA_TABLE_KEYS = [
  "product_yml",
  "zavod_api",
  "article_report",
  "by_brand",
  "by_category",
] as const;

export type DataTableKey = (typeof DATA_TABLE_KEYS)[number];
export type DataColumnType = "text" | "number" | "money" | "quantity" | "percentage" | "date" | "source";

export interface DataColumnMetadata {
  key: string;
  label: string;
  type: DataColumnType;
  sourceOnly?: boolean;
  defaultVisible?: boolean;
}

export interface DataTableQuery {
  page: number;
  pageSize: number;
  search: string | null;
  sort: string | null;
  direction: "asc" | "desc";
  importRunId: string | null;
  calculationRunId: string | null;
}

export interface DataTableResponse {
  sheetKey: DataTableKey;
  columns: DataColumnMetadata[];
  rows: Array<Record<string, unknown>>;
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
  context: {
    importRunId: string;
    calculationRunId: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    asOfDate: string | null;
  };
}

export class DataTableApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "DataTableApiError";
  }
}

type DataTableDatabaseClient = Pick<
  PrismaClient,
  | "dataSource"
  | "dataImportRun"
  | "dataSheetSnapshot"
  | "dataSheetRow"
  | "reportCalculationRun"
  | "articleReportResult"
  | "brandReportResult"
  | "categoryReportResult"
>;

const ARTICLE_COLUMNS: DataColumnMetadata[] = [
  { key: "productId", label: "ID", type: "text", defaultVisible: true },
  { key: "article", label: "Article", type: "text", defaultVisible: true },
  { key: "name", label: "Name", type: "text", defaultVisible: true },
  { key: "brand", label: "Brand", type: "text", defaultVisible: true },
  { key: "category", label: "Category", type: "text", defaultVisible: true },
  { key: "costPrice", label: "Cost Price", type: "money", defaultVisible: true },
  { key: "rrp", label: "RRP", type: "money", defaultVisible: true },
  { key: "retailPrice", label: "Retail Price", type: "money", defaultVisible: true },
  { key: "discount", label: "Discount", type: "percentage", defaultVisible: true },
  { key: "gmPct", label: "GM%", type: "percentage", defaultVisible: true },
  { key: "salesUnits", label: "Sales, units", type: "quantity", defaultVisible: true },
  { key: "salesUah", label: "Sales, UAH", type: "money", defaultVisible: true },
  { key: "costOfSalesUah", label: "Cost of Sales, UAH", type: "money", defaultVisible: true },
  { key: "gpUah", label: "GP UAH", type: "money", defaultVisible: true },
  { key: "salesGmPct", label: "Sales GM%", type: "percentage", defaultVisible: true },
  { key: "stockUnits", label: "Stock units", type: "quantity", defaultVisible: true },
  { key: "stockUah", label: "Stock UAH", type: "money", defaultVisible: true },
  { key: "strPct", label: "STR%", type: "percentage", defaultVisible: true },
  { key: "avgSalesLastTwoWeeks", label: "AVG Sales Last 2 week", type: "quantity", defaultVisible: true },
  { key: "woh", label: "WOH", type: "number", defaultVisible: true },
];

function groupedColumns(label: "Brand" | "Category"): DataColumnMetadata[] {
  const key = label.toLowerCase();
  return [
    { key, label, type: "text", defaultVisible: true },
    { key: "salesUah", label: "Sales, UAH", type: "money", defaultVisible: true },
    { key: "salesUnits", label: "Sales, units", type: "quantity", defaultVisible: true },
    { key: "costOfSalesUah", label: "Cost of Sales, UAH", type: "money", defaultVisible: true },
    { key: "gpUah", label: "GP UAH", type: "money", defaultVisible: true },
    { key: "stockUnits", label: "Stock units", type: "quantity", defaultVisible: true },
    { key: "stockUah", label: "Stock UAH", type: "money", defaultVisible: true },
    { key: "strPct", label: "STR% units", type: "percentage", defaultVisible: true },
    { key: "salesSharePct", label: "% Sales", type: "percentage", defaultVisible: true },
    { key: "avgSalesLastTwoWeeks", label: "AVG Sales Last 2 week", type: "quantity", defaultVisible: true },
    { key: "woh", label: "WOH", type: "number", defaultVisible: true },
  ];
}

export function isDataTableKey(value: string): value is DataTableKey {
  return (DATA_TABLE_KEYS as readonly string[]).includes(value);
}

function positiveInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) return fallback;
  return Math.min(parsed, max);
}

export function parseDataTableQuery(searchParams: URLSearchParams): DataTableQuery {
  const search = searchParams.get("search")?.trim().slice(0, 200) || null;
  const sort = searchParams.get("sort")?.trim().slice(0, 80) || null;
  return {
    page: positiveInteger(searchParams.get("page"), 1, 1, 1_000_000),
    pageSize: positiveInteger(searchParams.get("pageSize"), 50, 10, 200),
    search,
    sort,
    direction: searchParams.get("direction") === "desc" ? "desc" : "asc",
    importRunId: searchParams.get("importRunId")?.trim() || null,
    calculationRunId: searchParams.get("calculationRunId")?.trim() || null,
  };
}

function dateString(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

export function toApiValue(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toApiValue);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toApiValue(item)]));
  }
  return value;
}

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function rawColumns(value: Prisma.JsonValue): DataColumnMetadata[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((column) => {
    if (typeof column !== "object" || column === null || Array.isArray(column)) return [];
    const key = "key" in column && typeof column.key === "string" ? column.key : null;
    if (!key) return [];
    const label = "label" in column && typeof column.label === "string" && column.label
      ? column.label
      : "sourceColumn" in column && typeof column.sourceColumn === "string"
        ? column.sourceColumn
        : key;
    return [{ key, label, type: "source" as const, defaultVisible: true }];
  });
}

async function resolveImportRun(
  db: DataTableDatabaseClient,
  tenantId: string,
  requestedId: string | null
): Promise<string> {
  if (requestedId) {
    const run = await db.dataImportRun.findFirst({
      where: { id: requestedId, tenantId, status: { in: [DataRunStatus.SUCCESS, DataRunStatus.WARNING] } },
      select: { id: true },
    });
    if (!run) throw new DataTableApiError("Import run not found", 404, "IMPORT_NOT_FOUND");
    return run.id;
  }
  const source = await db.dataSource.findFirst({
    where: { tenantId, activeImportRunId: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { activeImportRunId: true },
  });
  if (!source?.activeImportRunId) {
    throw new DataTableApiError("No active data import", 409, "NO_ACTIVE_IMPORT");
  }
  return source.activeImportRunId;
}

async function resolveCalculationRun(
  db: DataTableDatabaseClient,
  tenantId: string,
  importRunId: string,
  requestedId: string | null
) {
  const run = await db.reportCalculationRun.findFirst({
    where: requestedId
      ? { id: requestedId, tenantId, importRunId, status: { in: [DataRunStatus.SUCCESS, DataRunStatus.WARNING] } }
      : {
          tenantId,
          importRunId,
          calculationVersion: ARTICLE_CALCULATION_VERSION,
          status: { in: [DataRunStatus.SUCCESS, DataRunStatus.WARNING] },
        },
    orderBy: { createdAt: "desc" },
    select: { id: true, importRunId: true, dateFrom: true, dateTo: true, asOfDate: true },
  });
  if (!run) throw new DataTableApiError("Calculated report not found", 409, "REPORT_NOT_CALCULATED");
  return run;
}

function pagination(page: number, pageSize: number, totalRows: number) {
  return { page, pageSize, totalRows, totalPages: Math.ceil(totalRows / pageSize) };
}

async function rawTable(
  db: DataTableDatabaseClient,
  tenantId: string,
  importRunId: string,
  sheetKey: "product_yml" | "zavod_api",
  query: DataTableQuery
): Promise<DataTableResponse> {
  const snapshot = await db.dataSheetSnapshot.findFirst({
    where: { tenantId, importRunId, sheetKey },
    select: { id: true, columns: true },
  });
  if (!snapshot) throw new DataTableApiError("Source sheet not found", 404, "SHEET_NOT_FOUND");
  const where = {
    tenantId,
    snapshotId: snapshot.id,
    ...(query.search ? { searchText: { contains: query.search, mode: "insensitive" as const } } : {}),
  };
  const [totalRows, rows] = await Promise.all([
    db.dataSheetRow.count({ where }),
    db.dataSheetRow.findMany({
      where,
      orderBy: { rowNumber: query.direction },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: { rowNumber: true, data: true },
    }),
  ]);
  return {
    sheetKey,
    columns: [{ key: "rowNumber", label: "Row", type: "number", defaultVisible: true }, ...rawColumns(snapshot.columns)],
    rows: rows.map((row) => ({ rowNumber: row.rowNumber, ...jsonObject(row.data) })),
    pagination: pagination(query.page, query.pageSize, totalRows),
    context: { importRunId, calculationRunId: null, dateFrom: null, dateTo: null, asOfDate: null },
  };
}

const ARTICLE_SORTS = new Set(ARTICLE_COLUMNS.map((column) => column.key));
const GROUP_METRIC_SORTS = groupedColumns("Brand")
  .map((column) => column.key)
  .filter((key) => key !== "brand");

async function articleTable(
  db: DataTableDatabaseClient,
  tenantId: string,
  importRunId: string,
  calculation: Awaited<ReturnType<typeof resolveCalculationRun>>,
  query: DataTableQuery
): Promise<DataTableResponse> {
  const sort = query.sort && ARTICLE_SORTS.has(query.sort) ? query.sort : "productId";
  const where = {
    tenantId,
    calculationRunId: calculation.id,
    ...(query.search ? {
      OR: ["productId", "article", "name", "brand", "category"].map((field) => ({
        [field]: { contains: query.search!, mode: "insensitive" as const },
      })),
    } : {}),
  };
  const [totalRows, rows, sourceSnapshot] = await Promise.all([
    db.articleReportResult.count({ where }),
    db.articleReportResult.findMany({
      where,
      orderBy: { [sort]: query.direction },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.dataSheetSnapshot.findFirst({
      where: { tenantId, importRunId, sheetKey: "article_report_source" },
      select: { columns: true },
    }),
  ]);
  const sourceColumns = rawColumns(sourceSnapshot?.columns ?? []).map((column) => ({
    ...column,
    key: `source_${column.key}`,
    label: `Source: ${column.label}`,
    sourceOnly: true,
    defaultVisible: false,
  }));
  return {
    sheetKey: "article_report",
    columns: [...ARTICLE_COLUMNS, ...sourceColumns],
    rows: rows.map((row) => {
      const sourceValues = jsonObject(row.sourceValues);
      const articleSource = jsonObject((sourceValues.articleReport ?? null) as Prisma.JsonValue);
      const sourceFields = Object.fromEntries(
        Object.entries(articleSource).map(([key, value]) => [`source_${key}`, value])
      );
      return toApiValue({
        productId: row.productId,
        article: row.article,
        name: row.name,
        brand: row.brand,
        category: row.category,
        costPrice: row.costPrice,
        rrp: row.rrp,
        retailPrice: row.retailPrice,
        discount: row.discount,
        gmPct: row.gmPct,
        salesUnits: row.salesUnits,
        salesUah: row.salesUah,
        costOfSalesUah: row.costOfSalesUah,
        gpUah: row.gpUah,
        salesGmPct: row.salesGmPct,
        stockUnits: row.stockUnits,
        stockUah: row.stockUah,
        strPct: row.strPct,
        avgSalesLastTwoWeeks: row.avgSalesLastTwoWeeks,
        woh: row.woh,
        ...sourceFields,
      }) as Record<string, unknown>;
    }),
    pagination: pagination(query.page, query.pageSize, totalRows),
    context: {
      importRunId,
      calculationRunId: calculation.id,
      dateFrom: dateString(calculation.dateFrom),
      dateTo: dateString(calculation.dateTo),
      asOfDate: dateString(calculation.asOfDate),
    },
  };
}

async function groupedTable(
  db: DataTableDatabaseClient,
  tenantId: string,
  importRunId: string,
  calculation: Awaited<ReturnType<typeof resolveCalculationRun>>,
  sheetKey: "by_brand" | "by_category",
  query: DataTableQuery
): Promise<DataTableResponse> {
  const isBrand = sheetKey === "by_brand";
  const label = isBrand ? "Brand" : "Category";
  const valueKey = isBrand ? "brand" : "category";
  const allowedSorts = new Set([valueKey, ...GROUP_METRIC_SORTS]);
  const sort = query.sort && allowedSorts.has(query.sort) ? query.sort : valueKey;
  const where = {
    tenantId,
    calculationRunId: calculation.id,
    ...(query.search ? { [valueKey]: { contains: query.search, mode: "insensitive" as const } } : {}),
  };
  const listArgs = {
    where,
    orderBy: { [sort]: query.direction },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
  const [totalRows, rows] = isBrand
    ? await Promise.all([
        db.brandReportResult.count({ where } as never),
        db.brandReportResult.findMany(listArgs as never),
      ])
    : await Promise.all([
        db.categoryReportResult.count({ where } as never),
        db.categoryReportResult.findMany(listArgs as never),
      ]);
  return {
    sheetKey,
    columns: groupedColumns(label),
    rows: (rows as unknown as Array<Record<string, unknown>>).map((row) => toApiValue({
      [valueKey]: row[valueKey] ?? null,
      salesUah: row.salesUah,
      salesUnits: row.salesUnits,
      costOfSalesUah: row.costOfSalesUah,
      gpUah: row.gpUah,
      stockUnits: row.stockUnits,
      stockUah: row.stockUah,
      strPct: row.strPct,
      salesSharePct: row.salesSharePct,
      avgSalesLastTwoWeeks: row.avgSalesLastTwoWeeks,
      woh: row.woh,
    }) as Record<string, unknown>),
    pagination: pagination(query.page, query.pageSize, totalRows),
    context: {
      importRunId,
      calculationRunId: calculation.id,
      dateFrom: dateString(calculation.dateFrom),
      dateTo: dateString(calculation.dateTo),
      asOfDate: dateString(calculation.asOfDate),
    },
  };
}

export async function getDataTable(
  tenantId: string,
  sheetKey: DataTableKey,
  query: DataTableQuery,
  db: DataTableDatabaseClient = prisma
): Promise<DataTableResponse> {
  const importRunId = await resolveImportRun(db, tenantId, query.importRunId);
  if (sheetKey === "product_yml" || sheetKey === "zavod_api") {
    return rawTable(db, tenantId, importRunId, sheetKey, query);
  }
  const calculation = await resolveCalculationRun(
    db,
    tenantId,
    importRunId,
    query.calculationRunId
  );
  if (sheetKey === "article_report") {
    return articleTable(db, tenantId, importRunId, calculation, query);
  }
  return groupedTable(db, tenantId, importRunId, calculation, sheetKey, query);
}
