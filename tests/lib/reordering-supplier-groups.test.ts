import { isValidElement, useState, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReorderingSupplierGroups } from "@/components/reordering/reordering-supplier-groups/reordering-supplier-groups";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { reorderingCopy } from "@/lib/reordering-copy";
import type { ReorderingPreview } from "@/components/reordering/reordering-editor/reordering-editor";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn() }));
const row = { supplierId: "s", supplierName: "Demo", currency: "EUR", positiveSkuCount: 2, unknownQuantitySkuCount: 0, exportEligibleSkuCount: 2, unknownAmountSkuCount: 0, purchaseAmount: 10 };
const setPage = vi.fn();
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function render({ page = 1, count = 1, exporting = false, onExport = vi.fn() as ((supplierId: string, currency: string) => void) | undefined } = {}) {
  vi.mocked(useState).mockReturnValue([page, setPage] as never);
  return nodes(ReorderingSupplierGroups({ data: { suppliers: Array.from({ length: count }, (_, i) => ({ ...row, supplierId: `s${i}` })) } as unknown as ReorderingPreview, copy: reorderingCopy.en, locale: "en-GB", exporting, onExport }));
}
function exportButton(overrides = {}, exporting = false) {
  const table = render({ exporting }).find(node => node.type === ReportTable)!.props;
  return table.renderCell({ ...row, ...overrides }, { key: "csv" }).props;
}
beforeEach(() => vi.clearAllMocks());
it.each([
  { supplierId: null }, { currency: null }, { positiveSkuCount: 0 },
  { unknownQuantitySkuCount: 1 }, { exportEligibleSkuCount: 1 },
])("blocks supplier export for incomplete group %j", overrides => {
  expect(exportButton(overrides).disabled).toBe(true);
});
it("blocks export while preparing and exports a complete supplier/currency pair", () => {
  expect(exportButton({}, true).disabled).toBe(true);
  const onExport = vi.fn();
  const table = render({ onExport }).find(node => node.type === ReportTable)!.props;
  const button = table.renderCell(row, { key: "csv" }).props;
  expect(button.disabled).toBe(false);
  button.onClick();
  expect(onExport).toHaveBeenCalledWith("s", "EUR");
});
it("paginates locally in groups of ten with disabled boundary controls", () => {
  const first = render({ count: 11 });
  expect(first.find(node => node.type === ReportTable)!.props.rows).toHaveLength(10);
  const previous = first.find(node => node.props.children === reorderingCopy.en.previous)!.props;
  const next = first.find(node => node.props.children === reorderingCopy.en.next)!.props;
  expect(previous.disabled).toBe(true);
  expect(next.disabled).toBe(false);
  next.onClick();
  expect(setPage.mock.lastCall![0](1)).toBe(2);
  const last = render({ count: 11, page: 2 });
  expect(last.find(node => node.type === ReportTable)!.props.rows).toHaveLength(1);
  expect(last.find(node => node.props.children === reorderingCopy.en.next)!.props.disabled).toBe(true);
});
it("shows covered amount rather than a misleading full amount for partial groups", () => {
  const table = render().find(node => node.type === ReportTable)!.props;
  const cell = table.renderCell({ ...row, unknownAmountSkuCount: 1, coveredPurchaseAmount: 7 }, { key: "purchaseAmount", type: "money" });
  const text = nodes(cell).flatMap(node => Array.isArray(node.props.children) ? node.props.children : [node.props.children]);
  expect(text).toContain(reorderingCopy.en.partial);
  expect(text).toContain(reorderingCopy.en.covered);
});
