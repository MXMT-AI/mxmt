import type {
  CatalogSnapshot,
  OrderDto,
  ProductDto,
  StockDto,
} from "./contract";
import type {
  SheetsFieldMapping,
  SheetsMappingInput,
} from "../sheets-mapping-contract";
import {
  exact,
  normalizeOrder,
  sourceDate,
  type OrderPolicy,
} from "./order-normalization";
import { payloadHash } from "./order-storage";
export interface SheetsProjectionRow {
  rowNumber: number;
  data: Record<string, unknown>;
}
const scalar = (v: unknown): string | null =>
  typeof v === "string"
    ? v.trim() || null
    : typeof v === "number" && Number.isFinite(v)
      ? String(v)
      : null;
const bounded = (v: unknown, max: number) => {
  const s = scalar(v);
  return s && s.length <= max && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(s) ? s : null;
};
export function isCompilableSheetsProduct(id: unknown, name: unknown) {
  return Boolean(bounded(id, 200) && bounded(name, 1000));
}
import { sheetsOrderPolicy } from "./sheets-order-policy";
export { sheetsOrderPolicy } from "./sheets-order-policy";
/** Compile selected immutable columns only. No status, date, history or ownership inference. */
export function compileSheetsProjection(
  input: SheetsMappingInput,
  mapping: SheetsFieldMapping,
  rows: { products: SheetsProjectionRow[]; orders: SheetsProjectionRow[] },
  policy: OrderPolicy = sheetsOrderPolicy(mapping),
) {
  const read = (
    row: SheetsProjectionRow,
    resource: "products" | "orders",
    field: string,
  ) => {
    const key = (mapping[resource] as Record<string, string | null>)[field];
    return key ? scalar(row.data[key]) : null;
  };
  const money = (v: string | null, signed = false) => {
    const d = exact(v);
    return d && (signed || !d.isNegative()) ? d.toString() : null;
  };
  const issues = new Set<string>([
    "HISTORY_COVERAGE_NOT_CONFIRMED",
    "RECEIPT_EVIDENCE_NOT_IMPORTED",
  ]);
  const products: ProductDto[] = [],
    stock: StockDto[] = [],
    kinds: Record<string, string> = Object.create(null),
    stockProductIds: string[] = [];
  const skuCounts = new Map<string, number>();
  for (const row of rows.products) {
    const sku = read(row, "products", "sku");
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
  }
  const byId = new Map<string, ProductDto>(),
    bySku = new Map<string, string>();
  let quarantinedProducts = 0;
  for (const row of rows.products) {
    const id = bounded(read(row, "products", "productId"), 200),
      name = bounded(read(row, "products", "name"), 1000);
    if (!id || !name) {
      quarantinedProducts++;
      issues.add("SHEETS_PRODUCT_QUARANTINED");
      continue;
    }
    if (byId.has(id)) throw new Error("DUPLICATE_CATALOG_ID");
    const sourceSku = bounded(read(row, "products", "sku"), 200),
      sku = sourceSku && skuCounts.get(sourceSku) === 1 ? sourceSku : null;
    if (sourceSku && !sku) issues.add("PRODUCT_SKU_AMBIGUOUS");
    const category = bounded(read(row, "products", "category"), 200);
    // Hash only the category identity; retain its real human-readable name separately.
    const product: ProductDto = {
      externalId: id,
      observedAt: input.importedAt,
      updatedAt: null,
      sku,
      name,
      barcode: bounded(read(row, "products", "barcode"), 200),
      brand: bounded(read(row, "products", "brand"), 200),
      categoryId: category ? payloadHash(category) : null,
      categoryName: category,
      retailPrice: money(read(row, "products", "retailPrice")),
      costPrice: money(read(row, "products", "costPrice")),
      currency: mapping.policy.currency,
      raw: {
        snapshotId: input.sheets.find((s) => s.sheetKey === "product_yml")!.id,
        rowNumber: row.rowNumber,
        fields: row.data,
      },
    };
    let observedAt = input.importedAt,
      verified = mapping.policy.stockObservation === "import_observation";
    if (mapping.policy.stockObservation === "column") {
      const date = sourceDate(
        read(row, "products", "observedAt"),
        input.timezone,
      ).date;
      verified = !!date && date.getTime() <= Date.parse(input.importedAt);
      if (verified) observedAt = date!.toISOString();
      else issues.add("STOCK_OBSERVATION_UNVERIFIED");
    }
    if (verified) stockProductIds.push(id);
    products.push(product);
    stock.push({
      externalId: id,
      productId: id,
      observedAt,
      updatedAt: null,
      onHand: money(read(row, "products", "quantity")),
      inTransit: money(read(row, "products", "inTransit")),
    });
    // An unverified source default must not erase an existing manual classification.
    // Explicit category overrides (including UNKNOWN) and an approved merchandise default apply.
    if (category && Object.hasOwn(mapping.policy.productKinds, category))
      kinds[id] = mapping.policy.productKinds[category];
    else if (mapping.policy.defaultProductKind !== "UNKNOWN")
      kinds[id] = mapping.policy.defaultProductKind;
    byId.set(id, product);
    if (sku) bySku.set(sku, id);
  }
  if (!products.length) throw new Error("EMPTY_PRODUCT_SNAPSHOT");
  const grouped = new Map<string, SheetsProjectionRow[]>();
  let quarantinedRows = 0;
  for (const row of rows.orders) {
    const id = bounded(read(row, "orders", "orderId"), 200);
    if (!id) {
      quarantinedRows++;
      issues.add("SHEETS_ORDER_ID_MISSING");
      continue;
    }
    const group = grouped.get(id) ?? [];
    group.push(row);
    grouped.set(id, group);
  }
  const orders: OrderDto[] = [];
  let quarantinedOrders = 0;
  for (const [externalId, group] of grouped) {
    if (group.length > 1000) {
      quarantinedOrders++;
      quarantinedRows += group.length;
      issues.add("SHEETS_ORDER_TOO_LARGE");
      continue;
    }
    let invalid = false;
    const first = group[0],
      orderValue = (field: string) => read(first, "orders", field);
    for (const field of [
      "statusId",
      "channelId",
      "orderedAt",
      "paidAt",
      "returnedAt",
      "updatedAt",
    ])
      if (group.some((row) => read(row, "orders", field) !== orderValue(field)))
        invalid = true;
    const identities = new Set<string>();
    const lines = group.map((row) => {
      const id = read(row, "orders", "productId"),
        sku = read(row, "orders", "sku"),
        matchedBySku = sku ? bySku.get(sku) : null;
      const product = id && byId.has(id) ? id : !id ? matchedBySku : null;
      if (!product || (id && matchedBySku && id !== matchedBySku))
        invalid = true;
      const identity =
        mapping.policy.lineIdentity === "column"
          ? bounded(read(row, "orders", "lineId"), 200)
          : product;
      if (!identity || identities.has(identity)) invalid = true;
      else identities.add(identity);
      const quantity = read(row, "orders", "quantity"),
        amount = read(row, "orders", "salesAmount"),
        cost = read(row, "orders", "costAmount");
      const status = orderValue("statusId") ?? "";
      const kind = policy.statuses && Object.hasOwn(policy.statuses, status)
        ? policy.statuses[status]
        : "UNKNOWN";
      const q = exact(quantity),
        a = exact(amount);
      if (
        !q ||
        q.isZero() ||
        !a ||
        (!["RETURN", "CORRECTION"].includes(kind) &&
          (q.isNegative() || a.isNegative()))
      )
        invalid = true;
      return {
        externalLineId: identity ?? null,
        productId: product ?? null,
        sku: sku && matchedBySku === product ? sku : null,
        quantity,
        unitPrice: mapping.policy.salesAmount === "net_unit" ? amount : null,
        netLineAmount:
          mapping.policy.salesAmount === "net_line" ? amount : null,
        costPrice: mapping.policy.costAmount === "unit" ? cost : null,
        costLineAmount: mapping.policy.costAmount === "line" ? cost : null,
        discount: null,
        discountUnit: "unknown" as const,
        commission: null,
        commissionUnit: "unknown" as const,
      };
    });
    const order: OrderDto = {
      externalId,
      observedAt: input.importedAt,
      updatedAt: orderValue("updatedAt"),
      statusId: orderValue("statusId"),
      channelId: orderValue("channelId"),
      orderedAt: orderValue("orderedAt"),
      paidAt: orderValue("paidAt"),
      returnedAt: orderValue("returnedAt"),
      lines,
      raw: {
        snapshotId: input.sheets.find((s) => s.sheetKey === "zavod_api")!.id,
        rows: group.map((row) => ({
          rowNumber: row.rowNumber,
          fields: row.data,
        })),
      },
    };
    const normalized = normalizeOrder(order, input.timezone, policy);
    if (
      !normalized.valid ||
      normalized.lines.some((l) =>
        [l.netAmount, l.costAmount, l.signedRevenue, l.signedCost].some(
          (a) => a !== null && a.decimalPlaces() > 4,
        ),
      )
    )
      invalid = true;
    // An invalid or ambiguous whole order cannot replace only some of its lines.
    if (invalid) {
      quarantinedOrders++;
      quarantinedRows += group.length;
      issues.add("SHEETS_ORDER_QUARANTINED");
      continue;
    }
    orders.push(order);
  }
  const catalog: CatalogSnapshot = {
    products,
    stock,
    rawResponse: JSON.stringify({
      input,
      mappingVersion: 1,
      mappingHash: payloadHash(mapping),
    }),
    observedAt: input.importedAt,
    perRowObservations: true,
    completePopulation: false,
  };
  return {
    catalog,
    orders,
    kinds,
    stockProductIds,
    issues: [...issues],
    stats: {
      products: products.length,
      orders: orders.length,
      orderLines: orders.reduce((n, o) => n + o.lines.length, 0),
      quarantined: quarantinedOrders,
      quarantinedRows,
      quarantinedProducts,
    },
  };
}
