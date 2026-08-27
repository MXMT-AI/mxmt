import { NextRequest, NextResponse } from "next/server";
import { isDriveConfigured } from "@/lib/gdrive";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, isRecord, parseOptionalJsonBody, serverError, validationError } from "@/lib/api-contracts";
import { RawImportInProgressError, TypedProjectionValidationError } from "@/lib/data-import";
import {
  ArticleCalculationInProgressError,
  ArticleReportImportError,
  ArticleReportPeriodError,
} from "@/lib/article-report";
import { runDataPipeline } from "@/lib/data-pipeline";
import { RawWorkbookValidationError } from "@/lib/data-import-workbook";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser("ADMIN");
  if (response) return response;
  if (!isDriveConfigured()) {
    return apiError("Google Drive is not configured", 400, "DRIVE_NOT_CONFIGURED");
  }
  const { data, response: parseResponse } = await parseOptionalJsonBody(request);
  if (parseResponse) return parseResponse;
  if (!isRecord(data)) return validationError(["body must be an object"]);

  const issues: string[] = [];
  const calculate = data.calculate === undefined ? true : data.calculate;
  if (typeof calculate !== "boolean") issues.push("calculate must be a boolean");
  const dates = Object.fromEntries(
    ["dateFrom", "dateTo", "asOfDate"].map((field) => {
      const value = data[field];
      if (value !== undefined && typeof value !== "string") issues.push(`${field} must be a YYYY-MM-DD string`);
      return [field, typeof value === "string" ? value : undefined];
    })
  ) as { dateFrom?: string; dateTo?: string; asOfDate?: string };
  if (issues.length > 0) return validationError(issues);

  try {
    const result = await runDataPipeline({ tenantId: user.tenantId, calculate: calculate as boolean, ...dates });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RawImportInProgressError || error instanceof ArticleCalculationInProgressError) {
      return apiError(error.message, 409, "DATA_PIPELINE_IN_PROGRESS");
    }
    if (error instanceof TypedProjectionValidationError || error instanceof RawWorkbookValidationError) {
      return apiError(error.message, 422, "IMPORT_VALIDATION_FAILED");
    }
    if (error instanceof ArticleReportPeriodError) {
      return apiError(error.message, 400, "INVALID_REPORT_PERIOD");
    }
    if (error instanceof ArticleReportImportError) {
      return apiError(error.message, 409, "IMPORTED_DATA_NOT_ACTIVE");
    }
    console.error("[data/import]", error);
    return serverError("Data import failed");
  }
}
