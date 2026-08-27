import type { DataColumnMetadata, DataColumnType } from "@/lib/data-table-api";

export function resolveVisibleColumns(
  columns: DataColumnMetadata[],
  savedColumns: string[]
): string[] {
  const available = new Set(columns.map((column) => column.key));
  const saved = savedColumns.filter((key) => available.has(key));
  if (saved.length > 0) return saved;

  const defaults = columns
    .filter((column) => column.defaultVisible !== false)
    .map((column) => column.key);
  return defaults.length > 0 ? defaults : columns.map((column) => column.key);
}

export function formatTableValue(
  value: unknown,
  type: DataColumnType,
  locale: string
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "source" || type === "text") {
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }
  if (type === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(locale).format(date);
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (type === "percentage") {
    return new Intl.NumberFormat(locale, {
      style: "percent",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numeric);
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: type === "quantity" ? 4 : 2,
  }).format(numeric);
}

export function nextSortDirection(
  currentColumn: string | null,
  currentDirection: "asc" | "desc",
  selectedColumn: string
): "asc" | "desc" {
  return currentColumn === selectedColumn && currentDirection === "asc" ? "desc" : "asc";
}
