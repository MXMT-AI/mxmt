import { DataRunStatus, Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { kyivBusinessDate } from "@/lib/data-import-workbook";
import { calculateGroupedReportRows } from "@/lib/grouped-reports";

export const ARTICLE_CALCULATION_VERSION = 2;
const ARTICLE_RESULT_BATCH_SIZE = 500;
const ONE = new Prisma.Decimal(1);
const TWO = new Prisma.Decimal(2);

type DecimalInput = Prisma.Decimal | string | number;

export interface ArticleProductInput {
  productId: string;
  article: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  retailPrice: DecimalInput;
  oldPrice: DecimalInput | null;
  costPrice: DecimalInput;
  stockUnits: DecimalInput;
  sourceValues?: Prisma.JsonValue;
}

export interface ArticleSaleInput {
  paymentDate: Date | null;
  resolvedProductId: string | null;
  normalizedQuantity: DecimalInput | null;
  normalizedSales: DecimalInput | null;
  normalizedCost: DecimalInput | null;
}

export interface ArticleReportPeriod {
  dateFrom: Date;
  dateTo: Date;
  asOfDate: Date;
  rollingFrom: Date;
  rollingTo: Date;
}

export interface ArticleReportRow {
  productId: string;
  article: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  costPrice: Prisma.Decimal;
  rrp: Prisma.Decimal;
  retailPrice: Prisma.Decimal;
  discount: Prisma.Decimal | null;
  gmPct: Prisma.Decimal | null;
  salesUnits: Prisma.Decimal;
  salesUah: Prisma.Decimal;
  costOfSalesUah: Prisma.Decimal;
  gpUah: Prisma.Decimal;
  salesGmPct: Prisma.Decimal | null;
  stockUnits: Prisma.Decimal;
  stockUah: Prisma.Decimal;
  strPct: Prisma.Decimal | null;
  avgSalesLastTwoWeeks: Prisma.Decimal;
  woh: Prisma.Decimal | null;
  sourceValues: Prisma.InputJsonValue;
}

export interface ArticleCalculationWarning {
  code: "NEGATIVE_CALCULATED_METRIC" | "DUPLICATE_ARTICLE_SOURCE_ID";
  count: number;
  productIds: string[];
}

export interface ArticleCalculationResult {
  outcome: "calculated" | "cached";
  calculationRunId: string;
  importRunId: string;
  status: DataRunStatus;
  rowCount: number;
  brandRowCount: number;
  categoryRowCount: number;
  period: ArticleReportPeriod;
  warnings: ArticleCalculationWarning[];
}

export class ArticleReportPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArticleReportPeriodError";
  }
}

export class ArticleReportImportError extends Error {
  constructor() {
    super("The source import is not successful or does not belong to this tenant");
    this.name = "ArticleReportImportError";
  }
}

export class ArticleCalculationInProgressError extends Error {
  constructor() {
    super("An ARTICLE REPORT calculation is already running for this cache key");
    this.name = "ArticleCalculationInProgressError";
  }
}

type ArticleDatabaseClient = Pick<
  PrismaClient,
  | "dataImportRun"
  | "dataSheetSnapshot"
  | "sourceProduct"
  | "sourceSaleLine"
  | "reportCalculationRun"
  | "articleReportResult"
  | "brandReportResult"
  | "categoryReportResult"
>;

function decimal(value: DecimalInput): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

function divide(numerator: Prisma.Decimal, denominator: Prisma.Decimal): Prisma.Decimal | null {
  return denominator.isZero() ? null : numerator.div(denominator);
}

function subtractDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - days));
}

function calendarDate(value: Date | string, field: string): Date {
  if (typeof value !== "string") {
    if (Number.isNaN(value.getTime())) throw new ArticleReportPeriodError(`${field} is invalid`);
    return kyivBusinessDate(value);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ArticleReportPeriodError(`${field} must use YYYY-MM-DD format`);
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value) {
    throw new ArticleReportPeriodError(`${field} is invalid`);
  }
  return result;
}

export function resolveArticleReportPeriod({
  dateFrom,
  dateTo,
  asOfDate,
  now = new Date(),
}: {
  dateFrom?: Date | string;
  dateTo?: Date | string;
  asOfDate?: Date | string;
  now?: Date;
} = {}): ArticleReportPeriod {
  const resolvedAsOf = asOfDate ? calendarDate(asOfDate, "asOfDate") : kyivBusinessDate(now);
  const defaultFrom = new Date(Date.UTC(resolvedAsOf.getUTCFullYear(), resolvedAsOf.getUTCMonth(), 1));
  const defaultTo = new Date(Date.UTC(resolvedAsOf.getUTCFullYear(), resolvedAsOf.getUTCMonth() + 1, 0));
  const resolvedFrom = dateFrom ? calendarDate(dateFrom, "dateFrom") : defaultFrom;
  const resolvedTo = dateTo ? calendarDate(dateTo, "dateTo") : defaultTo;
  if (resolvedFrom.getTime() > resolvedTo.getTime()) {
    throw new ArticleReportPeriodError("dateFrom must not be after dateTo");
  }
  return {
    dateFrom: resolvedFrom,
    dateTo: resolvedTo,
    asOfDate: resolvedAsOf,
    rollingFrom: subtractDays(resolvedAsOf, 14),
    rollingTo: subtractDays(resolvedAsOf, 1),
  };
}

interface Totals {
  units: Prisma.Decimal;
  sales: Prisma.Decimal;
  cost: Prisma.Decimal;
  rollingUnits: Prisma.Decimal;
}

function totals(): Totals {
  return {
    units: new Prisma.Decimal(0),
    sales: new Prisma.Decimal(0),
    cost: new Prisma.Decimal(0),
    rollingUnits: new Prisma.Decimal(0),
  };
}

function inRange(value: Date, from: Date, to: Date): boolean {
  const time = value.getTime();
  return time >= from.getTime() && time <= to.getTime();
}

export function calculateArticleReportRows(
  products: ArticleProductInput[],
  saleLines: ArticleSaleInput[],
  period: ArticleReportPeriod,
  articleSourceValues: ReadonlyMap<string, Prisma.JsonValue> = new Map()
): ArticleReportRow[] {
  const byProduct = new Map<string, Totals>();

  for (const saleLine of saleLines) {
    if (
      !saleLine.paymentDate ||
      !saleLine.resolvedProductId ||
      saleLine.normalizedQuantity === null ||
      saleLine.normalizedSales === null ||
      saleLine.normalizedCost === null
    ) continue;
    const aggregate = byProduct.get(saleLine.resolvedProductId) ?? totals();
    if (inRange(saleLine.paymentDate, period.dateFrom, period.dateTo)) {
      aggregate.units = aggregate.units.add(decimal(saleLine.normalizedQuantity));
      aggregate.sales = aggregate.sales.add(decimal(saleLine.normalizedSales));
      aggregate.cost = aggregate.cost.add(decimal(saleLine.normalizedCost));
    }
    if (inRange(saleLine.paymentDate, period.rollingFrom, period.rollingTo)) {
      aggregate.rollingUnits = aggregate.rollingUnits.add(decimal(saleLine.normalizedQuantity));
    }
    byProduct.set(saleLine.resolvedProductId, aggregate);
  }

  return products.map((product) => {
    const retailPrice = decimal(product.retailPrice);
    const costPrice = decimal(product.costPrice);
    const stockUnits = decimal(product.stockUnits);
    const rrp = product.oldPrice === null ? retailPrice : decimal(product.oldPrice);
    const aggregate = byProduct.get(product.productId) ?? totals();
    const gpUah = aggregate.sales.sub(aggregate.cost);
    const avgSalesLastTwoWeeks = aggregate.rollingUnits.div(TWO);
    const sourceValues = {
      product: product.sourceValues ?? {},
      articleReport: articleSourceValues.get(product.productId) ?? null,
    } as Prisma.InputJsonValue;

    return {
      productId: product.productId,
      article: product.article,
      name: product.name,
      brand: product.brand,
      category: product.category,
      costPrice,
      rrp,
      retailPrice,
      discount: divide(retailPrice, rrp)?.sub(ONE) ?? null,
      gmPct: divide(costPrice, retailPrice)?.mul(-1).add(ONE) ?? null,
      salesUnits: aggregate.units,
      salesUah: aggregate.sales,
      costOfSalesUah: aggregate.cost,
      gpUah,
      salesGmPct: divide(aggregate.cost, aggregate.sales)?.mul(-1).add(ONE) ?? null,
      stockUnits,
      stockUah: costPrice.mul(stockUnits),
      strPct: divide(aggregate.units, aggregate.units.add(stockUnits)),
      avgSalesLastTwoWeeks,
      woh: divide(stockUnits, avgSalesLastTwoWeeks),
      sourceValues,
    };
  });
}

function calculationWarnings(rows: ArticleReportRow[]): ArticleCalculationWarning[] {
  const affected = rows.filter((row) =>
    [row.salesUnits, row.salesUah, row.costOfSalesUah, row.gpUah, row.avgSalesLastTwoWeeks]
      .some((value) => value.isNegative()) ||
    [row.salesGmPct, row.strPct, row.woh].some((value) => value?.isNegative())
  );
  return affected.length === 0
    ? []
    : [{
        code: "NEGATIVE_CALCULATED_METRIC",
        count: affected.length,
        productIds: affected.slice(0, 100).map((row) => row.productId),
      }];
}

function articleSourceMap(snapshot: {
  columns: Prisma.JsonValue;
  rows: Array<{ data: Prisma.JsonValue }>;
} | null): { values: Map<string, Prisma.JsonValue>; duplicateIds: string[] } {
  if (!snapshot || !Array.isArray(snapshot.columns)) return { values: new Map(), duplicateIds: [] };
  const idColumn = snapshot.columns.find((column) =>
    typeof column === "object" && column !== null && "label" in column && column.label === "ID"
  );
  if (!idColumn || typeof idColumn !== "object" || !("key" in idColumn) || typeof idColumn.key !== "string") {
    return { values: new Map(), duplicateIds: [] };
  }
  const values = new Map<string, Prisma.JsonValue>();
  const duplicateIds = new Set<string>();
  for (const row of snapshot.rows) {
    if (typeof row.data !== "object" || row.data === null || Array.isArray(row.data)) continue;
    const id = String(row.data[idColumn.key] ?? "").trim();
    if (!id) continue;
    if (values.has(id)) duplicateIds.add(id);
    else values.set(id, row.data);
  }
  return { values, duplicateIds: [...duplicateIds] };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function cachedResult(
  db: ArticleDatabaseClient,
  run: { id: string; status: DataRunStatus; warnings: Prisma.JsonValue },
  importRunId: string,
  period: ArticleReportPeriod
): Promise<ArticleCalculationResult> {
  if (run.status === DataRunStatus.RUNNING || run.status === DataRunStatus.PENDING) {
    throw new ArticleCalculationInProgressError();
  }
  if (run.status === DataRunStatus.FAILED) throw new Error("FAILED_CALCULATION_CAN_RETRY");
  const [rowCount, brandRowCount, categoryRowCount] = await Promise.all([
    db.articleReportResult.count({ where: { calculationRunId: run.id } }),
    db.brandReportResult.count({ where: { calculationRunId: run.id } }),
    db.categoryReportResult.count({ where: { calculationRunId: run.id } }),
  ]);
  return {
    outcome: "cached",
    calculationRunId: run.id,
    importRunId,
    status: run.status,
    rowCount,
    brandRowCount,
    categoryRowCount,
    period,
    warnings: (run.warnings ?? []) as unknown as ArticleCalculationWarning[],
  };
}

export async function calculateArticleReport(
  {
    tenantId,
    importRunId,
    dateFrom,
    dateTo,
    asOfDate,
    now,
    calculationVersion = ARTICLE_CALCULATION_VERSION,
  }: {
    tenantId: string;
    importRunId: string;
    dateFrom?: Date | string;
    dateTo?: Date | string;
    asOfDate?: Date | string;
    now?: Date;
    calculationVersion?: number;
  },
  db: ArticleDatabaseClient = prisma
): Promise<ArticleCalculationResult> {
  const period = resolveArticleReportPeriod({ dateFrom, dateTo, asOfDate, now });
  const sourceImport = await db.dataImportRun.findFirst({
    where: {
      id: importRunId,
      tenantId,
      status: { in: [DataRunStatus.SUCCESS, DataRunStatus.WARNING] },
    },
    select: { id: true },
  });
  if (!sourceImport) throw new ArticleReportImportError();

  const cacheWhere = {
    tenantId,
    importRunId,
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    asOfDate: period.asOfDate,
    calculationVersion,
  };
  let run = await db.reportCalculationRun.findFirst({
    where: cacheWhere,
    select: { id: true, status: true, warnings: true },
  });
  if (run && run.status !== DataRunStatus.FAILED) {
    return cachedResult(db, run, importRunId, period);
  }

  let resetFailedResults = false;
  if (run) {
    const claimed = await db.reportCalculationRun.updateMany({
      where: { id: run.id, tenantId, status: DataRunStatus.FAILED },
      data: {
        status: DataRunStatus.RUNNING,
        warnings: [],
        errorMessage: null,
        startedAt: now ?? new Date(),
        completedAt: null,
      },
    });
    if (claimed.count !== 1) throw new ArticleCalculationInProgressError();
    resetFailedResults = true;
  } else {
    try {
      run = await db.reportCalculationRun.create({
        data: {
          tenantId,
          importRunId,
          dateFrom: period.dateFrom,
          dateTo: period.dateTo,
          asOfDate: period.asOfDate,
          calculationVersion,
          status: DataRunStatus.RUNNING,
          startedAt: now ?? new Date(),
        },
        select: { id: true, status: true, warnings: true },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const concurrent = await db.reportCalculationRun.findFirst({
        where: cacheWhere,
        select: { id: true, status: true, warnings: true },
      });
      if (!concurrent) throw error;
      return cachedResult(db, concurrent, importRunId, period);
    }
  }

  const calculationRunId = run.id;
  try {
    if (resetFailedResults) {
      await Promise.all([
        db.articleReportResult.deleteMany({ where: { calculationRunId, tenantId } }),
        db.brandReportResult.deleteMany({ where: { calculationRunId, tenantId } }),
        db.categoryReportResult.deleteMany({ where: { calculationRunId, tenantId } }),
      ]);
    }
    const [products, saleLines, sourceSnapshot] = await Promise.all([
      db.sourceProduct.findMany({ where: { tenantId, importRunId } }),
      db.sourceSaleLine.findMany({
        where: {
          tenantId,
          importRunId,
          paymentDate: {
            gte: period.dateFrom < period.rollingFrom ? period.dateFrom : period.rollingFrom,
            lte: period.dateTo > period.rollingTo ? period.dateTo : period.rollingTo,
          },
          normalizedQuantity: { not: null },
          normalizedSales: { not: null },
          normalizedCost: { not: null },
          resolvedProductId: { not: null },
        },
      }),
      db.dataSheetSnapshot.findUnique({
        where: { importRunId_sheetKey: { importRunId, sheetKey: "article_report_source" } },
        select: { columns: true, rows: { select: { data: true } } },
      }),
    ]);
    const source = articleSourceMap(sourceSnapshot);
    const rows = calculateArticleReportRows(products, saleLines, period, source.values);
    const brandRows = calculateGroupedReportRows(rows, "brand");
    const categoryRows = calculateGroupedReportRows(rows, "category");
    const warnings = calculationWarnings(rows);
    if (source.duplicateIds.length > 0) {
      warnings.push({
        code: "DUPLICATE_ARTICLE_SOURCE_ID",
        count: source.duplicateIds.length,
        productIds: source.duplicateIds.slice(0, 100),
      });
    }

    for (let index = 0; index < rows.length; index += ARTICLE_RESULT_BATCH_SIZE) {
      const batch = rows.slice(index, index + ARTICLE_RESULT_BATCH_SIZE);
      await db.articleReportResult.createMany({
        data: batch.map((row) => ({ ...row, tenantId, calculationRunId })),
      });
    }
    for (let index = 0; index < brandRows.length; index += ARTICLE_RESULT_BATCH_SIZE) {
      const batch = brandRows.slice(index, index + ARTICLE_RESULT_BATCH_SIZE);
      await db.brandReportResult.createMany({
        data: batch.map((row) => ({
          tenantId,
          calculationRunId,
          groupKey: row.groupKey,
          brand: row.groupValue,
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
        })),
      });
    }
    for (let index = 0; index < categoryRows.length; index += ARTICLE_RESULT_BATCH_SIZE) {
      const batch = categoryRows.slice(index, index + ARTICLE_RESULT_BATCH_SIZE);
      await db.categoryReportResult.createMany({
        data: batch.map((row) => ({
          tenantId,
          calculationRunId,
          groupKey: row.groupKey,
          category: row.groupValue,
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
        })),
      });
    }

    const status = warnings.length > 0 ? DataRunStatus.WARNING : DataRunStatus.SUCCESS;
    await db.reportCalculationRun.update({
      where: { id: calculationRunId },
      data: {
        status,
        warnings: warnings as unknown as Prisma.InputJsonValue,
        errorMessage: null,
        completedAt: new Date(),
      },
    });
    return {
      outcome: "calculated",
      calculationRunId,
      importRunId,
      status,
      rowCount: rows.length,
      brandRowCount: brandRows.length,
      categoryRowCount: categoryRows.length,
      period,
      warnings,
    };
  } catch (error) {
    await db.reportCalculationRun.update({
      where: { id: calculationRunId },
      data: {
        status: DataRunStatus.FAILED,
        errorMessage: (error instanceof Error ? error.message : String(error)).slice(0, 4_000),
        completedAt: new Date(),
      },
    }).catch(() => undefined);
    throw error;
  }
}
