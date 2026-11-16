import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CsvHistoryRules, type CsvHistoryRuleValues } from "@/components/settings/csv-history-rules/csv-history-rules";
const initial: CsvHistoryRuleValues = { orders: false, receipts: false, receiptBaseline: false, from: "", to: "" };
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
it.each([[false, false], [true, false], [false, true], [true, true]])("shows period fields for orders=%s receipts=%s", (orders, receipts) => {
  const tree = nodes(CsvHistoryRules({ value: { ...initial, orders, receipts }, lang: "en", onChange: vi.fn() }));
  const checkboxes = tree.filter(node => node.props.type === "checkbox");
  const dates = tree.filter(node => node.type === "input" && node.props.type !== "checkbox");
  expect(checkboxes).toHaveLength(receipts ? 3 : 2);
  expect(dates).toHaveLength(orders || receipts ? 2 : 0);
  expect(dates.every(node => node.props.required)).toBe(true);
});
it("updates confirmations and period drafts without losing hidden values", () => {
  const value = { ...initial, orders: true, receipts: true, receiptBaseline: true, from: "2025-01-01T00:00:00.000Z", to: "2026-10-25T23:59:59.999Z" };
  const onChange = vi.fn();
  const tree = nodes(CsvHistoryRules({ value, lang: "en", onChange }));
  const checkboxes = tree.filter(node => node.props.type === "checkbox");
  checkboxes[0].props.onChange({ target: { checked: false } });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, orders: false });
  checkboxes[1].props.onChange({ target: { checked: false } });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, receipts: false });
  checkboxes[2].props.onChange({ target: { checked: false } });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, receiptBaseline: false });
  const dates = tree.filter(node => node.type === "input" && node.props.type !== "checkbox");
  dates[0].props.onChange({ target: { value: "invalid-draft" } });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, from: "invalid-draft" });
  dates[1].props.onChange({ target: { value: "" } });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, to: "" });
  expect(value.receipts).toBe(true);
});
it.each(["uk", "en"] as const)("renders history confirmation labels and ISO placeholders in %s", lang => {
  const html = renderToStaticMarkup(createElement(CsvHistoryRules, { value: { ...initial, receipts: true }, lang, onChange: vi.fn() }));
  expect(html).toContain(lang === "en" ? "Verified history coverage" : "Підтверджене покриття історії");
  expect(html).toContain(lang === "en" ? "Start (ISO UTC)" : "Початок (ISO UTC)");
  expect(html).toContain('placeholder="2025-01-01T00:00:00.000Z"');
  expect(html).toContain(lang === "en" ? "every receipt since the business began" : "повна історія приходів від початку діяльності");
});
