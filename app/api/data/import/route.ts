import { NextRequest, NextResponse } from "next/server";
import { DriveConnectionError } from "@/lib/drive-connection";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, isRecord, parseOptionalJsonBody, serverError, validationError } from "@/lib/api-contracts";
import { RawImportInProgressError, RawImportExpiredError, TypedProjectionValidationError } from "@/lib/data-import";
import {
  ArticleCalculationInProgressError,
  ArticleReportImportError,
  ArticleReportPeriodError,
} from "@/lib/article-report";
import { isImportConnectionError } from "@/lib/import-batch";
import { runDataPipeline } from "@/lib/data-pipeline";
import { RawWorkbookValidationError } from "@/lib/data-import-workbook";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser("ADMIN");
  if (response) return response;
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
    if (error instanceof DriveConnectionError) {
      return apiError("Connect Google Sheets for this cabinet in Settings before importing.", error.status, error.code);
    }
    if (error instanceof RawImportInProgressError) {
      return apiError("An import is still running. Wait for it to finish and refresh status. Interrupted imports become retryable after 10 minutes.", 409, "RAW_IMPORT_IN_PROGRESS");
    }
    if (error instanceof RawImportExpiredError) {
      return apiError(error.message, 409, "RAW_IMPORT_EXPIRED");
    }
    if (error instanceof ArticleCalculationInProgressError) {
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
    if (isImportConnectionError(error)) {
      return apiError("Import could not finish because the database connection was interrupted. Please retry.", 503, "IMPORT_DATABASE_CONNECTION_INTERRUPTED");
    }
    console.error("[data/import]", error);
    return serverError("Data import failed");
  }
}
