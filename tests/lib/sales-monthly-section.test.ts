import { isValidElement, type ReactNode } from "react";
import { expect, it } from "vitest";
import { SalesMonthlySection } from "@/components/sales/sales-monthly-section/sales-monthly-section";
import { SalesMatrix } from "@/components/sales/sales-matrix/sales-matrix";
import { Pager } from "@/components/ui/pager/pager";
import type { SalesMatrixRow } from "@/components/sales/sales-types";
import { salesCopy } from "@/lib/sales-copy";
import { merchandisingHref } from "@/lib/merchandising-navigation";
const copy = salesCopy.en;
const cell = { value: "1", partial: false, alpha: null, tone: "NEUTRAL" as const };
const row: SalesMatrixRow = { id: "others", name: "Others", currency: "EUR", kind: "OTHERS", rank: 1, groupCount: 3, total: cell, cells: [] };
const matrix = { rows: [row], total: null, otherRows: [{ ...row, kind: "EXTRA" as const }], pagination: { page: 2, pageSize: 25, totalRows: 30, totalPages: 2 } };
const params = new URLSearchParams("currency=EUR&channelId=c&snapshotId=s&others=1");
const href = (values: Record<string, string | null>) => merchandisingHref("/sales", params, values);
const props = { matrix, group: "category" as const, metric: "revenue" as const, tablePeriod: { from: "2026-01-01", to: "2026-10-31" }, copy, locale: "en-GB", href };
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
it.each([false, true])("toggles others with showOthers=%s and preserves scoped filters", showOthers => {
  const tree = nodes(SalesMonthlySection({ ...props, showOthers }));
  const action = tree.find(node => node.props.children === (showOthers ? copy.hideOthers : copy.showOthers))!.props;
  const url = new URL(action.href, "https://example.test");
  expect(url.searchParams.get("others")).toBe(showOthers ? null : "1");
  expect(url.searchParams.has("page")).toBe(false);
  expect(url.searchParams.get("currency")).toBe("EUR");
  expect(url.searchParams.get("channelId")).toBe("c");
  expect(url.searchParams.get("snapshotId")).toBe("s");
  expect(tree.filter(node => node.type === SalesMatrix)).toHaveLength(showOthers ? 2 : 1);
  expect(tree.filter(node => node.type === Pager)).toHaveLength(showOthers ? 1 : 0);
});
it("uses SKU pagination without expanding others", () => {
  const tree = nodes(SalesMonthlySection({ ...props, group: "sku", showOthers: true }));
  expect(tree.filter(node => node.type === SalesMatrix)).toHaveLength(1);
  const pagers = tree.filter(node => node.type === Pager);
  expect(pagers).toHaveLength(1);
  expect(pagers[0].props).toMatchObject({ control: "page", pagination: matrix.pagination, href });
  expect(tree.some(node => [copy.showOthers, copy.hideOthers].includes(node.props.children))).toBe(false);
});
it("omits others controls and table when there is no others row", () => {
  const tree = nodes(SalesMonthlySection({ ...props, matrix: { ...matrix, rows: [] }, showOthers: true }));
  expect(tree.filter(node => node.type === SalesMatrix)).toHaveLength(1);
  expect(tree.some(node => node.type === Pager)).toBe(false);
  expect(tree.some(node => [copy.showOthers, copy.hideOthers].includes(node.props.children))).toBe(false);
});
