import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SheetsMappingPolicyFields } from "@/components/settings/sheets-mapping-policy-fields/sheets-mapping-policy-fields";
import type { SheetsFieldMapping } from "@/lib/sheets-mapping-contract";
type Policy = SheetsFieldMapping["policy"];
const policy: Policy = {
  currency: "UAH", statuses: { paid: "SALE" }, channels: { web: "Website" },
  salesAmount: "net_line", costAmount: "unavailable", lineIdentity: "column", stockObservation: "unverified",
  stockReference: "Existing evidence", defaultProductKind: "UNKNOWN", productKinds: { Services: "SERVICE" },
};
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
it.each([
  [0, "salesAmount", "net_unit", ["net_line", "net_unit"]],
  [1, "costAmount", "unit", ["line", "unit", "unavailable"]],
  [2, "lineIdentity", "order_product", ["column", "order_product"]],
  [3, "stockObservation", "import_observation", ["unverified", "column", "import_observation"]],
  [4, "defaultProductKind", "MERCHANDISE", ["UNKNOWN", "MERCHANDISE"]],
] as const)("preserves %s choices and changes only %s", (index, field, value, choices) => {
  const onChange = vi.fn();
  const tree = nodes(SheetsMappingPolicyFields({ policy, lang: "en", onChange }));
  const select = tree.filter(node => node.type === "select")[index];
  expect(nodes(select.props.children).filter(node => node.type === "option").map(node => node.props.value)).toEqual(choices);
  select.props.onChange({ target: { value } });
  const updated = structuredClone(policy);
  onChange.mock.lastCall![0](updated);
  expect(updated).toEqual({ ...policy, [field]: value });
  expect(policy.salesAmount).toBe("net_line");
});
it("uppercases currency and preserves unrelated policy data", () => {
  const onChange = vi.fn();
  nodes(SheetsMappingPolicyFields({ policy, lang: "en", onChange })).find(node => node.type === "input")!.props.onChange({ target: { value: "eur" } });
  const updated = structuredClone(policy);
  onChange.mock.lastCall![0](updated);
  expect(updated).toEqual({ ...policy, currency: "EUR" });
});
it.each(["unverified", "column", "import_observation"] as const)("shows stock evidence only for a verified basis (%s)", stockObservation => {
  const tree = nodes(SheetsMappingPolicyFields({ policy: { ...policy, stockObservation }, lang: "en", onChange: vi.fn() }));
  const evidence = tree.find(node => node.props.name === "stock-observation-reference");
  expect(Boolean(evidence)).toBe(stockObservation !== "unverified");
  if (evidence) expect(evidence.props.value).toBe("Existing evidence");
});
it.each(["uk", "en"] as const)("keeps policy choices localized in %s", lang => {
  const html = renderToStaticMarkup(createElement(SheetsMappingPolicyFields, { policy, lang, onChange: vi.fn() }));
  expect(html).toContain(lang === "uk" ? "Сума після знижок" : "Amount after discounts");
  expect(html).toContain(lang === "uk" ? "Не підтверджена" : "Unverified");
  expect(html).toContain(lang === "uk" ? "Поточне спостереження під час імпорту" : "Current observation during import");
});
