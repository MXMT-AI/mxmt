import type { DataColumnMetadata } from "@/lib/data-table-api";
import type { PublishedSalesReport } from "@/lib/sales-report";
import type { SalesView } from "@/lib/sales-report-view";

export type SalesReportData = Omit<
  PublishedSalesReport,
  "articles" | "brands" | "categories" | "channels"
> & {
  view: SalesView;
  table: {
    columns: DataColumnMetadata[];
    rows: Array<Record<string, unknown>>;
    pagination: { page: number; totalPages: number; totalRows: number };
  };
  oneOffOrderCount: number;
};
