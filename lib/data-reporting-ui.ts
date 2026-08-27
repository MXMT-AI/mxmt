import type { DataColumnMetadata, DataColumnType } from "@/lib/data-table-api";

export type ReportPeriodIssue = "required" | "reversed" | null;

export interface ReportPeriodValues {
  dateFrom: string;
  dateTo: string;
}

export function currentKyivMonth(now = new Date()): ReportPeriodValues {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { dateFrom, dateTo: `${year}-${String(month).padStart(2, "0")}-${lastDay}` };
}

export function validateReportPeriod(dateFrom: string, dateTo: string): ReportPeriodIssue {
  if (!dateFrom || !dateTo) return "required";
  return dateFrom > dateTo ? "reversed" : null;
}

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
