import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PlannerDashboard } from "@/components/planner/planner-dashboard/planner-dashboard";
import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import type { BrandBudgetStatus, CatalogUpload } from "@/components/planner/planner-types";
const empty = { brands: [], catalogs: [], budgetStatus: [], cartLineCount: 0, totalBudget: 0, totalSpent: 0, totalCartItems: 0, fmt: (value: number) => String(value) };
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function metrics(props: Parameters<typeof PlannerDashboard>[0]) { return nodes(PlannerDashboard(props)).filter(node => node.type === MetricTile).map(node => node.props); }
it("counts every catalog even when their item counts are equal", () => {
  const catalogs: CatalogUpload[] = [1, 2].map(id => ({ id: String(id), brandId: "b", season: "SS26", itemCount: 100, uploadedAt: "2026-01-01", brand: { name: "Demo" } }));
  expect(metrics({ ...empty, catalogs }).find(tile => tile.label === "Товарів у каталозі")!.value).toBe(200);
});
it("renders empty data and a zero budget without invalid percentages", () => {
  const html = renderToStaticMarkup(createElement(PlannerDashboard, empty));
  expect(html).toContain("Брендів ще немає");
  expect(html).not.toMatch(/NaN|Infinity/);
  expect(metrics(empty).find(tile => tile.label === "Бюджет використано")!.value).toBe("0%");
  expect(html).toContain("<dl");
});
it("uses parent totals and distinguishes cart lines from units", () => {
  const tiles = metrics({ ...empty, cartLineCount: 2, totalCartItems: 7, totalBudget: 100, totalSpent: 125 });
  expect(tiles.find(tile => tile.label === "У замовленні")).toMatchObject({ value: 2, description: "7 одиниць" });
  expect(tiles.find(tile => tile.label === "Бюджет використано")).toMatchObject({ value: "125%", description: "€125 з €100" });
});
it("caps an overspent budget bar while retaining its actual percentage", () => {
  const brand: BrandBudgetStatus = { id: "b", name: "Demo", budget: 100, paymentDays: 30, currency: "EUR", country: null, contact: null, leadTimeDays: 28, moq: 1, spent: 125, remaining: -25, pct: 125 };
  const html = renderToStaticMarkup(createElement(PlannerDashboard, { ...empty, brands: [brand], budgetStatus: [brand], totalBudget: 100, totalSpent: 125 }));
  expect(html).toContain("width:100%");
  expect(html).toContain("125%");
  expect(html).toContain("text-accent-orange");
});
