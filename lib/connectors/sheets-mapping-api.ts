import { apiError } from "../api-contracts";
import { AiExecutionError } from "../ai-execution/contracts";
import { SheetsMappingError } from "./sheets-mapping-validation";
export function sheetsMappingApiError(error: unknown, requestId?: string) {
  if (error instanceof SheetsMappingError || error instanceof AiExecutionError)
    return apiError(
      "Check the source, mapping fields, active import and preview revision.",
      error.status,
      error.code,
      undefined,
      requestId,
    );
  console.error(
    "[sheets/mapping]",
    {
      ...(requestId ? { requestId } : {}),
      ...(error instanceof Error ? { name: error.name } : {}),
      // Database messages may contain source values or SQL. Log only bounded codes.
      ...(typeof error === "object" && error !== null && "code" in error &&
        typeof error.code === "string" && /^[A-Z0-9_]{2,64}$/.test(error.code)
        ? { code: error.code } : {}),
    },
  );
  return apiError(
    "Sheets mapping is temporarily unavailable.",
    503,
    "SHEETS_MAPPING_UNAVAILABLE",
    undefined,
    requestId,
  );
}
