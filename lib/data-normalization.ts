import { DataIssueSeverity, Prisma, ProductMatchStatus } from "@prisma/client";
import {
  kyivBusinessDate,
  type JsonCellValue,
  type ParsedRawRow,
  type ParsedRawSheet,
  type ParsedRawWorkbook,
} from "@/lib/data-import-workbook";

export interface NormalizedProduct {
  sourceRowNumber: number;
  productId: string;
  article: string | null;
  vendorCode: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  retailPrice: Prisma.Decimal;
  oldPrice: Prisma.Decimal | null;
  costPrice: Prisma.Decimal;
  stockUnits: Prisma.Decimal;
  sourceStatus: string | null;
  sourceValues: Record<string, JsonCellValue>;
}

export interface NormalizedSaleLine {
  sourceRowNumber: number;
  sourceLineId: string | null;
  orderId: string | null;
  rowHash: string;
  orderTime: Date | null;
  paymentDate: Date | null;
  statusId: number | null;
  productSku: string | null;
  productParameter: string | null;
  sourceProductId: string | null;
  manufacturer: string | null;
  quantity: Prisma.Decimal;
  salesAmount: Prisma.Decimal;
  costAmount: Prisma.Decimal;
  normalizedQuantity: Prisma.Decimal | null;
  normalizedSales: Prisma.Decimal | null;
  normalizedCost: Prisma.Decimal | null;
  matchStatus: ProductMatchStatus;
  matchMethod: string | null;
  resolvedProductId: string | null;
  sourceValues: Record<string, JsonCellValue>;
}

export interface NormalizationIssue {
  sheetKey: string;
  rowNumber: number;
  code: string;
  severity: DataIssueSeverity;
  message: string;
  context: Record<string, JsonCellValue>;
}

export interface NormalizedWorkbook {
  products: NormalizedProduct[];
  saleLines: NormalizedSaleLine[];
  issues: NormalizationIssue[];
  blockingIssues: NormalizationIssue[];
}

type RowReader = (row: ParsedRawRow, label: string) => JsonCellValue;

function sheetByKey(parsed: ParsedRawWorkbook, key: string): ParsedRawSheet {
  const sheet = parsed.sheets.find((candidate) => candidate.key === key);
  if (!sheet) throw new Error(`Parsed workbook is missing sheet key "${key}"`);
  return sheet;
}

function rowReader(sheet: ParsedRawSheet): RowReader {
  const keys = new Map(sheet.columns.map((column) => [column.label.trim(), column.key]));
  return (row, label) => {
    const key = keys.get(label);
    return key ? row.data[key] ?? "" : "";
  };
}

function text(value: JsonCellValue): string {
  return value === null ? "" : String(value).trim();
}

function optionalText(value: JsonCellValue): string | null {
  return text(value) || null;
}

function decimal(value: JsonCellValue): Prisma.Decimal | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const parsed = new Prisma.Decimal(candidate);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function integer(value: JsonCellValue): number | null {
  const candidate = text(value);
  if (!candidate) return null;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function dateTime(value: JsonCellValue): Date | null {
  const candidate = text(value);
  if (!candidate) return null;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function localDate(value: JsonCellValue): Date | null {
  const parsed = dateTime(value);
  return parsed ? kyivBusinessDate(parsed) : null;
}

function isBlankRow(row: ParsedRawRow): boolean {
  return Object.values(row.data).every((value) => value === "" || value === null);
}

function issue(
  sheetKey: string,
  rowNumber: number,
  code: string,
  severity: DataIssueSeverity,
  message: string,
  context: Record<string, JsonCellValue> = {}
): NormalizationIssue {
  return { sheetKey, rowNumber, code, severity, message, context };
}

function normalizeProducts(sheet: ParsedRawSheet): {
  products: NormalizedProduct[];
  issues: NormalizationIssue[];
  blockingIssues: NormalizationIssue[];
} {
  const read = rowReader(sheet);
  const candidates: NormalizedProduct[] = [];
  const issues: NormalizationIssue[] = [];
  const blockingIssues: NormalizationIssue[] = [];

  for (const row of sheet.rows) {
    if (isBlankRow(row)) continue;
    const productId = text(read(row, "ID"));
    const name = text(read(row, "Name"));
    const retailPrice = decimal(read(row, "Price"));
    const costPrice = decimal(read(row, "Vendor Price"));
    const stockUnits = decimal(read(row, "Stock Qty"));

    if (!productId) {
      blockingIssues.push(
        issue(sheet.key, row.rowNumber, "MISSING_PRODUCT_ID", DataIssueSeverity.ERROR, "Product ID is required")
      );
    }
    if (!name) {
      blockingIssues.push(
        issue(sheet.key, row.rowNumber, "MISSING_PRODUCT_NAME", DataIssueSeverity.ERROR, "Product name is required", { productId })
      );
    }
    const invalidDecimals = [
      ["Price", retailPrice],
      ["Vendor Price", costPrice],
      ["Stock Qty", stockUnits],
    ].filter((entry) => entry[1] === null).map((entry) => String(entry[0]));
    if (invalidDecimals.length > 0) {
      blockingIssues.push(
        issue(
          sheet.key,
          row.rowNumber,
          "INVALID_PRODUCT_DECIMAL",
          DataIssueSeverity.ERROR,
          `Invalid required product values: ${invalidDecimals.join(", ")}`,
          { productId, fields: invalidDecimals.join(", ") }
        )
      );
    }
    if (!productId || !name || !retailPrice || !costPrice || !stockUnits) continue;

    const article = optionalText(read(row, "Article"));
    const vendorCode = optionalText(read(row, "Vendor Code"));
    const brand = optionalText(read(row, "Vendor"));
    const category = optionalText(read(row, "Category"));
    const barcode = optionalText(read(row, "Barcode"));
    for (const [field, value] of [
      ["Article", article],
      ["Vendor Code", vendorCode],
      ["Vendor", brand],
      ["Category", category],
    ] as const) {
      if (!value) {
        issues.push(
          issue(
            sheet.key,
            row.rowNumber,
            `MISSING_${field.toUpperCase().replaceAll(" ", "_")}`,
            DataIssueSeverity.INFO,
            `Optional product field "${field}" is blank`,
            { productId, field }
          )
        );
      }
    }

    candidates.push({
      sourceRowNumber: row.rowNumber,
      productId,
      article,
      vendorCode,
      name,
      brand,
      category,
      barcode,
      retailPrice,
      oldPrice: decimal(read(row, "Old Price")),
      costPrice,
      stockUnits,
      sourceStatus: optionalText(read(row, "Status")),
      sourceValues: row.data,
    });
  }

  const byId = groupBy(candidates, (product) => product.productId);
  for (const [productId, duplicates] of byId) {
    if (duplicates.length < 2) continue;
    for (const product of duplicates) {
      blockingIssues.push(
        issue(
          sheet.key,
          product.sourceRowNumber,
          "DUPLICATE_PRODUCT_ID",
          DataIssueSeverity.ERROR,
          `Product ID "${productId}" is duplicated`,
          { productId, duplicateRows: duplicates.map((item) => item.sourceRowNumber).join(",") }
        )
      );
    }
  }

  return { products: candidates, issues, blockingIssues };
}

function groupBy<T>(values: T[], key: (value: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    if (!groupKey) continue;
    const group = groups.get(groupKey) ?? [];
    group.push(value);
    groups.set(groupKey, group);
  }
  return groups;
}

interface ProductMatch {
  status: ProductMatchStatus;
  method: string | null;
  productId: string | null;
}

function uniqueMatch(products: NormalizedProduct[] | undefined, method: string): ProductMatch | null {
  if (!products || products.length === 0) return null;
  if (products.length === 1) {
    return { status: ProductMatchStatus.MATCHED, method, productId: products[0].productId };
  }
  return { status: ProductMatchStatus.AMBIGUOUS, method, productId: null };
}

function compactIdentifier(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "").toLocaleLowerCase("uk-UA");
  return compact || null;
}

function productResolver(products: NormalizedProduct[]) {
  const ids = groupBy(products, (product) => product.productId);
  const idsLower = groupBy(products, (product) => product.productId.toLocaleLowerCase("uk-UA"));
  const articles = groupBy(products, (product) => product.article);
  const vendorCodes = groupBy(products, (product) => product.vendorCode);
  const barcodes = groupBy(products, (product) => product.barcode);
  const compactIdentifiers = new Map<string, Map<string, NormalizedProduct>>();
  for (const product of products) {
    for (const value of [product.productId, product.article, product.vendorCode, product.barcode]) {
      const key = compactIdentifier(value);
      if (!key) continue;
      const matches = compactIdentifiers.get(key) ?? new Map<string, NormalizedProduct>();
      matches.set(product.productId, product);
      compactIdentifiers.set(key, matches);
    }
  }

  const compactMatch = (value: string | null) => {
    const key = compactIdentifier(value);
    return key
      ? uniqueMatch([...(compactIdentifiers.get(key)?.values() ?? [])], "COMPACT_IDENTIFIER")
      : null;
  };

  return (sku: string | null, parameter: string | null, barcode: string | null): ProductMatch => {
    let ambiguousMatch: ProductMatch | null = null;
    const accept = (match: ProductMatch | null): ProductMatch | null => {
      if (!match) return null;
      if (match.status === ProductMatchStatus.MATCHED) return match;
      ambiguousMatch ??= match;
      return null;
    };

    if (sku) {
      const exactId = accept(uniqueMatch(ids.get(sku), "SKU_EXACT_ID"));
      if (exactId) return exactId;
      const insensitiveId = accept(
        uniqueMatch(idsLower.get(sku.toLocaleLowerCase("uk-UA")), "SKU_CASE_INSENSITIVE_ID")
      );
      if (insensitiveId) return insensitiveId;
    }
    if (parameter) {
      const exactId = accept(uniqueMatch(ids.get(parameter), "PARAMETER_EXACT_ID"));
      if (exactId) return exactId;
    }
    if (barcode) {
      const barcodeMatch = accept(uniqueMatch(barcodes.get(barcode), "BARCODE_EXACT"));
      if (barcodeMatch) return barcodeMatch;
    }
    if (sku) {
      const barcodeMatch = accept(uniqueMatch(barcodes.get(sku), "SKU_EXACT_BARCODE"));
      if (barcodeMatch) return barcodeMatch;
      const article = accept(uniqueMatch(articles.get(sku), "SKU_EXACT_ARTICLE"));
      if (article) return article;
    }
    if (parameter) {
      const fallback = new Map<string, NormalizedProduct>();
      for (const product of articles.get(parameter) ?? []) fallback.set(product.productId, product);
      for (const product of vendorCodes.get(parameter) ?? []) fallback.set(product.productId, product);
      const alternate = accept(
        uniqueMatch([...fallback.values()], "PARAMETER_ARTICLE_OR_VENDOR_CODE")
      );
      if (alternate) return alternate;
    }
    if (sku) {
      const compact = accept(compactMatch(sku));
      if (compact) return compact;
    }
    if (parameter) {
      const compact = accept(compactMatch(parameter));
      if (compact) return compact;
    }
    return ambiguousMatch ?? { status: ProductMatchStatus.UNMATCHED, method: null, productId: null };
  };
}

function normalizeSales(
  sheet: ParsedRawSheet,
  products: NormalizedProduct[]
): { saleLines: NormalizedSaleLine[]; issues: NormalizationIssue[] } {
  const read = rowReader(sheet);
  const resolve = productResolver(products);
  const rows = sheet.rows.filter((row) => !isBlankRow(row));
  const sourceIds = groupBy(rows, (row) => optionalText(read(row, "id")));
  const idRepresentsOrder = [...sourceIds.values()].some((matches) => {
    if (matches.length < 2) return false;
    const productKeys = new Set(
      matches.map((row) =>
        text(read(row, "product.sku")) ||
        text(read(row, "product.parameter")) ||
        text(read(row, "product.productId"))
      )
    );
    return productKeys.size > 1;
  });
  const rowIdentity = (row: ParsedRawRow) => {
    const sourceLineId = optionalText(read(row, "id"));
    return sourceLineId && !idRepresentsOrder
      ? `id:${sourceLineId}`
      : `hash:${row.rowHash}`;
  };
  const sourceProductCandidates = new Map<string, Set<string>>();
  for (const row of rows) {
    const sourceProductId = optionalText(read(row, "product.productId"));
    if (!sourceProductId) continue;
    const directMatch = resolve(
      optionalText(read(row, "product.sku")),
      optionalText(read(row, "product.parameter")),
      optionalText(read(row, "product.barcode"))
    );
    if (directMatch.status !== ProductMatchStatus.MATCHED || !directMatch.productId) continue;
    const matches = sourceProductCandidates.get(sourceProductId) ?? new Set<string>();
    matches.add(directMatch.productId);
    sourceProductCandidates.set(sourceProductId, matches);
  }
  const sourceProductAliases = new Map(
    [...sourceProductCandidates]
      .filter(([, productIds]) => productIds.size === 1)
      .map(([sourceProductId, productIds]) => [sourceProductId, [...productIds][0]])
  );
  const saleLines: NormalizedSaleLine[] = [];
  const issues: NormalizationIssue[] = [];
  const seenIdentities = new Set<string>();

  for (const row of rows) {
    const sourceLineId = optionalText(read(row, "id"));
    const identity = rowIdentity(row);
    const statusId = integer(read(row, "statusId"));
    const finalStatus = statusId === 5 || statusId === 7;
    const productSku = optionalText(read(row, "product.sku"));
    const productParameter = optionalText(read(row, "product.parameter"));
    const productBarcode = optionalText(read(row, "product.barcode"));
    const sourceProductId = optionalText(read(row, "product.productId"));
    const nonProductLine = [productSku, productParameter]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleUpperCase("uk-UA") === "COUPON");
    let match = resolve(productSku, productParameter, productBarcode);
    const aliasedProductId = sourceProductId ? sourceProductAliases.get(sourceProductId) : null;
    if (match.status === ProductMatchStatus.UNMATCHED && aliasedProductId) {
      match = {
        status: ProductMatchStatus.MATCHED,
        method: "SOURCE_PRODUCT_ID_ALIAS",
        productId: aliasedProductId,
      };
    }
    const quantity = decimal(read(row, "product.amount"));
    const salesAmount = decimal(read(row, "ProductPaymentAmount"));
    const costAmount = decimal(read(row, "ProductcostPriceAmount"));
    const paymentDateValue = read(row, "paymentDate");
    const explicitPaymentDate = localDate(paymentDateValue);
    const fallbackDateField = statusId === 7 ? "updateAt" : "orderTime";
    const fallbackDateValue = read(row, fallbackDateField);
    const fallbackPaymentDate = finalStatus && !explicitPaymentDate
      ? localDate(fallbackDateValue)
      : null;
    const paymentDate = explicitPaymentDate ?? fallbackPaymentDate;
    const duplicate = seenIdentities.has(identity);
    seenIdentities.add(identity);
    let excluded = duplicate || !finalStatus || !paymentDate || !quantity || !salesAmount || !costAmount;
    excluded ||= match.status !== ProductMatchStatus.MATCHED;

    if (duplicate) {
      issues.push(
        issue(sheet.key, row.rowNumber, "DUPLICATE_SALE_LINE", DataIssueSeverity.WARNING, "Duplicate source sale-line identity", { identity, sourceLineId: sourceLineId ?? "" })
      );
    }
    if (finalStatus && !paymentDate) {
      issues.push(
        issue(sheet.key, row.rowNumber, "INVALID_PAYMENT_DATE", DataIssueSeverity.WARNING, "Final transaction has no valid paymentDate or fallback date", { sourceLineId: sourceLineId ?? "", value: paymentDateValue, fallbackField: fallbackDateField, fallbackValue: fallbackDateValue })
      );
    }
    if (finalStatus && !explicitPaymentDate && fallbackPaymentDate) {
      issues.push(
        issue(sheet.key, row.rowNumber, "INFERRED_PAYMENT_DATE", DataIssueSeverity.INFO, `Final transaction uses ${fallbackDateField} as paymentDate`, { sourceLineId: sourceLineId ?? "", fallbackField: fallbackDateField, fallbackValue: fallbackDateValue })
      );
    }
    if (!finalStatus && text(paymentDateValue) && !paymentDate) {
      issues.push(
        issue(sheet.key, row.rowNumber, "INVALID_NON_FINAL_PAYMENT_DATE", DataIssueSeverity.INFO, "Non-final transaction has an invalid paymentDate", { sourceLineId: sourceLineId ?? "", value: paymentDateValue })
      );
    }
    if (finalStatus && (!quantity || !salesAmount || !costAmount)) {
      issues.push(
        issue(sheet.key, row.rowNumber, "INVALID_TRANSACTION_VALUE", DataIssueSeverity.WARNING, "Final transaction has an invalid quantity or amount", { sourceLineId: sourceLineId ?? "" })
      );
    }
    if (finalStatus && !nonProductLine && match.status === ProductMatchStatus.UNMATCHED) {
      issues.push(
        issue(sheet.key, row.rowNumber, "UNMATCHED_PRODUCT", DataIssueSeverity.WARNING, "Final transaction could not be matched to a product", { sourceLineId: sourceLineId ?? "", productSku: productSku ?? "", productParameter: productParameter ?? "" })
      );
    }
    if (finalStatus && match.status === ProductMatchStatus.AMBIGUOUS) {
      issues.push(
        issue(sheet.key, row.rowNumber, "AMBIGUOUS_PRODUCT_MATCH", DataIssueSeverity.WARNING, "Final transaction matches more than one product", { sourceLineId: sourceLineId ?? "", productSku: productSku ?? "", productParameter: productParameter ?? "", matchMethod: match.method ?? "" })
      );
    }

    const sign = statusId === 7 ? -1 : 1;
    saleLines.push({
      sourceRowNumber: row.rowNumber,
      sourceLineId,
      orderId: optionalText(read(row, "orderId")),
      rowHash: row.rowHash,
      orderTime: dateTime(read(row, "orderTime")),
      paymentDate,
      statusId,
      productSku,
      productParameter,
      sourceProductId,
      manufacturer: optionalText(read(row, "product.manufacturer")),
      quantity: quantity ?? new Prisma.Decimal(0),
      salesAmount: salesAmount ?? new Prisma.Decimal(0),
      costAmount: costAmount ?? new Prisma.Decimal(0),
      normalizedQuantity: excluded ? null : quantity!.abs().mul(sign),
      normalizedSales: excluded ? null : salesAmount!.abs().mul(sign),
      normalizedCost: excluded ? null : costAmount!.abs().mul(sign),
      matchStatus: match.status,
      matchMethod: match.method,
      resolvedProductId: match.productId,
      sourceValues: row.data,
    });
  }

  return { saleLines, issues };
}

export function normalizeRawWorkbook(parsed: ParsedRawWorkbook): NormalizedWorkbook {
  const productResult = normalizeProducts(sheetByKey(parsed, "product_yml"));
  const salesResult = normalizeSales(
    sheetByKey(parsed, "zavod_api"),
    productResult.products
  );
  return {
    products: productResult.products,
    saleLines: salesResult.saleLines,
    issues: [...productResult.issues, ...salesResult.issues],
    blockingIssues: productResult.blockingIssues,
  };
}
