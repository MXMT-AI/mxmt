import "server-only";
import { Temporal } from "@js-temporal/polyfill";
import { isRecord } from "@/lib/api-contracts";
import { parseOrderPolicy } from "../order-policy";
import { inventoryPolicy, normalizeCatalog } from "../inventory-normalization";
import { exact, normalizeOrder, sourceDate } from "../order-normalization";
import type {
  OrderDto,
  ReceiptDto,
  ProductDto,
  CatalogSnapshot,
  Dictionary,
} from "../contract";
import {
  CSV_FIELDS,
  CSV_REQUIRED,
  type CsvOptions,
  type CsvFileInput,
  type CsvResource,
} from "./schema";
import { parseCsv, CsvError, CSV_LIMITS } from "./parser";
export interface CsvIssue {
  resource: CsvResource;
  row: number;
  code: string;
  field?: string;
}
export interface CsvBundle {
  orders: OrderDto[];
  receipts: ReceiptDto[];
  catalogs: CatalogSnapshot[];
  statuses: Dictionary;
  channels: Dictionary;
}
export interface CsvPreview {
  errors: CsvIssue[];
  counts: Partial<Record<CsvResource, number>>;
  warnings: string[];
}
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
export function parseCsvOptions(v: unknown): CsvOptions {
  if (
    !isRecord(v) ||
    !keys(v, [
      "schemaVersion",
      "mappingRevision",
      "timezone",
      "catalog",
      "stock",
      "history",
      "receiptHistory",
      "discountUnit",
      "policy",
      "approved",
      "receiptBaseline",
    ]) ||
    v.schemaVersion !== 1 ||
    !Number.isSafeInteger(v.mappingRevision) ||
    Number(v.mappingRevision) < 1 ||
    Number(v.mappingRevision) > 1000000 ||
    typeof v.timezone !== "string" ||
    v.timezone.length > 100 ||
    !["complete", "partial"].includes(String(v.catalog)) ||
    !["complete", "partial"].includes(String(v.stock)) ||
    !["amount", "percentage"].includes(String(v.discountUnit)) ||
    v.approved !== true ||
    (v.receiptBaseline !== undefined &&
      typeof v.receiptBaseline !== "boolean") ||
    !isRecord(v.policy) ||
    !keys(v.policy, ["statuses", "channels", "amounts", "receipts"])
  )
    throw new CsvError("INVALID_OPTIONS");
  try {
    Temporal.Now.instant().toZonedDateTimeISO(v.timezone);
  } catch {
    throw new CsvError("INVALID_TIMEZONE");
  }
  const policy = parseOrderPolicy(v.policy);
  inventoryPolicy(v.policy);
  if (
    !policy.statuses ||
    !policy.channels ||
    !policy.amounts ||
    !/^[A-Z]{3}$/.test(policy.amounts.currency) ||
    Object.keys(policy.statuses).length > 100 ||
    Object.keys(policy.channels).length > 100 ||
    Object.keys(policy.statuses).some((k) => !/^(0|[1-9]\d{0,8})$/.test(k)) ||
    Object.keys(policy.channels).some((k) => !/^(0|[1-9]\d{0,8})$/.test(k))
  )
    throw new CsvError("INVALID_POLICY");
  for (const key of ["history", "receiptHistory"] as const) {
    const h = v[key];
    if (
      h !== null &&
      (!isRecord(h) ||
        !keys(h, ["from", "to", "complete"]) ||
        typeof h.complete !== "boolean" ||
        typeof h.from !== "string" ||
        typeof h.to !== "string" ||
        !instant(h.from) ||
        !instant(h.to) ||
        Date.parse(h.from) > Date.parse(h.to) ||
        Date.parse(h.to) > Date.now())
    )
      throw new CsvError("INVALID_HISTORY");
  }
  if (
    v.receiptBaseline === true &&
    (!isRecord(v.receiptHistory) || v.receiptHistory.complete !== true)
  )
    throw new CsvError("INVALID_RECEIPT_BASELINE");
  const r = (v.policy as any).receipts;
  if (
    r &&
    (r.productIdField !== "id" ||
      r.currency !== policy.amounts.currency ||
      Object.keys(r.suppliers).length > 100)
  )
    throw new CsvError("INVALID_POLICY");
  return v as unknown as CsvOptions;
}
const instant = (s: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s) &&
  Boolean(sourceDate(s, "UTC").date);
function date(
  s: string,
  timezone: string,
  required = false,
  timestamp = false,
): string | null {
  if (!s) {
    if (required) throw new CsvError("REQUIRED_VALUE");
    return null;
  }
  if (
    !(
      instant(s) ||
      (!timestamp &&
        /^\d{4}-\d{2}-\d{2}$/.test(s) &&
        sourceDate(s, timezone).date)
    )
  )
    throw new CsvError("INVALID_DATE");
  if (timestamp && Date.parse(s) > Date.now() + 300000)
    throw new CsvError("FUTURE_OBSERVATION");
  return s;
}
function id(s: string, required = true) {
  if (!s && !required) return null;
  if (!s || s.length > 200 || s !== s.trim() || /[\u0000-\u001f\u007f]/.test(s))
    throw new CsvError("INVALID_ID");
  return s;
}
function money(s: string, signed = false) {
  if (s === "") return null;
  const n = exact(s);
  if (!n || (!signed && n.isNegative())) throw new CsvError("INVALID_DECIMAL");
  return s;
}
export function compileCsv(
  files: unknown,
  options: CsvOptions,
): { bundle: CsvBundle; preview: CsvPreview; files: CsvFileInput[] } {
  const bundle: CsvBundle = {
    orders: [],
    receipts: [],
    catalogs: [],
    statuses: { entries: [], complete: false, reason: "NOT_UPLOADED" },
    channels: { entries: [], complete: false, reason: "NOT_UPLOADED" },
  };
  const preview: CsvPreview = {
    errors: [],
    counts: {},
    warnings: ["CSV_OWNER_MAPPING_REQUIRED", "OWNERSHIP_NOT_INFERRED"],
  };
  if (!Array.isArray(files) || !files.length || files.length > 6)
    throw new CsvError("INVALID_FILES");
  let bytesTotal = 0,
    rowsTotal = 0;
  const resources = new Set<string>();
  const tables = new Map<
    CsvResource,
    Array<{ row: number; v: Record<string, string> }>
  >();
  for (const f of files) {
    if (
      !isRecord(f) ||
      !keys(f, ["resource", "bytes", "delimiter", "columns"]) ||
      typeof f.resource !== "string" ||
      !Object.hasOwn(CSV_FIELDS, f.resource) ||
      resources.has(f.resource) ||
      typeof f.bytes !== "string" ||
      f.bytes.length > Math.ceil(CSV_LIMITS.fileBytes / 3) * 4 ||
      !isRecord(f.columns) ||
      Object.keys(f.columns).some(
        (k) =>
          !(
            CSV_FIELDS[f.resource as CsvResource] as readonly string[]
          ).includes(k),
      )
    )
      throw new CsvError("INVALID_FILES");
    resources.add(f.resource);
    const resource = f.resource as CsvResource;
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        f.bytes,
      )
    )
      throw new CsvError("INVALID_ENCODING");
    const bytes = Buffer.from(f.bytes, "base64");
    if (bytes.toString("base64") !== f.bytes)
      throw new CsvError("INVALID_ENCODING");
    bytesTotal += bytes.length;
    if (bytesTotal > CSV_LIMITS.totalBytes)
      throw new CsvError("UPLOAD_TOO_LARGE");
    try {
      const parsed = parseCsv(bytes, f.delimiter as CsvFileInput["delimiter"]);
      rowsTotal += parsed.rows.length;
      if (rowsTotal > CSV_LIMITS.rows) throw new CsvError("TOO_MANY_ROWS");
      for (const field of CSV_REQUIRED[resource])
        if (
          typeof f.columns[field] !== "string" ||
          !parsed.headers.includes(f.columns[field] as string)
        )
          throw new CsvError("REQUIRED_COLUMN", 1, field);
      for (const [field, h] of Object.entries(f.columns))
        if (typeof h !== "string" || !parsed.headers.includes(h))
          throw new CsvError("UNKNOWN_COLUMN", 1, field);
      preview.counts[resource] = parsed.rows.length;
      tables.set(
        resource,
        parsed.rows.map((r) => ({
          row: r.row,
          v: Object.fromEntries(
            Object.entries(f.columns as Record<string, string>).map(
              ([field, h]) => [field, r.cells[h]],
            ),
          ),
        })),
      );
    } catch (e) {
      const err = e instanceof CsvError ? e : new CsvError("INVALID_FILE");
      preview.errors.push({
        resource,
        row: err.row,
        code: err.code,
        ...(err.field ? { field: err.field } : {}),
      });
    }
  }
  const each = (
    resource: CsvResource,
    fn: (v: Record<string, string>, row: number) => void,
  ) => {
    for (const r of tables.get(resource) ?? [])
      try {
        fn(r.v, r.row);
      } catch (e) {
        if (preview.errors.length < 50) {
          const err = e instanceof CsvError ? e : new CsvError("INVALID_ROW");
          preview.errors.push({
            resource,
            row: r.row,
            code: err.code,
            ...(err.field ? { field: err.field } : {}),
          });
        }
      }
  };
  const products = new Map<string, ProductDto>(),
    skus = new Set<string>();
  each("products", (v) => {
    const productId = id(v.productId)!,
      sku = id(v.sku)!;
    if (products.has(productId) || skus.has(sku))
      throw new CsvError("DUPLICATE_ID");
    if (!v.name || v.name.length > 1000) throw new CsvError("INVALID_NAME");
    products.set(productId, {
      externalId: productId,
      sku,
      name: v.name,
      barcode: id(v.barcode ?? "", false),
      brand: id(v.brand ?? "", false),
      categoryId: id(v.categoryId ?? "", false),
      categoryName: v.categoryName || null,
      observedAt: date(v.observedAt, options.timezone, true, true)!,
      updatedAt: null,
      retailPrice: money(v.retailPrice ?? ""),
      oldPrice: money(v.oldPrice ?? ""),
      costPrice: null,
      currency: options.policy.amounts.currency,
      raw: { ...v },
    });
    skus.add(sku);
  });
  const stock = new Map<
      string,
      Array<{ product: ProductDto; quantity: string | null }>
    >(),
    stockKeys = new Set<string>();
  each("stock", (v) => {
    const product = products.get(id(v.productId)!);
    if (!product) throw new CsvError("PRODUCT_NOT_IN_UPLOAD");
    const at = new Date(
      date(v.observedAt, options.timezone, true, true)!,
    ).toISOString();
    if (Date.parse(product.observedAt) > Date.parse(at))
      throw new CsvError("PRODUCT_OBSERVED_AFTER_STOCK");
    const key = JSON.stringify([product.externalId, at]);
    if (stockKeys.has(key)) throw new CsvError("DUPLICATE_ID");
    stockKeys.add(key);
    const entries = stock.get(at) ?? [];
    entries.push({ product, quantity: money(v.quantity ?? "", true) });
    stock.set(at, entries);
  });
  if (
    resources.has("products") !== resources.has("stock") ||
    (products.size > 0 && stock.size === 0)
  )
    preview.errors.push({
      resource: "stock",
      row: 0,
      code: "PRODUCTS_AND_STOCK_REQUIRED",
    });
  if (options.catalog === "partial" || options.stock === "partial")
    preview.warnings.push("PARTIAL_POPULATION_NO_HISTORY");
  for (const [at, entries] of [...stock].sort(
    ([a], [b]) => Date.parse(a) - Date.parse(b),
  )) {
    if (
      options.catalog === "complete" &&
      options.stock === "complete" &&
      entries.length !== products.size
    ) {
      preview.errors.push({
        resource: "stock",
        row: 0,
        code: "INCOMPLETE_POPULATION",
      });
      continue;
    }
    const snapshot: CatalogSnapshot = {
      completePopulation:
        options.catalog === "complete" && options.stock === "complete",
      observationId: at,
      perRowObservations: true,
      observedAt: new Date(
        Math.max(
          Date.parse(at),
          ...entries.map((e) => Date.parse(e.product.observedAt)),
        ),
      ).toISOString(),
      products: entries.map((e) => e.product),
      stock: entries.map((e) => ({
        externalId: e.product.externalId,
        productId: e.product.externalId,
        quantity: undefined,
        onHand: e.quantity,
        inTransit: null,
        observedAt: at,
        updatedAt: null,
      })),
      rawResponse: JSON.stringify(entries),
    };
    try {
      normalizeCatalog(snapshot, "csv-preview", "csv");
      bundle.catalogs.push(snapshot);
    } catch {
      preview.errors.push({
        resource: "stock",
        row: 0,
        code: "INVALID_CATALOG",
      });
    }
  }
  const orderGroups = new Map<string, OrderDto>(),
    orderLines = new Set<string>();
  each("orders", (v) => {
    const orderId = id(v.orderId)!,
      eventId = id(v.eventId)!,
      lineId = id(v.lineId)!;
    const key = JSON.stringify([orderId, eventId]),
      lineKey = JSON.stringify([key, lineId]);
    if (orderLines.has(lineKey)) throw new CsvError("DUPLICATE_ID");
    orderLines.add(lineKey);
    const statusId = id(v.statusId)!;
    if (!Object.hasOwn(options.policy.statuses, statusId))
      throw new CsvError("STATUS_MAPPING_REQUIRED");
    if (v.channelId && !Object.hasOwn(options.policy.channels, v.channelId))
      throw new CsvError("CHANNEL_MAPPING_REQUIRED");
    const updatedAt = date(v.updatedAt, options.timezone, true, true)!;
    const header = {
      externalId: key,
      statusId,
      channelId: v.channelId || null,
      orderedAt: date(v.orderedAt, options.timezone, true),
      paidAt: date(v.paidAt ?? "", options.timezone),
      returnedAt: date(v.returnedAt ?? "", options.timezone),
      updatedAt,
      observedAt: updatedAt,
    };
    const previous = orderGroups.get(key);
    if (
      previous &&
      JSON.stringify({ ...previous, lines: [], raw: undefined }) !==
        JSON.stringify({ ...header, lines: [] })
    )
      throw new CsvError("INCONSISTENT_DOCUMENT");
    const order = previous ?? {
      ...header,
      lines: [],
      raw: { orderId, eventId },
    };
    const kind = options.policy.statuses[statusId];
    if (
      (kind === "SALE" && !header.paidAt) ||
      (kind === "RETURN" && !header.returnedAt)
    )
      throw new CsvError("EVENT_DATE_REQUIRED");
    const discount = money(v.discount ?? "");
    if (
      discount !== null &&
      options.discountUnit === "percentage" &&
      Number(discount) > 100
    )
      throw new CsvError("INVALID_DISCOUNT");
    order.lines.push({
      externalLineId: lineId,
      productId: id(v.productId)!,
      sku: id(v.sku ?? "", false),
      quantity: money(v.quantity, true),
      unitPrice: money(v.unitPrice),
      discount,
      discountUnit: options.discountUnit,
      commission: null,
      commissionUnit: "unknown",
      costPrice: money(v.costPrice ?? ""),
    });
    const normalized = normalizeOrder(order, options.timezone, options.policy);
    if (!normalized.valid) throw new CsvError("INVALID_ORDER");
    for (const warning of normalized.issues)
      if (!preview.warnings.includes(warning)) preview.warnings.push(warning);
    orderGroups.set(key, order);
  });
  bundle.orders = [...orderGroups.values()].map((o) => ({
    ...o,
    raw: {
      ...o.raw,
      lines: o.lines,
      statusId: o.statusId,
      channelId: o.channelId,
      orderedAt: o.orderedAt,
      paidAt: o.paidAt,
      returnedAt: o.returnedAt,
      updatedAt: o.updatedAt,
    },
  }));
  const receiptGroups = new Map<string, ReceiptDto>(),
    receiptLines = new Set<string>();
  each("receipts", (v) => {
    if (!options.policy.receipts)
      throw new CsvError("RECEIPT_MAPPING_REQUIRED");
    const documentId = id(v.documentId)!,
      lineId = id(v.lineId)!,
      key = JSON.stringify([documentId, lineId]);
    if (receiptLines.has(key)) throw new CsvError("DUPLICATE_ID");
    receiptLines.add(key);
    if (
      ![
        "supplier_receipt",
        "transfer",
        "write_off",
        "inventory_adjustment",
        "unknown",
      ].includes(v.movementType)
    )
      throw new CsvError("INVALID_MOVEMENT");
    const updatedAt = date(v.updatedAt, options.timezone, true, true)!;
    const header = {
      externalId: documentId,
      supplierId: id(v.supplierId)!,
      statusId: id(v.statusId)!,
      movementType: v.movementType as ReceiptDto["movementType"],
      receivedAt: date(v.receivedAt, options.timezone, true),
      updatedAt,
      observedAt: updatedAt,
      postingVerified: false as const,
    };
    if (options.receiptBaseline && options.receiptHistory) {
      const at = sourceDate(
        header.receivedAt,
        options.timezone,
      ).date!.getTime();
      if (
        at < Date.parse(options.receiptHistory.from) ||
        at > Date.parse(options.receiptHistory.to)
      )
        throw new CsvError("RECEIPT_OUTSIDE_BASELINE");
    }
    const previous = receiptGroups.get(documentId);
    if (
      previous &&
      JSON.stringify({ ...previous, lines: [], raw: undefined }) !==
        JSON.stringify({ ...header, lines: [] })
    )
      throw new CsvError("INCONSISTENT_DOCUMENT");
    const receipt = previous ?? { ...header, lines: [], raw: { documentId } };
    const quantity = money(v.quantity, true);
    if (quantity === null) throw new CsvError("INVALID_DECIMAL");
    receipt.lines.push({
      externalLineId: lineId,
      productId: id(v.productId)!,
      sku: id(v.sku ?? "", false),
      quantity,
      unitCost: money(v.unitCost),
    });
    receiptGroups.set(documentId, receipt);
  });
  bundle.receipts = [...receiptGroups.values()].map((r) => ({
    ...r,
    raw: {
      ...r.raw,
      lines: r.lines,
      statusId: r.statusId,
      supplierId: r.supplierId,
      movementType: r.movementType,
      receivedAt: r.receivedAt,
      updatedAt: r.updatedAt,
    },
  }));
  for (const resource of ["statuses", "channels"] as const) {
    const ids = new Set<string>();
    each(resource, (v) => {
      const key = id(v.id)!;
      if (ids.has(key)) throw new CsvError("DUPLICATE_ID");
      ids.add(key);
      if (!v.name || v.name.length > 200) throw new CsvError("INVALID_NAME");
      bundle[resource].entries.push({ id: key, name: v.name });
    });
    if (resources.has(resource))
      bundle[resource] = {
        ...bundle[resource],
        complete: false,
        reason: "UPLOADED_DICTIONARY_PARTIAL",
      };
  }
  if (!rowsTotal)
    preview.errors.push({
      resource: files[0].resource,
      row: 1,
      code: "EMPTY_UPLOAD",
    });
  if (options.history?.complete && !resources.has("orders"))
    preview.errors.push({
      resource: "orders",
      row: 0,
      code: "HISTORY_REQUIRES_FILE",
    });
  if (options.receiptHistory?.complete && !resources.has("receipts"))
    preview.errors.push({
      resource: "receipts",
      row: 0,
      code: "HISTORY_REQUIRES_FILE",
    });
  preview.errors = preview.errors.slice(0, 50);
  return { bundle, preview, files: files as CsvFileInput[] };
}
