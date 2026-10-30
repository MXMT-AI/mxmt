export const ZAVOD_RECEIPT_COLUMNS = {
  documentId: "ID документа", date: "Дата", movementType: "Тип",
  quantity: "Позиція: Кількість", unitPrice: "Позиція: Ціна",
  productId: "Товар: ID", sku: "Товар: Артикул (SKU)",
  supplierId: "Контрагент: ID", warehouseId: "ID складу", sourceWarehouseId: "ID складу-джерела",
} as const;
export const RECEIPT_PREVIEW_MAX_ROWS = 100000;
export const RECEIPT_PREVIEW_MAX_COLUMNS = 256;

export function previewZavodReceipts(headers: string[], rows: unknown[][]) {
  if (rows.length > RECEIPT_PREVIEW_MAX_ROWS || headers.length > RECEIPT_PREVIEW_MAX_COLUMNS) throw new Error("RECEIPT_PREVIEW_LIMIT");
  const index = (name: string) => headers.indexOf(name);
  const missingColumns = Object.values(ZAVOD_RECEIPT_COLUMNS).filter(name => index(name) < 0);
  const namedHeaders = headers.filter(label => label.trim() !== "");
  if (new Set(namedHeaders).size !== namedHeaders.length) throw new Error("AMBIGUOUS_RECEIPT_HEADERS");
  const read = (row: unknown[], key: keyof typeof ZAVOD_RECEIPT_COLUMNS) => {
    const value = row[index(ZAVOD_RECEIPT_COLUMNS[key])];
    return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  };
  const documents = new Set<string>(), types: Record<string, number> = Object.create(null), identities = new Map<string, number>();
  let count = 0, missingSku = 0, missingSupplier = 0, invalidQuantity = 0, invalidPrice = 0;
  for (const row of rows) {
    if (!row.some(value => value !== null && value !== undefined && value !== "")) continue;
    count++;
    const document = read(row, "documentId"), sku = read(row, "sku"), type = read(row, "movementType");
    if (document) documents.add(document);
    types[type || "UNKNOWN"] = (types[type || "UNKNOWN"] ?? 0) + 1;
    if (!sku) missingSku++;
    if (!read(row, "supplierId")) missingSupplier++;
    if (!read(row, "quantity") || !Number.isFinite(Number(read(row, "quantity"))) || Number(read(row, "quantity")) <= 0) invalidQuantity++;
    if (!read(row, "unitPrice") || !Number.isFinite(Number(read(row, "unitPrice"))) || Number(read(row, "unitPrice")) <= 0) invalidPrice++;
    if (document && (sku || read(row, "productId"))) {
      const productId = read(row, "productId");
      const key = JSON.stringify([document, productId ? "productId" : "sku", productId || sku]);
      identities.set(key, (identities.get(key) ?? 0) + 1);
    }
  }
  return { state: "PREVIEW_ONLY" as const, activationAllowed: false as const, rows: count, documents: documents.size,
    movementTypes: types, missingColumns, missingSku, missingSupplier, invalidQuantity, invalidPrice,
    repeatedDocumentProducts: [...identities.values()].filter(n => n > 1).length,
    approvalsRequired: ["MOVEMENT_TYPES", "POSTING_EVIDENCE", "RECEIVED_DATE", "CURRENCY", "UNIT_PRICE_SEMANTICS", "PRODUCT_MATCHING", "LINE_IDENTITY", "HISTORY_COVERAGE"] };
}
