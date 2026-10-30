"use client";
import type { CSSProperties, ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import { formatTableValue } from "@/lib/data-reporting-ui";
export default function ReportTable({
  columns,
  rows,
  locale,
  sortColumn,
  direction = "asc",
  onSort,
  isSortable = () => false,
  renderCell,
  getCellStyle,
}: {
  renderCell?: (
    row: Record<string, unknown>,
    column: DataColumnMetadata,
  ) => ReactNode;
  getCellStyle?: (
    row: Record<string, unknown>,
    column: DataColumnMetadata,
  ) => CSSProperties | undefined;
  columns: DataColumnMetadata[];
  rows: Array<Record<string, unknown>>;
  locale: string;
  sortColumn?: string | null;
  direction?: "asc" | "desc";
  onSort?: (column: DataColumnMetadata) => void;
  isSortable?: (column: DataColumnMetadata) => boolean;
}) {
  return (
    <div
      className="overflow-auto max-h-[62vh]"
      tabIndex={0}
      role="region"
      aria-label={locale === "uk-UA" ? "Таблиця звіту" : "Report table"}
    >
      <table className="w-full min-w-max border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-(--surface2)">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={
                  sortColumn === column.key
                    ? direction === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
                className="border-b border-r last:border-r-0 border-(--border) px-3 py-2.5 text-left font-semibold text-(--muted) whitespace-nowrap"
              >
                {isSortable(column) ? (
                  <button
                    type="button"
                    disabled={!isSortable(column)}
                    onClick={() => onSort?.(column)}
                    className="inline-flex items-center gap-1.5 disabled:cursor-default hover:text-(--text) disabled:hover:text-inherit focus-visible:outline-solid focus-visible:outline-2"
                  >
                    {column.label}
                    {sortColumn === column.key &&
                      (direction === "asc" ? (
                        <ArrowUp aria-hidden="true" size={11} />
                      ) : (
                        <ArrowDown aria-hidden="true" size={11} />
                      ))}
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${String(row.id ?? index)}:${String(row.currency ?? "")}`}
              className="border-b last:border-b-0 border-(--border-faint) hover:bg-(--input-bg)"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  style={getCellStyle?.(row, column)}
                  className={`max-w-md border-r last:border-r-0 border-(--border-faint) px-3 py-2 text-(--text) ${column.type === "text" || column.type === "source" ? "text-left" : "text-right tabular-nums"}`}
                >
                  {renderCell ? (
                    renderCell(row, column)
                  ) : (
                    <span
                      className="block truncate"
                      title={formatTableValue(
                        row[column.key],
                        column.type,
                        locale,
                      )}
                    >
                      {formatTableValue(row[column.key], column.type, locale)}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
