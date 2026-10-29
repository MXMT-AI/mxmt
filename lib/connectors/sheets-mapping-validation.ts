import "server-only";
import { isRecord } from "../api-contracts";
import { sourceDate, exact } from "./order-normalization";
import { payloadHash } from "./order-storage";
import {
  SHEETS_PRODUCT_FIELDS,
  SHEETS_ORDER_FIELDS,
  SHEETS_EVENT_KINDS,
  type SheetsFieldMapping,
  type SheetsMappingInput,
  type SheetsMappingSummary,
} from "../sheets-mapping-contract";
export class SheetsMappingError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}
const fail = () => {
  throw new SheetsMappingError("INVALID_SHEETS_MAPPING");
};
const only = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).sort().join() === keys.slice().sort().join();
export const mappingText = (v: unknown, max = 200): v is string =>
  typeof v === "string" &&
  !!v.trim() &&
  v.length <= max &&
  !/[<>\p{Cc}\p{Cf}\p{Cs}]/u.test(v);
export const mappingId = (v: unknown): string => {
  if (typeof v !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v))
    throw new SheetsMappingError("INVALID_SHEETS_MAPPING_ID");
  return v;
};
export function parseSheetsMapping(value: unknown): SheetsFieldMapping {
  if (
    !isRecord(value) ||
    !only(value, ["version", "products", "orders", "policy"]) ||
    value.version !== 1 ||
    !isRecord(value.products) ||
    !isRecord(value.orders) ||
    !isRecord(value.policy)
  )
    return fail();
  for (const [key, fields] of [
    ["products", SHEETS_PRODUCT_FIELDS],
    ["orders", SHEETS_ORDER_FIELDS],
  ] as const) {
    const v = value[key];
    if (
      !isRecord(v) ||
      !only(v, fields) ||
      Object.values(v).some(
        (c) =>
          c !== null && (typeof c !== "string" || !/^col_[a-z]{1,4}$/.test(c)),
      )
    )
      return fail();
  }
  const p = value.policy;
  if (
    !only(p, [
      "statuses",
      "channels",
      "currency",
      "salesAmount",
      "costAmount",
      "lineIdentity",
      "stockObservation",
      "stockReference",
      "defaultProductKind",
      "productKinds",
    ]) ||
    !isRecord(p.statuses) ||
    !isRecord(p.channels) ||
    !isRecord(p.productKinds) ||
    Object.keys(p.statuses).length > 100 ||
    Object.keys(p.channels).length > 100 ||
    Object.keys(p.productKinds).length > 200 ||
    Object.entries(p.statuses).some(
      ([id, kind]) =>
        !/^(0|[1-9]\d{0,8})$/.test(id) ||
        !SHEETS_EVENT_KINDS.includes(kind as never),
    ) ||
    Object.entries(p.channels).some(
      ([id, name]) => !/^(0|[1-9]\d{0,8})$/.test(id) || !mappingText(name),
    ) ||
    Object.entries(p.productKinds).some(
      ([name, kind]) =>
        !mappingText(name) ||
        !["UNKNOWN", "MERCHANDISE", "SERVICE", "GIFT_CARD"].includes(
          String(kind),
        ),
    ) ||
    typeof p.currency !== "string" ||
    !/^[A-Z]{3}$/.test(p.currency) ||
    !["net_line", "net_unit"].includes(String(p.salesAmount)) ||
    !["line", "unit", "unavailable"].includes(String(p.costAmount)) ||
    !["column", "order_product"].includes(String(p.lineIdentity)) ||
    !["unverified", "column", "import_observation"].includes(
      String(p.stockObservation),
    ) ||
    typeof p.stockReference !== "string" ||
    p.stockReference.length > 1000 ||
    (p.stockReference !== "" && !mappingText(p.stockReference, 1000)) ||
    (p.stockObservation !== "unverified" &&
      !mappingText(p.stockReference, 1000)) ||
    !["UNKNOWN", "MERCHANDISE"].includes(String(p.defaultProductKind))
  )
    return fail();
  const m = value as unknown as SheetsFieldMapping;
  if (
    ["productId", "name", "quantity"].some(
      (k) => !m.products[k as keyof typeof m.products],
    ) ||
    ["orderId", "statusId", "quantity", "salesAmount"].some(
      (k) => !m.orders[k as keyof typeof m.orders],
    ) ||
    (!m.orders.productId && !m.orders.sku) ||
    (p.lineIdentity === "column" && !m.orders.lineId) ||
    (p.stockObservation === "column" && !m.products.observedAt) ||
    (p.costAmount !== "unavailable" && !m.orders.costAmount) ||
    (Object.values(p.statuses).some(
      (k) => k === "SALE" || k === "CORRECTION",
    ) &&
      !m.orders.paidAt) ||
    (Object.values(p.statuses).includes("RETURN") && !m.orders.returnedAt)
  )
    return fail();
  return structuredClone(m);
}
export const sheetsSchemaHash = (input: SheetsMappingInput) =>
  payloadHash(
    input.sheets.map((s) => ({ sheetKey: s.sheetKey, columns: s.columns })),
  );
export function validateMappingColumns(
  mapping: SheetsFieldMapping,
  input: SheetsMappingInput,
) {
  for (const [resource, key] of [
    ["products", "product_yml"],
    ["orders", "zavod_api"],
  ] as const) {
    const sheet = input.sheets.find((s) => s.sheetKey === key);
    if (!sheet)
      throw new SheetsMappingError("SHEETS_REQUIRED_SNAPSHOT_MISSING", 409);
    const keys = new Set(sheet.columns.map((c) => c.key));
    if (
      Object.values(mapping[resource]).some(
        (column) => column !== null && !keys.has(column),
      )
    )
      throw new SheetsMappingError("SHEETS_MAPPING_COLUMN_NOT_FOUND", 422);
  }
}
export function suggestSheetsMapping(
  input: SheetsMappingInput,
): SheetsFieldMapping {
  const fields = (key: string, names: Record<string, string[]>) => {
    const columns = input.sheets.find((s) => s.sheetKey === key)?.columns ?? [];
    return Object.fromEntries(
      Object.entries(names).map(([field, labels]) => {
        for (const label of labels) {
          const matches = columns.filter((c) => c.label.trim() === label);
          if (matches.length === 1) return [field, matches[0].key];
        }
        return [field, null];
      }),
    );
  };
  const products = fields("product_yml", {
    productId: ["ID"],
    sku: ["Article"],
    name: ["Name"],
    brand: ["Vendor"],
    category: ["Category"],
    barcode: ["Barcode"],
    retailPrice: ["Price"],
    costPrice: ["Vendor Price"],
    quantity: ["Stock Qty"],
    inTransit: [],
    observedAt: [],
  });
  const orders = fields("zavod_api", {
    orderId: ["orderId", "id"],
    lineId: [],
    productId: ["product.productId"],
    sku: ["product.sku"],
    statusId: ["statusId"],
    channelId: ["channelId"],
    orderedAt: ["orderTime"],
    paidAt: ["paymentDate"],
    returnedAt: [],
    updatedAt: ["updateAt"],
    quantity: ["product.amount"],
    salesAmount: ["ProductPaymentAmount"],
    costAmount: ["ProductcostPriceAmount"],
  });
  return {
    version: 1,
    products,
    orders,
    policy: {
      statuses: {},
      channels: {},
      currency: "",
      salesAmount: "net_line",
      costAmount: "line",
      lineIdentity: "order_product",
      stockObservation: "unverified",
      stockReference: "",
      defaultProductKind: "UNKNOWN",
      productKinds: {},
    },
  } as unknown as SheetsFieldMapping;
}
export function emptyMappingSummary(): SheetsMappingSummary {
  return {
    counts: { products: 0, orders: 0 },
    invalidRows: { products: 0, orders: 0 },
    unmappedStatuses: 0,
    unverifiedProductKinds: 0,
    duplicateProductIds: 0,
    duplicateOrderLines: 0,
    statusCounts: Object.create(null),
    channelCounts: Object.create(null),
    categoryCounts: Object.create(null),
    problems: [],
    problemCount: 0,
    blockingErrors: [],
    warnings: [],
  };
}
type Row = { rowNumber: number; data: Record<string, unknown> };
const text = (v: unknown) =>
  v === null || v === undefined ? "" : String(v).trim();
export function createMappingAnalyzer(
  mapping: SheetsFieldMapping,
  timezone: string,
) {
  const summary = emptyMappingSummary(),
    products = new Set<string>(),
    productSkus = new Map<string, string | null>(),
    orders = new Set<string>();
  const problem = (
    code: string,
    resource: "products" | "orders",
    row: number,
    field?: string,
  ) => {
    summary.problemCount++;
    if (summary.problems.length < 100)
      summary.problems.push({ code, resource, row, field });
  };
  const date = (v: unknown) =>
    typeof v === "string" && sourceDate(v, timezone).date !== null;
  const number = (v: unknown, positive = false) => {
    const n = exact(
      typeof v === "string" || typeof v === "number" ? String(v).trim() : null,
    );
    return n !== null && (positive ? n.gt(0) : n.gte(0));
  };
  const count = (
    dictionary: Record<string, number>,
    key: string,
    limit: number,
  ) => {
    if (
      !Object.hasOwn(dictionary, key) &&
      Object.keys(dictionary).length >= limit
    ) {
      if (!summary.blockingErrors.includes("MAPPING_DICTIONARY_LIMIT"))
        summary.blockingErrors.push("MAPPING_DICTIONARY_LIMIT");
      return;
    }
    dictionary[key] = (dictionary[key] ?? 0) + 1;
  };
  const read = (row: Row, field: string, resource: "products" | "orders") => {
    const key = (mapping[resource] as Record<string, string | null>)[field];
    return key ? row.data[key] : null;
  };
  return {
    summary,
    products(rows: Row[]) {
      for (const row of rows) {
        summary.counts.products++;
        const before = summary.problemCount,
          id = text(read(row, "productId", "products")),
          sku = text(read(row, "sku", "products"));
        if (!id)
          problem("PRODUCT_ID_MISSING", "products", row.rowNumber, "productId");
        else if (products.has(id)) {
          summary.duplicateProductIds++;
          problem(
            "PRODUCT_ID_DUPLICATE",
            "products",
            row.rowNumber,
            "productId",
          );
        } else products.add(id);
        if (sku) {
          if (productSkus.has(sku) && productSkus.get(sku) !== id) {
            productSkus.set(sku, null);
            problem("PRODUCT_SKU_AMBIGUOUS", "products", row.rowNumber, "sku");
          } else if (!productSkus.has(sku)) productSkus.set(sku, id);
        }
        if (!text(read(row, "name", "products")))
          problem("PRODUCT_NAME_MISSING", "products", row.rowNumber, "name");
        if (!number(read(row, "quantity", "products")))
          problem(
            "STOCK_QUANTITY_INVALID",
            "products",
            row.rowNumber,
            "quantity",
          );
        for (const field of ["retailPrice", "costPrice", "inTransit"] as const)
          if (mapping.products[field] && !number(read(row, field, "products")))
            problem(
              "PRODUCT_VALUE_UNAVAILABLE",
              "products",
              row.rowNumber,
              field,
            );
        if (
          mapping.policy.stockObservation === "column" &&
          !date(read(row, "observedAt", "products"))
        )
          problem(
            "STOCK_OBSERVATION_UNVERIFIED",
            "products",
            row.rowNumber,
            "observedAt",
          );
        const category = text(read(row, "category", "products"));
        if (mappingText(category)) count(summary.categoryCounts, category, 200);
        const kind = Object.hasOwn(mapping.policy.productKinds, category)
          ? mapping.policy.productKinds[category]
          : mapping.policy.defaultProductKind;
        if (kind === "UNKNOWN") summary.unverifiedProductKinds++;
        if (summary.problemCount > before) summary.invalidRows.products++;
      }
    },
    orders(rows: Row[]) {
      for (const row of rows) {
        summary.counts.orders++;
        const before = summary.problemCount,
          status = text(read(row, "statusId", "orders")),
          kind = Object.hasOwn(mapping.policy.statuses, status)
            ? mapping.policy.statuses[status]
            : "UNKNOWN";
        if (/^(0|[1-9]\d{0,8})$/.test(status))
          count(summary.statusCounts, status, 100);
        const order = text(read(row, "orderId", "orders")),
          product = text(read(row, "productId", "orders")),
          sku = text(read(row, "sku", "orders"));
        if (!order)
          problem("ORDER_ID_MISSING", "orders", row.rowNumber, "orderId");
        const matchedById = product && products.has(product) ? product : null,
          matchedBySku = sku ? productSkus.get(sku) : null;
        if (product && !matchedById)
          problem(
            "ORDER_PRODUCT_UNMATCHED",
            "orders",
            row.rowNumber,
            "productId",
          );
        else if (!matchedById && !matchedBySku)
          problem("ORDER_PRODUCT_UNMATCHED", "orders", row.rowNumber, "sku");
        else if (matchedById && matchedBySku && matchedById !== matchedBySku)
          problem(
            "ORDER_PRODUCT_IDENTITY_CONFLICT",
            "orders",
            row.rowNumber,
            "productId",
          );
        const line =
          mapping.policy.lineIdentity === "column"
            ? text(read(row, "lineId", "orders"))
            : matchedById || matchedBySku || product || sku;
        if (!line)
          problem("ORDER_LINE_ID_MISSING", "orders", row.rowNumber, "lineId");
        else if (order) {
          const key = JSON.stringify([order, line]);
          if (orders.has(key)) {
            summary.duplicateOrderLines++;
            problem("ORDER_LINE_AMBIGUOUS", "orders", row.rowNumber, "lineId");
          } else orders.add(key);
        }
        if (kind === "UNKNOWN") {
          summary.unmappedStatuses++;
          problem("ORDER_STATUS_UNMAPPED", "orders", row.rowNumber, "statusId");
        } else {
          const quantity = exact(text(read(row, "quantity", "orders")));
          if (
            !quantity ||
            quantity.isZero() ||
            (!["RETURN", "CORRECTION"].includes(kind) && quantity.isNegative())
          )
            problem(
              "ORDER_QUANTITY_INVALID",
              "orders",
              row.rowNumber,
              "quantity",
            );
          if (
            !exact(text(read(row, "salesAmount", "orders"))) ||
            (!["RETURN", "CORRECTION"].includes(kind) &&
              !number(read(row, "salesAmount", "orders")))
          )
            problem(
              "ORDER_AMOUNT_INVALID",
              "orders",
              row.rowNumber,
              "salesAmount",
            );
          const cost = exact(text(read(row, "costAmount", "orders")));
          if (
            mapping.policy.costAmount !== "unavailable" &&
            (!cost ||
              cost.isZero() ||
              (!["RETURN", "CORRECTION"].includes(kind) && cost.isNegative()))
          )
            problem(
              "ORDER_COST_UNAVAILABLE",
              "orders",
              row.rowNumber,
              "costAmount",
            );
          if (
            ["SALE", "CORRECTION"].includes(kind) &&
            !date(read(row, "paidAt", "orders"))
          )
            problem(
              kind === "SALE"
                ? "SALE_DATE_UNVERIFIED"
                : "CORRECTION_DATE_UNVERIFIED",
              "orders",
              row.rowNumber,
              "paidAt",
            );
          if (kind === "RETURN" && !date(read(row, "returnedAt", "orders")))
            problem(
              "RETURN_DATE_UNVERIFIED",
              "orders",
              row.rowNumber,
              "returnedAt",
            );
        }
        const channel = text(read(row, "channelId", "orders"));
        if (/^(0|[1-9]\d{0,8})$/.test(channel))
          count(summary.channelCounts, channel, 100);
        if (channel && !Object.hasOwn(mapping.policy.channels, channel))
          problem(
            "ORDER_CHANNEL_UNMAPPED",
            "orders",
            row.rowNumber,
            "channelId",
          );
        if (summary.problemCount > before) summary.invalidRows.orders++;
      }
    },
    finish() {
      if (summary.duplicateProductIds)
        summary.blockingErrors.push("DUPLICATE_PRODUCT_IDENTITIES");
      if (!summary.counts.products)
        summary.blockingErrors.push("EMPTY_PRODUCT_SNAPSHOT");
      if (summary.duplicateOrderLines)
        summary.warnings.push("AMBIGUOUS_ORDER_LINES_REQUIRE_QUARANTINE");
      if (summary.unmappedStatuses)
        summary.warnings.push("UNMAPPED_STATUSES_EXCLUDED");
      if (summary.unverifiedProductKinds)
        summary.warnings.push("PRODUCT_KIND_REVIEW_REQUIRED");
      if (mapping.policy.stockObservation === "unverified")
        summary.warnings.push("STOCK_OBSERVATION_UNVERIFIED");
      if (mapping.policy.stockObservation === "import_observation")
        summary.warnings.push(
          "STOCK_IS_IMPORT_OBSERVATION_NOT_HISTORICAL_CLOSE",
        );
      if (!mapping.products.inTransit)
        summary.warnings.push("IN_TRANSIT_UNKNOWN");
      summary.warnings.push(
        "HISTORY_COVERAGE_NOT_CONFIRMED",
        "OWNERSHIP_AND_SUPPLIER_TERMS_REQUIRE_SETTINGS",
        "RECEIPT_EVIDENCE_NOT_IMPORTED",
      );
      return summary;
    },
  };
}
