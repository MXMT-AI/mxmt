import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CsvAmountRules, type CsvAmountRuleValues } from "@/components/settings/csv-amount-rules/csv-amount-rules";
const value: CsvAmountRuleValues = { price: "gross_unit", discountUnit: "amount", absoluteDiscount: "line" };
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
it.each([
  [0, "price", "net_unit"],
  [1, "discountUnit", "percentage"],
  [2, "absoluteDiscount", "unit"],
] as const)("changes field %s (%s) while retaining other rules", (index, key, next) => {
  const onChange = vi.fn();
  const selects = nodes(CsvAmountRules({ value, lang: "en", onChange })).filter(node => node.type === "select");
  expect(selects[index].props.value).toBe(value[key]);
  selects[index].props.onChange({ target: { value: next } });
  expect(onChange).toHaveBeenCalledWith({ ...value, [key]: next });
  expect(value).toEqual({ price: "gross_unit", discountUnit: "amount", absoluteDiscount: "line" });
});
it.each(["uk", "en"] as const)("renders all amount conventions and current values in %s", lang => {
  const selected: CsvAmountRuleValues = { price: "net_unit", discountUnit: "percentage", absoluteDiscount: "unit" };
  const html = renderToStaticMarkup(createElement(CsvAmountRules, { value: selected, lang, onChange: vi.fn() }));
  expect(html.match(/<select/g)).toHaveLength(3);
  expect(html.match(/selected=""/g)).toHaveLength(3);
  expect(html).toContain(lang === "en" ? "Unit price before discount" : "За одиницю, до знижки");
  expect(html).toContain(lang === "en" ? "Absolute discount" : "Абсолютна знижка");
  expect(html).toContain('value="percentage" selected=""');
  expect(html).toContain('value="unit" selected=""');
});
