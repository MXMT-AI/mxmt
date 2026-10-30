import { it, expect } from "vitest";
import { previewZavodReceipts, ZAVOD_RECEIPT_COLUMNS } from "@/lib/zavod-receipt-preview";
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
