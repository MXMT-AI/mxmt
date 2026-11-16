import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SheetsColumnMapping } from "@/components/settings/sheets-column-mapping/sheets-column-mapping";
import { SHEETS_PRODUCT_FIELDS, SHEETS_ORDER_FIELDS } from "@/lib/sheets-mapping-contract";
const columns = [{ key: "col_a", label: "Identifier" }, { key: "col_b", label: "" }, { key: "col_aa", label: "SKU column" }];
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
it.each(["products", "orders"] as const)("uses the complete %s schema and excludes unnamed source columns", resource => {
  const tree = nodes(SheetsColumnMapping({ resource, value: { productId: "col_a" }, columns, lang: "en", onChange: vi.fn() }));
  const selects = tree.filter(node => node.type === "select");
  expect(selects).toHaveLength(resource === "products" ? SHEETS_PRODUCT_FIELDS.length : SHEETS_ORDER_FIELDS.length);
  for (const select of selects) {
    expect(nodes(select.props.children).filter(node => node.type === "option").map(node => node.props.value)).toEqual(["", "col_a", "col_aa"]);
  }
  expect(selects.some(node => node.props.value === "col_a")).toBe(true);
});
it("forwards selected columns and maps clearing to null without changing the draft", () => {
  const value = { productId: "col_a", sku: "col_aa" }, onChange = vi.fn();
  const inputs = nodes(SheetsColumnMapping({ resource: "products", value, columns, lang: "en", onChange })).filter(node => node.type === "select");
  inputs[0].props.onChange({ target: { value: "col_aa" } });
  expect(onChange).toHaveBeenLastCalledWith("productId", "col_aa");
  inputs[1].props.onChange({ target: { value: "" } });
  expect(onChange).toHaveBeenLastCalledWith("sku", null);
  expect(value).toEqual({ productId: "col_a", sku: "col_aa" });
});
it.each(["uk", "en"] as const)("preserves localized fields and spreadsheet column letters in %s", lang => {
  const html = renderToStaticMarkup(createElement(SheetsColumnMapping, { resource: "orders", value: {}, columns, lang, onChange: vi.fn() }));
  expect(html).toContain("ZAVOD_API");
  expect(html).toContain(lang === "uk" ? "ID замовлення" : "Order ID");
  expect(html).toContain(lang === "uk" ? "Не задано" : "Not mapped");
  expect(html).toContain("Identifier (A)");
  expect(html).toContain("SKU column (AA)");
});
