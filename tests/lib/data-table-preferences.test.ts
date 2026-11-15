import { expect, it } from "vitest";
import { DATA_TABLE_KEYS, normalizeTablePreferences } from "@/lib/data-table-preferences";

it("preserves saved column order, sorting and valid legacy page sizes", () => {
  const saved = {
    visibleColumns: ["stock", "sku", "name"],
    pageSize: 10,
    sortColumn: "stock",
    sortDirection: "desc",
  };
  const preferences = normalizeTablePreferences({ article_report: saved });
  expect(preferences.article_report).toEqual(saved);
  expect(preferences.article_report.visibleColumns).not.toBe(saved.visibleColumns);
  expect(Object.keys(preferences)).toEqual([...DATA_TABLE_KEYS]);
});

it("replaces malformed legacy values with usable defaults and keeps valid column names", () => {
  const preferences = normalizeTablePreferences({
    product_yml: { visibleColumns: "sku", pageSize: -1, sortDirection: null },
    article_report: { visibleColumns: [null, "stock", 42, "sku"], pageSize: 25.5, sortColumn: 10, sortDirection: "invalid" },
  });
  expect(preferences.product_yml).toEqual({ visibleColumns: [], pageSize: 50, sortColumn: null, sortDirection: "asc" });
  expect(preferences.article_report).toEqual({
    visibleColumns: ["stock", "sku"], pageSize: 50, sortColumn: null, sortDirection: "asc",
  });
});

it("creates independent defaults for missing tables and successive calls", () => {
  const preferences = normalizeTablePreferences({});
  preferences.product_yml.visibleColumns.push("sku");
  expect(preferences.by_brand.visibleColumns).toEqual([]);
  expect(normalizeTablePreferences({}).product_yml.visibleColumns).toEqual([]);
});
