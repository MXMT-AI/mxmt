import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, isRecord, parseOptionalJsonBody, serverError, validationError } from "@/lib/api-contracts";
import {
  ArticleCalculationInProgressError,
  ArticleReportImportError,
  ArticleReportPeriodError,
  calculateArticleReport,
} from "@/lib/article-report";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { data, response: parseResponse } = await parseOptionalJsonBody(request);
  if (parseResponse) return parseResponse;
  if (!isRecord(data)) return validationError(["body must be an object"]);

  const issues: string[] = [];
  const values: Record<string, string | undefined> = {};
  for (const field of ["importRunId", "dateFrom", "dateTo", "asOfDate"]) {
    const value = data[field];
    if (value !== undefined && typeof value !== "string") issues.push(`${field} must be a string`);
    values[field] = typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
  if (issues.length > 0) return validationError(issues);

  let importRunId = values.importRunId;
  if (!importRunId) {
    const source = await prisma.dataSource.findFirst({
      where: { tenantId: user.tenantId, activeImportRunId: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { activeImportRunId: true },
    });
    importRunId = source?.activeImportRunId ?? undefined;
  }
  if (!importRunId) return apiError("No active data import", 409, "NO_ACTIVE_IMPORT");

  try {
    const result = await calculateArticleReport({
      tenantId: user.tenantId,
      importRunId,
      dateFrom: values.dateFrom,
      dateTo: values.dateTo,
      asOfDate: values.asOfDate,
    });
    return NextResponse.json({ ok: true, calculation: result });
  } catch (error) {
    if (error instanceof ArticleReportPeriodError) {
      return apiError(error.message, 400, "INVALID_REPORT_PERIOD");
    }
    if (error instanceof ArticleReportImportError) {
      return apiError(error.message, 404, "IMPORT_NOT_FOUND");
    }
    if (error instanceof ArticleCalculationInProgressError) {
      return apiError(error.message, 409, "CALCULATION_IN_PROGRESS");
    }
    console.error("[data/calculate]", error);
    return serverError("Report calculation failed");
  }
}
