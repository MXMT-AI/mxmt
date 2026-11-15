import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { PlannerToolbar } from "@/components/planner/planner-toolbar/planner-toolbar";
import { Button } from "@/components/ui/button/button";
import type { PlannerSection } from "@/components/planner/planner-types";
const props = {
  section: "dashboard" as PlannerSection, onSectionChange: vi.fn(), totalCartItems: 7, totalSpent: 95, totalBudget: 100, fmt: String,
  loading: false, hasCartItems: true, exporting: false, onUpload: vi.fn(), onScan: vi.fn(), onExport: vi.fn(), onAddBrand: vi.fn(),
};
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
const render = (overrides: Partial<typeof props> = {}) => nodes(PlannerToolbar({ ...props, ...overrides }));
beforeEach(() => vi.clearAllMocks());
it.each(["dashboard", "catalog", "duplicates", "cart", "ai", "brands"] as const)("marks only %s active and forwards each navigation choice", section => {
  const tabs = render({ section }).filter(node => node.type === Button && "aria-pressed" in node.props);
  expect(tabs).toHaveLength(6);
  expect(tabs.map(tab => tab.props["aria-pressed"])).toEqual(["dashboard", "catalog", "duplicates", "cart", "ai", "brands"].map(id => id === section));
  for (const tab of tabs) tab.props.onClick();
  expect(props.onSectionChange.mock.calls.map(([id]) => id)).toEqual(["dashboard", "catalog", "duplicates", "cart", "ai", "brands"]);
});
it.each([
  ["catalog", "onUpload"], ["duplicates", "onScan"], ["cart", "onExport"], ["brands", "onAddBrand"],
] as const)("shows only the matching action in %s", (section, callback) => {
  const actions = render({ section }).filter(node => node.type === Button && !("aria-pressed" in node.props));
  expect(actions).toHaveLength(1);
  expect(actions[0].props.onClick).toBe(props[callback]);
  actions[0].props.onClick();
  expect(props[callback]).toHaveBeenCalledOnce();
});
it("hides export for an empty order and disables scanning while busy", () => {
  expect(render({ section: "cart", hasCartItems: false }).some(node => node.props.onClick === props.onExport)).toBe(false);
  expect(render({ section: "duplicates", loading: true }).find(node => node.props.onClick === props.onScan)!.props.disabled).toBe(true);
  for (const section of ["dashboard", "ai"] as const) {
    expect(render({ section }).filter(node => node.type === Button && !("aria-pressed" in node.props))).toHaveLength(0);
  }
});

it("disables export and shows its pending label while the workbook is being prepared", () => {
  const action = render({ section: "cart", exporting: true }).find(node => node.props.onClick === props.onExport)!;
  expect(action.props.disabled).toBe(true);
  expect(action.props.children).toContain("Готуємо Excel…");
});
it("preserves order units, budget totals and a safe zero-budget display", () => {
  const html = renderToStaticMarkup(createElement(PlannerToolbar, props));
  expect(html).toContain("Замовлення (7)");
  expect(html).toContain("€95");
  expect(html).toContain("/ €100");
  expect(html).toContain("95%");
  const zero = renderToStaticMarkup(createElement(PlannerToolbar, { ...props, totalBudget: 0 }));
  expect(zero).not.toMatch(/NaN|Infinity|\d+%/);
});
