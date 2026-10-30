import { it, expect } from "vitest";
import { previewZavodReceipts, ZAVOD_RECEIPT_COLUMNS } from "@/lib/zavod-receipt-preview";
import { previewZavodReceiptSheet } from "@/lib/zavod-receipt-workbook.mjs";
import * as XLSX from "xlsx";
const headers = Object.values(ZAVOD_RECEIPT_COLUMNS);
const row = (values: Record<string, unknown>) => headers.map(h => values[h] ?? null);
it("keeps receipt semantics unapproved and detects ambiguous document/product identity", () => {
  const valid = row({ "ID документа": "1", "Тип": 1, "Товар: ID": "p", "Товар: Артикул (SKU)": "sku", "Позиція: Кількість": 2, "Позиція: Ціна": 50 });
  const result = previewZavodReceipts(headers, [valid, valid, row({ "ID документа": "2", "Тип": 2, "Позиція: Кількість": -1, "Позиція: Ціна": 0 }), []]);
  expect(result).toMatchObject({ state: "PREVIEW_ONLY", activationAllowed: false, rows: 3, documents: 2, repeatedDocumentProducts: 1, missingSku: 1, missingSupplier: 3, invalidQuantity: 1, invalidPrice: 1, movementTypes: { "1": 2, "2": 1 } });
  expect(result.approvalsRequired).toContain("LINE_IDENTITY");
});
it("rejects duplicate column labels and reports missing fields rather than guessing a mapping", () => {
  expect(() => previewZavodReceipts(["ID документа", "ID документа"], [])).toThrow("AMBIGUOUS_RECEIPT_HEADERS");
  expect(previewZavodReceipts([], []).missingColumns).toContain("Тип");
});
it("preserves field positions around multiple unnamed columns", () => {
  const padded = ["", headers[0], "", ...headers.slice(1), " "];
  const values = row({ "ID документа": "1", "Тип": 1, "Товар: ID": "p", "Товар: Артикул (SKU)": "sku", "Позиція: Кількість": 2, "Позиція: Ціна": 50 });
  const result = previewZavodReceipts(padded, [[null, values[0], null, ...values.slice(1), null]]);
  expect(result).toMatchObject({ missingColumns: [], rows: 1, documents: 1, missingSku: 0, invalidQuantity: 0, invalidPrice: 0 });
});
it("counts product ID repeats despite missing/changed SKU and keeps SKU-only keys separate", () => {
  const make = (document: string, productId: string, sku: string) => row({ "ID документа": document, "Товар: ID": productId, "Товар: Артикул (SKU)": sku });
  const result = previewZavodReceipts(headers, [make("1", "p", "old"), make("1", "p", ""), make("1", "p", "new"), make("2", "", "p"), make("2", "", "p"), make("2", "p", "other"), make("3", "p", "new")]);
  expect(result.repeatedDocumentProducts).toBe(2);
});
it.each(["A1:A100002", "A1:IW2", "IW1:IW2", "A1048576:A1048576"])("rejects oversized used range %s before reading cells", ref => {
  const sheet = { "!ref": ref };
  Object.defineProperty(sheet, "A1", { enumerable: true, get() { throw new Error("CELLS_MATERIALIZED"); } });
  expect(() => previewZavodReceiptSheet(sheet)).toThrow("RECEIPT_PREVIEW_LIMIT");
});
it("accepts the exact dimensions limit and keeps the workbook preview usable", () => {
  // Check each inclusive boundary without materializing a 25-million-cell matrix.
  expect(previewZavodReceiptSheet({ "!ref": "A1:A100001" }).state).toBe("PREVIEW_ONLY");
  expect(previewZavodReceiptSheet({ "!ref": "A1:IV2" }).state).toBe("PREVIEW_ONLY");
  const sheet = XLSX.utils.aoa_to_sheet([headers, row({ "ID документа": "1", "Тип": 1 })]);
  expect(previewZavodReceiptSheet(sheet)).toMatchObject({ rows: 1, documents: 1, movementTypes: { "1": 1 } });
});
