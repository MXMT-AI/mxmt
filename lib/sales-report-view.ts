import type { PublishedSalesReport } from "./sales-report";
import type { DataColumnMetadata } from "./data-table-api";
import { Prisma } from "@prisma/client";
export const SALES_VIEWS = [
  "articles",
  "brands",
  "categories",
  "channels",
] as const;
export type SalesView = (typeof SALES_VIEWS)[number];
export const SALES_COLUMNS: DataColumnMetadata[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "currency", label: "Currency", type: "text" },
  { key: "revenue", label: "Net revenue", type: "money" },
  { key: "units", label: "Merchandise units", type: "quantity" },
  { key: "orderCount", label: "Sale orders", type: "number" },
  { key: "returnOrderCount", label: "Return orders", type: "number" },
  { key: "coveredGrossProfit", label: "Covered gross profit", type: "money" },
  { key: "coveredRevenue", label: "Covered revenue", type: "money" },
  { key: "gmPct", label: "Covered GM", type: "percentage" },
  { key: "lyRevenue", label: "Same-date LY revenue", type: "money" },
  { key: "revenueDelta", label: "Revenue change", type: "money" },
  { key: "unitsDelta", label: "Unit change", type: "quantity" },
  {
    key: "lyCoveredGrossProfit",
    label: "LY covered gross profit",
    type: "money",
  },
  { key: "lyGmPct", label: "LY covered GM", type: "percentage" },

  { key: "revenueChangePct", label: "Revenue vs LY", type: "percentage" },
  {
    key: "missingProfitCount",
    label: "Uncovered profit lines",
    type: "number",
  },
  { key: "coverage", label: "Profit coverage", type: "text" },
  { key: "comparisonReason", label: "LY availability", type: "text" },
];
/** Sorting/search/pagination only project persisted numbers; financial arithmetic stays in the engine. */
export function salesReportView(
  report: PublishedSalesReport,
  options: {
    view: SalesView;
    page: number;
    pageSize: number;
    q: string;
    sort: string;
    direction: "asc" | "desc";
  },
) {
  const { view, page, pageSize, q, sort, direction } = options;
  const columns = SALES_COLUMNS;
  let rows = report[view].map((row) => ({
    id: row.id,
    name: row.name,
    ...row.current,
    lyRevenue: report.history.ly ? row.ly.revenue : null,
    revenueChangePct: row.revenueChangePct,
    comparisonReason: row.comparisonReason,
    revenueDelta: row.revenueDelta,
    unitsDelta: row.unitsDelta,
    lyCoveredGrossProfit: report.history.ly ? row.ly.coveredGrossProfit : null,
    lyGmPct: report.history.ly ? row.ly.gmPct : null,
  }));
  if (q)
    rows = rows.filter((row) =>
      `${row.name} ${row.id}`
        .toLocaleLowerCase()
        .includes(q.toLocaleLowerCase()),
    );
  const column = columns.find((c) => c.key === sort) ?? columns[0];
  rows.sort((a, b) => {
    const left = (a as Record<string, unknown>)[column.key],
      right = (b as Record<string, unknown>)[column.key];
    if (left == null || right == null)
      return left == null ? (right == null ? 0 : 1) : -1;
    const compare = ["money", "quantity", "percentage", "number"].includes(
      column.type,
    )
      ? new Prisma.Decimal(String(left)).cmp(String(right))
      : String(left).localeCompare(String(right));
    return (
      (direction === "desc" ? -compare : compare) ||
      JSON.stringify([a.id, a.currency]).localeCompare(
        JSON.stringify([b.id, b.currency]),
      )
    );
  });
  return {
    columns,
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: {
      page,
      pageSize,
      totalRows: rows.length,
      totalPages: Math.ceil(rows.length / pageSize),
    },
  };
}
