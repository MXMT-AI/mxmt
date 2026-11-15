"use client";

import type { CSSProperties, ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import { formatTableValue } from "@/lib/data-reporting-ui";

export interface ReportTableProps {
  columns: DataColumnMetadata[];
  rows: Array<Record<string, unknown>>;
  locale: string;
  sortColumn?: string | null;
  direction?: "asc" | "desc";
  onSort?: (column: DataColumnMetadata) => void;
  isSortable?: (column: DataColumnMetadata) => boolean;
  renderCell?: (
    row: Record<string, unknown>,
    column: DataColumnMetadata,
  ) => ReactNode;
  getCellStyle?: (
    row: Record<string, unknown>,
    column: DataColumnMetadata,
  ) => CSSProperties | undefined;
}

export default function ReportTable({
  columns,
  rows,
  locale,
  sortColumn,
  direction = "asc",
  onSort,
  isSortable,
  renderCell,
  getCellStyle,
}: ReportTableProps) {
  return (
    <div
      className="max-h-[62vh] overflow-auto"
      tabIndex={0}
      role="region"
      aria-label={locale === "uk-UA" ? "Таблиця звіту" : "Report table"}
    >
      <table className="w-full min-w-max border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-(--surface2)">
          <tr>
            {columns.map((column) => {
              const sortable = Boolean(onSort) && Boolean(isSortable?.(column));
              const selected = sortColumn === column.key;

              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={selected ? (direction === "asc" ? "ascending" : "descending") : undefined}
                  className="border-r border-b border-(--border) px-3 py-2.5 text-left font-semibold whitespace-nowrap text-(--muted) last:border-r-0"
                >
                  {sortable ? (
                    <Button
                      onClick={() => onSort?.(column)}
                      className="rounded-none border-0 p-0 font-[family-name:inherit] text-xs font-semibold hover:bg-transparent focus-visible:outline-solid focus-visible:outline-2"
                    >
                      {column.label}
                      {selected && (direction === "asc"
                        ? <ArrowUp aria-hidden="true" size={11} />
                        : <ArrowDown aria-hidden="true" size={11} />)}
                    </Button>
                  ) : column.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${String(row.id ?? index)}:${String(row.currency ?? "")}`}
              className="border-b border-(--border-faint) last:border-b-0 hover:bg-(--input-bg)"
            >
              {columns.map((column) => {
                const formatted = renderCell ? undefined : formatTableValue(row[column.key], column.type, locale);

                return (
                  <td
                    key={column.key}
                    style={getCellStyle?.(row, column)}
                    className={`max-w-md border-r border-(--border-faint) px-3 py-2 text-(--text) last:border-r-0 ${column.type === "text" || column.type === "source" ? "text-left" : "text-right tabular-nums"}`}
                  >
                    {renderCell ? renderCell(row, column) : (
                      <span className="block truncate" title={formatted}>{formatted}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
