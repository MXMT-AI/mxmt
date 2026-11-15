import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { Button } from "@/components/ui/button/button";
import type { DataColumnMetadata } from "@/lib/data-table-api";

const columns: DataColumnMetadata[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "amount", label: "Amount", type: "number" },
];
const rows = [{ id: "1", name: "Fixture", amount: "1234.50" }];

function sortButtons(node: ReactNode): (() => void)[] {
  if (Array.isArray(node)) return node.flatMap(sortButtons);
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return [];
  if (node.type === Button && node.props.onClick) return [node.props.onClick];
  return sortButtons(node.props.children);
}

it.each([
  { direction: "asc" as const, expected: "ascending" },
  { direction: "desc" as const, expected: "descending" },
])("sorts eligible columns and announces $direction", ({ direction, expected }) => {
  const onSort = vi.fn();
  const isSortable = vi.fn((column: DataColumnMetadata) => column.key === "amount");
  const tree = ReportTable({ columns, rows, locale: "en-GB", sortColumn: "amount", direction, isSortable, onSort });
  expect(isSortable).toHaveBeenCalledTimes(2);
  const actions = sortButtons(tree);
  expect(actions).toHaveLength(1);
  actions[0]();
  expect(onSort).toHaveBeenCalledWith(columns[1]);
  const html = renderToStaticMarkup(tree);
  expect(html).toContain(`aria-sort="${expected}"`);
  expect(html).toContain('title="1,234.5">1,234.5</span>');
});

it("shows headings as text when no sort handler is supplied", () => {
  const html = renderToStaticMarkup(createElement(ReportTable, { columns, rows, locale: "uk-UA", isSortable: () => true }));
  expect(html).not.toContain("<button");
  expect(html).toContain('aria-label="Таблиця звіту"');
});

it("preserves custom cell content and styles for each row and column", () => {
  const renderCell = vi.fn((row, column) => createElement("strong", null, `${column.key}=${row[column.key]}`));
  const getCellStyle = vi.fn(() => ({ backgroundColor: "pink" }));
  const html = renderToStaticMarkup(createElement(ReportTable, { columns, rows, locale: "en-GB", renderCell, getCellStyle }));
  expect(renderCell).toHaveBeenCalledTimes(2);
  expect(getCellStyle).toHaveBeenCalledTimes(2);
  expect(html).toContain("<strong>amount=1234.50</strong>");
  expect(html).toContain("background-color:pink");
  expect(html).not.toContain('title="1,234.5"');
});
