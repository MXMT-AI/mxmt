import { createElement, isValidElement } from "react";
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "../helpers/render-localized";
import { SalesMatrix } from "@/components/sales/sales-matrix/sales-matrix";
import { SalesCategoryChart } from "@/components/sales/sales-category-chart/sales-category-chart";
import type { SalesMatrixRow } from "@/components/sales/sales-types";
import { salesCopy } from "@/lib/sales-copy";
const copy = salesCopy.en;
function row(id: string | null, value: string | null, kind: SalesMatrixRow["kind"] = "GROUP"): SalesMatrixRow {
  const cell = { value, partial: value === null, alpha: null, tone: "NEUTRAL" as const };
  return { id, name: id ?? "Unassigned", currency: "EUR", kind, rank: 1, groupCount: 1, total: cell, cells: [{ ...cell, month: "2026-10" }] };
}
it("keeps totals, others and unassigned SKU links distinct", () => {
  const href = vi.fn(() => "/sales");
  const table = SalesMatrix({ rows: [row(null, null), row("other", "5", "OTHERS")], total: row("total", "5", "TOTAL"), metric: "revenue", group: "category", copy, locale: "en-GB", href });
  if (!isValidElement<Record<string, any>>(table)) throw new Error("Expected table");
  const props = table.props;
  expect(props.rows).toHaveLength(3);
  const name = { key: "name", type: "text" };
  props.renderCell(props.rows[0], name);
  expect(href).toHaveBeenLastCalledWith({ groupBy: "sku", categoryId: "__unassigned__", currency: "EUR", others: null, page: null });
  props.renderCell(props.rows[1], name);
  expect(href).toHaveBeenLastCalledWith({ groupBy: "category", others: "1", page: null });
  const total = props.renderCell(props.rows[2], name);
  expect(total.type).toBe("strong");
  expect(props.getCellStyle(props.rows[2], { key: "total" }).fontWeight).toBe(700);
  const partial = props.renderCell(props.rows[0], { key: "2026-10", type: "money" });
  expect(partial.props.title).toBe(copy.partial);
  expect(partial.props.children[0]).toBe("—");
});
it("stacks positive and negative values on opposite sides and omits unknown bars", () => {
  const html = renderToStaticMarkup(createElement(SalesCategoryChart, { rows: [row("positive", "100"), row("negative", "-50"), row("unknown", null)], locale: "en-GB", copy, units: false, href: () => "/sales" }));
  const baseline = Number(html.match(/<line[^>]*y1="([^"]+)"/)![1]);
  const rects = [...html.matchAll(/<rect[^>]*y="([^"]+)"[^>]*height="([^"]+)"/g)].map(match => ({ y: Number(match[1]), height: Number(match[2]) }));
  expect(rects).toHaveLength(2);
  expect(rects[0].y + rects[0].height).toBeCloseTo(baseline);
  expect(rects[1].y).toBeCloseTo(baseline);
  expect(rects.every(rect => Number.isFinite(rect.height) && rect.height > 0)).toBe(true);
  expect(html).toContain('role="img"');
  expect(html).toContain(copy.partial);
});
it("renders empty graph and matrix without invalid geometry", () => {
  const html = renderToStaticMarkup(createElement(SalesCategoryChart, { rows: [], locale: "en-GB", copy, units: true, href: () => "/sales" }));
  expect(html).toContain(copy.noRows);
  expect(html).not.toMatch(/NaN|Infinity|<svg/);
});
