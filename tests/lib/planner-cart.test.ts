import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { PlannerCart } from "@/components/planner/planner-cart/planner-cart";
import { PlannerCartItem } from "@/components/planner/planner-cart-item/planner-cart-item";
import { groupPlannerCart } from "@/components/planner/planner-cart/group-planner-cart";
import { Button } from "@/components/ui/button/button";
import type { CartItem } from "@/components/planner/planner-types";
const state = vi.hoisted(() => ({ edit: undefined as undefined | { quantity: number; text: string } }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: (initial: any) => {
  state.edit ??= initial;
  return [state.edit, (value: any) => { state.edit = value; }];
} }));
const item: CartItem = { catalogItemId: "item", sku: "SKU-1", name: "Demo", brandId: "brand", brandName: "Brand", category: "Shoes", price: 10, currency: "EUR", qty: 3, minOrder: 1 };
const updateQty = vi.fn(), removeFromCart = vi.fn(), fmt = String;
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function row(value = item) { return nodes(PlannerCartItem({ item: value, updateQty, removeFromCart, fmt })); }
function input(value = item) { return row(value).find(n => n.type === "input")!.props; }
function change(value: string, badInput = false) { input().onChange({ currentTarget: { value, validity: { badInput } } }); }
beforeEach(() => { state.edit = undefined; vi.clearAllMocks(); });
it.each(["", "0", "-1", "1.5", "abc", "9007199254740992"])("keeps invalid draft %j without changing or removing an item", value => {
  change(value);
  expect(input().value).toBe(value);
  expect(updateQty).not.toHaveBeenCalled();
  expect(removeFromCart).not.toHaveBeenCalled();
  input().onBlur();
  expect(input().value).toBe("3");
});
it("allows clearing and typing a new whole quantity", () => {
  change(""); change("12");
  expect(updateQty).toHaveBeenCalledWith("item", 12);
  expect(removeFromCart).not.toHaveBeenCalled();
  expect(input({ ...item, qty: 12 }).value).toBe("12");
});
it("ignores incomplete numeric input and accepts updated quantities from the parent", () => {
  change("", true);
  expect(updateQty).not.toHaveBeenCalled();
  expect(input({ ...item, qty: 8 }).value).toBe("8");
});
it("finishes editing on Enter and deletes only through the named button", () => {
  const blur = vi.fn(), preventDefault = vi.fn();
  input().onKeyDown({ key: "Enter", preventDefault, currentTarget: { blur } });
  expect(blur).toHaveBeenCalledOnce();
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(input()["aria-label"]).toContain("SKU-1");
  const button = row().find(n => n.type === Button)!;
  expect(button.props["aria-label"]).toContain("Видалити Demo");
  button.props.onClick();
  expect(removeFromCart).toHaveBeenCalledWith("item");
});
it("groups brands and computes totals including unrecognized and special brand IDs", () => {
  const second = { ...item, catalogItemId: "second", price: 5, qty: 2 };
  const other = { ...item, catalogItemId: "other", brandId: "__proto__", price: 7, qty: 4 };
  const { groups, total } = groupPlannerCart([item, second, other]);
  expect(Array.from(groups.keys())).toEqual(["brand", "__proto__"]);
  expect(groups.get("brand")).toEqual({ items: [item, second], subtotal: 40 });
  expect(groups.get("__proto__")!.subtotal).toBe(28);
  expect(total).toBe(68);
});
it("renders the empty state and the computed order total", () => {
  const props = { budgetStatus: [], removeFromCart, updateQty, fmt };
  expect(renderToStaticMarkup(createElement(PlannerCart, { ...props, cart: [] }))).toContain("Замовлення порожнє");
  const html = renderToStaticMarkup(createElement(PlannerCart, { ...props, cart: [item, { ...item, catalogItemId: "second", brandId: "other", price: 5, qty: 2 }] }));
  expect(html).toContain("€40");
  expect(html).toContain("€30");
  expect(html).toContain("€10");
  expect(html).toContain("other");
});
