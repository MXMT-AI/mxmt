import { isLocale } from "@/i18n/routing";
import { ukSalesColumns } from "@/lib/sales-report-labels";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { apiError } from "@/lib/api-contracts";
import {
  getSalesReport,
  readPublishedSalesReport,
  SalesReportError,
} from "@/lib/sales-report";
import { SalesPeriodError } from "@/lib/sales-period";
import {
  salesReportView,
  SALES_VIEWS,
  type SalesView,
} from "@/lib/sales-report-view";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const p = request.nextUrl.searchParams,
    view = p.get("view") ?? "articles",
    page = Number(p.get("page") ?? 1),
    pageSize = Number(p.get("pageSize") ?? 25),
    q = p.get("q") ?? "",
    sort = p.get("sort") ?? "name",
    direction = p.get("direction") ?? "asc",
    id = p.get("calculationRunId"),
    format = p.get("format"),
    locale = p.get("locale") ?? "en";
  if (
    !isLocale(locale) ||
    !SALES_VIEWS.includes(view as SalesView) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 200 ||
    q.length > 200 ||
    sort.length > 80 ||
    !["asc", "desc"].includes(direction) ||
    (id !== null && (!id || id.length > 200)) ||
    (format !== null && format !== "csv")
  )
    return apiError("Invalid sales report query", 400, "INVALID_QUERY");
  if (format === "csv" && !id)
    return apiError(
      "Select a calculated report before export",
      400,
      "REPORT_ID_REQUIRED",
    );
  try {
    const report = id
      ? await readPublishedSalesReport(user.tenantId, id)
      : await getSalesReport(user.tenantId, {
          dateFrom: p.get("dateFrom") ?? undefined,
          dateTo: p.get("dateTo") ?? undefined,
        });
    const table = salesReportView(report, {
      view: view as SalesView,
      page: format === "csv" ? 1 : page,
      pageSize: format === "csv" ? 100000 : pageSize,
      q,
      sort,
      direction: direction as "asc" | "desc",
    });
    if (format === "csv") {
      const cell = (value: unknown) => {
        const raw = value == null ? "" : String(value),
          safe =
            /^[\s]*[=+\-@]/.test(raw) && !/^[-+]?\d+(\.\d+)?$/.test(raw)
              ? `'${raw}`
              : raw;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const csv =
        "\uFEFF" +
        [
          [locale === "uk" ? "ID розрахунку" : "Calculation ID", report.calculationRunId],
          [locale === "uk" ? "Версія формули" : "Formula version", report.calculationVersion],
          [locale === "uk" ? "Від" : "From", report.period.from, locale === "uk" ? "До" : "To", report.period.to],
          table.columns.map((c) => locale === "uk" ? ukSalesColumns[c.key] ?? c.label : c.label),
          ...table.rows.map((row) =>
            table.columns.map((c) => (row as Record<string, unknown>)[c.key]),
          ),
        ]
          .map((row) => row.map(cell).join(";"))
          .join("\r\n");
      return new Response(csv, {
        headers: {
          ...headers,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="sales-${view}-${report.period.from}-${report.period.to}.csv"`,
        },
      });
    }
    const { articles, brands, categories, channels, ...summary } = report;
    return NextResponse.json(
      {
        ...summary,
        view,
        table,
        oneOffOrders: summary.oneOffOrders.slice(0, 100),
        oneOffOrderCount: summary.oneOffOrders.length,
      },
      { headers },
    );
  } catch (error) {
    if (error instanceof SalesPeriodError)
      return apiError(error.message, 400, "INVALID_REPORT_PERIOD");
    if (error instanceof SalesReportError)
      return apiError(
        "Sales report unavailable. Check import progress and source settings.",
        error.status,
        error.code,
      );
    return apiError(
      "Could not calculate sales report. Retry after synchronization completes.",
      503,
      "SALES_REPORT_UNAVAILABLE",
    );
  }
}
