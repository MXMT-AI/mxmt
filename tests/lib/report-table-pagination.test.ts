import { isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button/button";
import { ReportTablePagination } from "@/components/data-reporting/report-table-pagination/report-table-pagination";

const copy = { records: "records", previous: "Previous", next: "Next", page: "Page", of: "of" };
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}

it.each([
  { page: 1, totalPages: 0, previous: true, next: true },
  { page: 1, totalPages: 3, previous: true, next: false },
  { page: 2, totalPages: 3, previous: false, next: false },
  { page: 3, totalPages: 3, previous: false, next: true },
])("preserves navigation availability at $page of $totalPages", ({ page, totalPages, previous, next }) => {
  const onPrevious = vi.fn(), onNext = vi.fn();
  const tree = nodes(ReportTablePagination({ pagination: { page, totalPages, totalRows: 20 }, requestedPage: page, locale: "en-GB", copy, onPrevious, onNext }));
  const buttons = tree.filter(node => node.type === Button).map(node => node.props);
  expect(buttons.map(button => button.disabled)).toEqual([previous, next]);
  expect(buttons.map(button => button["aria-label"])).toEqual([copy.previous, copy.next]);
  if (!previous) { buttons[0].onClick(); expect(onPrevious).toHaveBeenCalledOnce(); }
  if (!next) { buttons[1].onClick(); expect(onNext).toHaveBeenCalledOnce(); }
  expect(tree.find(node => node.type === "nav")!.props["aria-label"]).toBe(copy.page);
});

it("uses the requested page for controls while displaying the server pagination", () => {
  const tree = nodes(ReportTablePagination({ pagination: { page: 2, totalPages: 3, totalRows: 1234 }, requestedPage: 3, locale: "en-GB", copy, onPrevious: vi.fn(), onNext: vi.fn() }));
  expect(tree.filter(node => node.type === Button)[1].props.disabled).toBe(true);
  const spans = tree.filter(node => node.type === "span");
  expect(spans[0].props.children).toEqual(["1,234", " ", "records"]);
  expect(spans[1].props.children).toEqual(["Page", " ", 2, " ", "of", " ", 3]);
});
