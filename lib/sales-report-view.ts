import type { PublishedSalesReport } from "./sales-report";
import type { DataColumnMetadata } from "./data-table-api";
import { Prisma } from "@prisma/client";
import { salesReportViewMessages as englishCopy } from "@/messages/en.json";
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
  { key: "revenue", label: englishCopy.labelNetRevenue, type: "money" },
  { key: "units", label: englishCopy.labelMerchandiseUnits, type: "quantity" },
  { key: "orderCount", label: englishCopy.labelSaleOrders, type: "number" },
  { key: "returnOrderCount", label: englishCopy.labelReturnOrders, type: "number" },
  { key: "coveredGrossProfit", label: englishCopy.labelCoveredGrossProfit, type: "money" },
  { key: "coveredRevenue", label: englishCopy.labelCoveredRevenue, type: "money" },
  { key: "gmPct", label: englishCopy.labelCoveredGM, type: "percentage" },
  { key: "lyRevenue", label: englishCopy.labelSameDateLYRevenue, type: "money" },
  { key: "revenueDelta", label: englishCopy.labelRevenueChange, type: "money" },
  { key: "unitsDelta", label: englishCopy.labelUnitChange, type: "quantity" },
  {
    key: "lyCoveredGrossProfit",
    label: englishCopy.labelLYCoveredGrossProfit,
    type: "money",
  },
  { key: "lyGmPct", label: englishCopy.labelLYCoveredGM, type: "percentage" },

  { key: "revenueChangePct", label: englishCopy.labelRevenueVsLY, type: "percentage" },
  {
    key: "missingProfitCount",
    label: englishCopy.labelUncoveredProfitLines,
    type: "number",
  },
  { key: "coverage", label: englishCopy.labelProfitCoverage, type: "text" },
  { key: "comparisonReason", label: englishCopy.labelLYAvailability, type: "text" },
];
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
