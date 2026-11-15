import * as XLSX from "xlsx";
import { expect, it } from "vitest";
import { buildPlannerOrderWorkbook } from "@/components/planner/planner-order-workbook";
import type { CartItem } from "@/components/planner/planner-types";
const item: CartItem = { catalogItemId: "i", brandId: "b", brandName: "Demo", sku: "0001", name: "=2+2", category: "Shoes", price: 12.5, currency: "EUR", qty: 3, minOrder: 1 };
it("preserves headers, column order, totals, width and literal text values", () => {
  const workbook = buildPlannerOrderWorkbook(XLSX, [item]);
  expect(workbook.SheetNames).toEqual(["Purchase Order"]);
  const sheet = workbook.Sheets["Purchase Order"];
  expect(sheet["!cols"]).toEqual(Array.from({ length: 8 }, () => ({ wch: 18 })));
  expect(sheet.B2).toMatchObject({ t: "s", v: "0001" });
  expect(sheet.C2).toMatchObject({ t: "s", v: "=2+2" });
  expect(sheet.C2.f).toBeUndefined();
  const restored = XLSX.read(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), { type: "array" });
  expect(XLSX.utils.sheet_to_json(restored.Sheets["Purchase Order"], { header: 1 })).toEqual([
    ["Brand", "SKU", "Name", "Category", "Qty", "Unit Price", "Total", "Currency"],
    ["Demo", "0001", "=2+2", "Shoes", 3, 12.5, 37.5, "EUR"],
  ]);
});
it("keeps an empty cart workbook valid without inventing rows", () => {
  const workbook = buildPlannerOrderWorkbook(XLSX, []);
  expect(workbook.SheetNames).toEqual(["Purchase Order"]);
  expect(XLSX.utils.sheet_to_json(workbook.Sheets["Purchase Order"], { header: 1, blankrows: false })).toEqual([]);
});
