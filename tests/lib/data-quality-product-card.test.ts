import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "../helpers/render-localized";
import { expect, it, vi } from "vitest";
import { DataQualityProductCard } from "@/components/settings/data-quality-product-card/data-quality-product-card";
import type { QualityProduct } from "@/components/settings/data-quality-card/data-quality-types";
const row: QualityProduct = { id: "product", sku: "SKU-1", name: "Demo product", productKind: "UNKNOWN", brandKey: "UNBRANDED", issues: ["MISSING_BRAND"], ageReference: { basis: "FIRST_SALE_PROXY", date: "2026-10-01" }, sourceId: "source", observedAt: null, importRunId: "run", sourceRecordKey: "record" };
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
it.each(["uk", "en"] as const)("keeps issue guidance, age proxy and lineage in %s", lang => {
  const html = renderToStaticMarkup(createElement(DataQualityProductCard, { row, lang, canManage: false, disabled: false, onKindChange: vi.fn() }));
  expect(html).toContain("SKU-1");
  expect(html).toContain(lang === "en" ? "Unbranded" : "Без бренду");
  expect(html).toContain(lang === "en" ? "Missing brand" : "Не заповнено бренд");
  expect(html).toContain(lang === "en" ? "Where to fix" : "Де виправити");
  expect(html).toContain(lang === "en" ? "First verified sale as an age proxy" : "Перше підтверджене замовлення як орієнтир віку");
  expect(html).toContain(lang === "en" ? "Data lineage" : "Походження даних");
  expect(html).toContain("source");
  expect(html).toContain("record");
  expect(html).not.toContain("<select");
});
it.each([false, true])("keeps product type controls scoped to SKU with disabled=%s", disabled => {
  const onKindChange = vi.fn();
  const select = nodes(DataQualityProductCard({ row, lang: "en", canManage: true, disabled, onKindChange })).find(node => node.type === "select")!.props;
  expect(select.disabled).toBe(disabled);
  expect(select["aria-label"]).toBe("Product type SKU-1");
  expect(select.value).toBe("UNKNOWN");
  if (!disabled) {
    select.onChange({ target: { value: "SERVICE" } });
    expect(onKindChange).toHaveBeenCalledWith("product", "SERVICE");
  }
});
it("does not show a proxy explanation for a verified receipt and preserves unknown product kinds", () => {
  const html = renderToStaticMarkup(createElement(DataQualityProductCard, { row: { ...row, productKind: "FUTURE_KIND", issues: [], ageReference: { basis: "RECEIPT", date: null } }, lang: "en", canManage: false, disabled: false, onKindChange: vi.fn() }));
  expect(html).not.toContain("age proxy");
  expect(html).not.toContain("Where to fix");
  expect(html).toContain("FUTURE_KIND");
});
