import { parseRawWorkbook, sha256 } from "./data-import-workbook";
import {
  createMappingAnalyzer,
  suggestSheetsMapping,
} from "./connectors/sheets-mapping-validation";
import {
  compileSheetsProjection,
  sheetsOrderPolicy,
} from "./connectors/sheets-projection-compile";
import { normalizeOrder } from "./connectors/order-normalization";
import type { SheetsMappingInput } from "./sheets-mapping-contract";
/** Read-only workbook diagnosis. No database, provider call, approval or invented business acceptance. */
export function inspectSheetsOffline(buffer: Buffer, observedAt: string) {
  const workbook = parseRawWorkbook(buffer);
  const sheets = workbook.sheets.filter(
    (s) => s.key === "product_yml" || s.key === "zavod_api",
  );
  const input: SheetsMappingInput = {
    sourceId: "offline-sheet",
    fileId: "offline-file",
    timezone: "Europe/Kyiv",
    importRunId: "offline-run",
    sourceChecksum: sha256(buffer),
    importedAt: observedAt,
    sheets: sheets.map((s) => ({
      id: s.key,
      sheetKey: s.key,
      sourceName: s.sourceName,
      columns: s.columns,
      rowCount: s.rows.length,
      checksum: s.checksum,
    })),
  };
  const suggestion = suggestSheetsMapping(input);
  // XXX explicitly means no currency; this diagnostic cannot activate a mapping.
  const diagnostic = structuredClone(suggestion);
  diagnostic.policy.currency = "XXX";
  const products = sheets.find((s) => s.key === "product_yml")!.rows,
    orders = sheets.find((s) => s.key === "zavod_api")!.rows;
  const field = (
    row: { data: Record<string, unknown> },
    resource: "products" | "orders",
    name: string,
  ) => {
    const column = (diagnostic[resource] as Record<string, string | null>)[
      name
    ];
    const value = column ? row.data[column] : null;
    return value === null || value === undefined ? "" : String(value).trim();
  };
  const productIds = new Set(
    products.map((row) => field(row, "products", "productId")).filter(Boolean),
  );
  const productSkus = new Map<string, number>();
  for (const row of products) {
    const sku = field(row, "products", "sku");
    if (sku) productSkus.set(sku, (productSkus.get(sku) ?? 0) + 1);
  }
  const identity = {
    productIdMatched: 0,
    productIdUnmatched: 0,
    uniqueSkuMatched: 0,
    ambiguousSku: 0,
    unmatchedIdWithUniqueSku: 0,
  };
  for (const row of orders) {
    const id = field(row, "orders", "productId"),
      sku = field(row, "orders", "sku"),
      matched = !!id && productIds.has(id),
      skuCount = productSkus.get(sku) ?? 0;
    if (matched) identity.productIdMatched++;
    else if (id) identity.productIdUnmatched++;
    if (skuCount === 1) identity.uniqueSkuMatched++;
    if (skuCount > 1) identity.ambiguousSku++;
    if (id && !matched && skuCount === 1) identity.unmatchedIdWithUniqueSku++;
  }
  const analyzer = createMappingAnalyzer(diagnostic, input.timezone);
  analyzer.products(products);
  analyzer.orders(orders);
  const summary = analyzer.finish();
  const findings = new Set(summary.blockingErrors);
  for (const field of ["productId", "name", "quantity"] as const)
    if (!diagnostic.products[field])
      findings.add(`PRODUCT_COLUMN_REQUIRED:${field}`);
  for (const field of [
    "orderId",
    "statusId",
    "quantity",
    "salesAmount",
  ] as const)
    if (!diagnostic.orders[field])
      findings.add(`ORDER_COLUMN_REQUIRED:${field}`);
  if (!diagnostic.orders.productId && !diagnostic.orders.sku)
    findings.add("ORDER_PRODUCT_IDENTITY_REQUIRED");
  let structural: {
    products: number;
    orders: number;
    orderLines: number;
    quarantined: number;
    quarantinedRows: number;
    quarantinedProducts: number;
  } | null = null;
  let financialRows = 0;
  let skuOnlyDiagnostic: ReturnType<typeof compileSheetsProjection>["stats"] | null = null;
  if (!findings.size) {
    const compiled = compileSheetsProjection(input, diagnostic, {
      products,
      orders,
    });
    structural = compiled.stats;
    if (diagnostic.orders.sku) {
      const alternative = structuredClone(diagnostic);
      alternative.orders.productId = null;
      skuOnlyDiagnostic = compileSheetsProjection(input, alternative, {
        products,
        orders,
      }).stats;
    }
    const policy = sheetsOrderPolicy(diagnostic);
    for (const order of compiled.orders)
      for (const line of normalizeOrder(order, input.timezone, policy).lines)
        if (line.signedRevenue !== null || line.signedCost !== null)
          financialRows++;
  }
  return {
    version: 1,
    status: "REVIEW_REQUIRED" as const,
    workbookHash: input.sourceChecksum,
    observedAt,
    scope: "OFFLINE_STRUCTURE_ONLY" as const,
    sheets: sheets.map((s) => ({
      key: s.key,
      rows: s.rows.length,
      columns: s.columns.length,
      checksum: s.checksum,
    })),
    suggestedFields: {
      products: suggestion.products,
      orders: suggestion.orders,
    },
    issues: { ...summary, problems: undefined }, // Reports contain aggregate counts, never product/order values or raw rows.
    findings: [...findings],
    identity,
    structural,
    skuOnlyDiagnostic,
    financialRows,
    unapproved: [
      "CURRENCY",
      "STATUS_MEANINGS",
      "SALES_AMOUNT_BASIS",
      "COST_AMOUNT_BASIS",
      "STOCK_OBSERVATION",
      "PRODUCT_KINDS",
      "HISTORY_COVERAGE",
      "OWNERSHIP_AND_SUPPLIER_TERMS",
    ],
    liveSalesDriveVerified: false,
    activated: false,
  };
}
