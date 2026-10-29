import { apiError } from "../api-contracts";
import { AiExecutionError } from "../ai-execution/contracts";
import { SheetsMappingError } from "./sheets-mapping-validation";
export function sheetsMappingApiError(error: unknown) {
  if (error instanceof SheetsMappingError || error instanceof AiExecutionError)
    return apiError(
      "Check the source, mapping fields, active import and preview revision.",
      error.status,
      error.code,
    );
  console.error(
    "[sheets/mapping]",
    error instanceof Error ? { name: error.name } : {},
  );
  return apiError(
    "Sheets mapping is temporarily unavailable.",
    503,
    "SHEETS_MAPPING_UNAVAILABLE",
  );
}
