import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PlannerDuplicates } from "@/components/planner/planner-duplicates/planner-duplicates";
import { Button } from "@/components/ui/button/button";
import { Badge } from "@/components/ui/badge/badge";
import type { CatalogItem } from "@/components/planner/planner-types";
const item: CatalogItem = { id: "item", catalogId: "catalog", brandId: "brand", sku: "SKU-1", name: "Demo item", category: "Shoes", color: "Black", style: "Classic", material: null, priceWholesale: 40, priceRetail: 100, minOrder: 3, stockAvail: 20, leadTimeDays: 28, tags: [], brand: { id: "brand", name: "Demo", currency: "EUR" } };
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
it.each([{ groups: [] }, { groups: [[]] }])("handles empty results and empty groups: $groups", ({ groups }) => {
  const html = renderToStaticMarkup(createElement(PlannerDuplicates, { groups, addToCart: vi.fn() }));
  expect(html).toContain("Сканування ще не виконано");
  expect(html).not.toContain("До замовлення");
});
it("counts only nonempty groups and preserves product details", () => {
  const groups = [[], [item, { ...item, id: "other", sku: "SKU-2", brand: { ...item.brand, id: "other-brand", name: "Other" } }], []];
  const html = renderToStaticMarkup(createElement(PlannerDuplicates, { groups, addToCart: vi.fn() }));
  expect(html).toContain("Знайдено 1 групу");
  expect(html).toContain("2 brands");
  for (const text of ["Shoes", "Black", "Classic", "EUR40", "SKU-1", "SKU-2", "Other"]) expect(html).toContain(text);
  const badge = nodes(PlannerDuplicates({ groups, addToCart: vi.fn() })).find(n => n.type === Badge)!;
  expect(badge.props.outlined).toBe(false);
  expect(badge.props.className).toContain("text-accent-orange");
});
it("adds each chosen item with its own minimum quantity", () => {
  const addToCart = vi.fn();
  const other = { ...item, id: "other", minOrder: 5 };
  const buttons = nodes(PlannerDuplicates({ groups: [[item, other]], addToCart })).filter(n => n.type === Button);
  buttons[0].props.onClick();
  buttons[1].props.onClick();
  expect(addToCart.mock.calls).toEqual([[item, 3], [other, 5]]);
});
