export const DATA_TABLE_KEYS = [
  "product_yml",
  "zavod_api",
  "article_report",
  "by_brand",
  "by_category",
] as const;

export type DataTableKey = (typeof DATA_TABLE_KEYS)[number];

export interface InitialTablePreference {
  visibleColumns: string[];
  pageSize: number;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
}

export interface TablePreferenceInput {
  visibleColumns?: unknown;
  pageSize?: unknown;
  sortColumn?: unknown;
  sortDirection?: unknown;
}

export function isDataTableKey(value: string): value is DataTableKey {
  return (DATA_TABLE_KEYS as readonly string[]).includes(value);
}

function normalizeTablePreference(preference: TablePreferenceInput = {}): InitialTablePreference {
  const { pageSize, sortColumn } = preference;
  return {
    visibleColumns: Array.isArray(preference.visibleColumns)
      ? preference.visibleColumns.filter((value): value is string => typeof value === "string")
      : [],
    pageSize: typeof pageSize === "number" && Number.isInteger(pageSize) && pageSize >= 10 && pageSize <= 200
      ? pageSize
      : 50,
    sortColumn: typeof sortColumn === "string" ? sortColumn : null,
    sortDirection: preference.sortDirection === "desc" ? "desc" : "asc",
  };
}

export function normalizeTablePreferences(
  initial: Partial<Record<DataTableKey, TablePreferenceInput>>,
): Record<DataTableKey, InitialTablePreference> {
  return {
    product_yml: normalizeTablePreference(initial.product_yml),
    zavod_api: normalizeTablePreference(initial.zavod_api),
    article_report: normalizeTablePreference(initial.article_report),
    by_brand: normalizeTablePreference(initial.by_brand),
    by_category: normalizeTablePreference(initial.by_category),
  };
}
