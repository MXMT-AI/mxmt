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
import { apiDataImportRouteMessages as englishCopy } from "@/messages/en.json";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser("ADMIN");
  if (response) return response;
  const { data, response: parseResponse } = await parseOptionalJsonBody(request);
  if (parseResponse) return parseResponse;
  if (!isRecord(data)) return validationError([englishCopy.bodyMustBeAnObject]);

  const issues: string[] = [];
  const calculate = data.calculate === undefined ? true : data.calculate;
  if (typeof calculate !== "boolean") issues.push(englishCopy.calculateMustBeABoolean);
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
      return apiError(englishCopy.connectGoogleSheetsForThis, error.status, error.code);
    }
    if (error instanceof RawImportInProgressError) {
      return apiError(englishCopy.anImportIsStillRunning, 409, "RAW_IMPORT_IN_PROGRESS");
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
      return apiError(englishCopy.importCouldNotFinishBecause, 503, "IMPORT_DATABASE_CONNECTION_INTERRUPTED");
    }
    console.error("[data/import]", error);
    return serverError(englishCopy.dataImportFailed);
  }
}
