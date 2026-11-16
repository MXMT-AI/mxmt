import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CsvReceiptRules, type CsvReceiptRuleValues } from "@/components/settings/csv-receipt-rules/csv-receipt-rules";
const value: CsvReceiptRuleValues = { postedStatus: "posted", supplierCode: "external", supplierId: "internal", costVerified: false };
const suppliers = [{ id: "internal", name: "Demo supplier" }];
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
it("updates each rule without losing the other settings", () => {
  const onChange = vi.fn();
  const tree = nodes(CsvReceiptRules({ value, suppliers, lang: "en", onChange }));
  const fields = tree.filter(node => node.type === "input" || node.type === "select");
  expect(fields.slice(0, 3).every(field => field.props.required)).toBe(true);
  fields[0].props.onChange({ target: { value: "confirmed" } });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, postedStatus: "confirmed" });
  fields[1].props.onChange({ target: { value: "supplier-code" } });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, supplierCode: "supplier-code" });
  fields[2].props.onChange({ target: { value: "" } });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, supplierId: "" });
  fields[3].props.onChange({ target: { checked: true } });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, costVerified: true });
  expect(value.costVerified).toBe(false);
});
it.each(["uk", "en"] as const)("renders supplier options, selection and verification text in %s", lang => {
  const html = renderToStaticMarkup(createElement(CsvReceiptRules, { value, suppliers, lang, onChange: vi.fn() }));
  expect(html).toContain(lang === "en" ? "Verified receipts" : "Підтверджені приходи");
  expect(html).toContain(lang === "en" ? "Choose supplier" : "Оберіть постачальника");
  expect(html).toContain('<option value="internal" selected="">Demo supplier</option>');
  expect(html).not.toContain('checked=""');
});
it("keeps supplier selection required when no suppliers exist", () => {
  const tree = nodes(CsvReceiptRules({ value: { ...value, supplierId: "" }, suppliers: [], lang: "en", onChange: vi.fn() }));
  expect(tree.find(node => node.type === "select")!.props).toMatchObject({ required: true, value: "" });
  expect(tree.filter(node => node.type === "option")).toHaveLength(1);
});
