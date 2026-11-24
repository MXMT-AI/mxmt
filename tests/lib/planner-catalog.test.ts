import { createElement, isValidElement, useRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { PlannerCatalog } from "@/components/planner/planner-catalog/planner-catalog";
import { PlannerCatalogCard } from "@/components/planner/planner-catalog-card/planner-catalog-card";
import { Button } from "@/components/ui/button/button";
import type { CatalogItem, Brand } from "@/components/planner/planner-types";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useRef: vi.fn() }));
const item: CatalogItem = { id: "item", catalogId: "catalog", brandId: "brand", sku: "SKU-1", name: "Demo item", category: "Shoes", color: "Black", style: null, material: null, priceWholesale: 40, priceRetail: 100, minOrder: 3, stockAvail: 20, leadTimeDays: 28, tags: ["a", "b", "c"], brand: { id: "brand", name: "Demo", currency: "EUR" } };
const brand: Brand = { id: "brand", name: "Demo", budget: 100, paymentDays: 30, currency: "EUR", country: null, contact: null, leadTimeDays: 28, moq: 1 };
const addToCart = vi.fn();
const input = { value: "3", validity: { badInput: false }, setCustomValidity: vi.fn(), reportValidity: vi.fn() };
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
const callbacks = { setFilterBrand: vi.fn(), setFilterCategory: vi.fn(), setFilterSearch: vi.fn(), onSearch: vi.fn(), addToCart };
const props = { brands: [brand], items: [item], categories: ["Shoes"], loading: false, filterBrand: "all", filterCategory: "all", filterSearch: "", ...callbacks };
beforeEach(() => {
  vi.clearAllMocks();
  input.value = "3"; input.validity.badInput = false;
  vi.mocked(useRef).mockReturnValue({ current: input });
});
it.each(["-2", "0", "1.5", "abc", "Infinity", "9007199254740992"])("rejects invalid quantity %s", value => {
  input.value = value;
  nodes(PlannerCatalogCard({ item, addToCart })).find(n => n.type === Button)!.props.onClick();
  expect(addToCart).not.toHaveBeenCalled();
  expect(input.reportValidity).toHaveBeenCalledOnce();
  expect(input.setCustomValidity).toHaveBeenCalledWith("Вкажіть додатну цілу кількість.");
});
it.each([["7", 7], ["", 3]])("adds quantity %j with the empty-field fallback", (value, qty) => {
  input.value = value;
  nodes(PlannerCatalogCard({ item, addToCart })).find(n => n.type === Button)!.props.onClick();
  expect(addToCart).toHaveBeenCalledWith(item, qty);
});
it("does not mistake an incomplete numeric input for an empty fallback", () => {
  input.value = ""; input.validity.badInput = true;
  nodes(PlannerCatalogCard({ item, addToCart })).find(n => n.type === Button)!.props.onClick();
  expect(addToCart).not.toHaveBeenCalled();
});
it("labels quantity and clears custom validation when editing", () => {
  const field = nodes(PlannerCatalogCard({ item, addToCart })).find(n => n.type === "input")!;
  expect(field.props["aria-label"]).toContain("SKU-1");
  expect(field.props.defaultValue).toBe(3);
  field.props.onInput({ currentTarget: input });
  expect(input.setCustomValidity).toHaveBeenCalledWith("");
});
it("forwards filters and supports both Enter and the search button", () => {
  const tree = nodes(PlannerCatalog(props));
  tree.find(n => n.props["aria-label"] === "Бренд")!.props.onChange({ target: { value: "brand" } });
  tree.find(n => n.props["aria-label"] === "Категорія")!.props.onChange({ target: { value: "Shoes" } });
  const search = tree.find(n => n.type === "input")!;
  search.props.onChange({ target: { value: "SKU" } });
  expect(callbacks.setFilterBrand).toHaveBeenCalledWith("brand");
  expect(callbacks.setFilterCategory).toHaveBeenCalledWith("Shoes");
  expect(callbacks.setFilterSearch).toHaveBeenCalledWith("SKU");
  search.props.onKeyDown({ key: "x" });
  expect(callbacks.onSearch).not.toHaveBeenCalled();
  search.props.onKeyDown({ key: "Enter" });
  tree.find(n => n.type === Button)!.props.onClick();
  expect(callbacks.onSearch).toHaveBeenCalledTimes(2);
  expect(nodes(PlannerCatalog({ ...props, loading: true })).find(n => n.type === Button)!.props.disabled).toBe(true);
});
it("preserves both empty states and suppresses them while loading", () => {
  const render = (overrides: Partial<typeof props>) => renderToStaticMarkup(createElement(PlannerCatalog, { ...props, ...overrides }));
  expect(render({ items: [], brands: [] })).toContain("Спочатку додайте бренд");
  expect(render({ items: [] })).toContain("Товарів не знайдено");
  expect(render({ items: [], loading: true })).not.toContain("Товарів не знайдено");
});
it("preserves margin, price, tags and the stock count", () => {
  const html = renderToStaticMarkup(createElement(PlannerCatalogCard, { item, addToCart }));
  expect(html).toContain("60%");
  expect(html).toContain("€40.00");
  expect(html).toContain("20 avail");
  expect(html).toContain(">a</span>");
  expect(html).toContain(">b</span>");
  expect(html).not.toContain(">c</span>");
  const demo = { ...item, brand: { ...item.brand, currency: "UAH" } };
  expect(renderToStaticMarkup(createElement(PlannerCatalogCard, { item: demo, addToCart })))
    .toContain("40.00 UAH");
});
