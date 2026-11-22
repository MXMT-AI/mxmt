import { apiError, isRecord } from "../api-contracts";
import { AiExecutionError } from "../ai-execution/contracts";
import { SheetsMappingError } from "./sheets-mapping-validation";
import { connectorsSheetsMappingApiMessages as englishApiMessages } from "@/messages/en.json";
export function sheetsMappingApiError(error: unknown, requestId?: string) {
  if (error instanceof Error && ["CATALOG_IDENTITY_CONFLICT", "DUPLICATE_CATALOG_SKU"].includes(error.message))
    return apiError(
      englishApiMessages.theCatalogueHasConflictingProductIdentities,
      422,
      "SHEETS_CATALOG_IDENTITY_CONFLICT",
      undefined,
      requestId,
    );
  if (error instanceof SheetsMappingError || error instanceof AiExecutionError)
    return apiError(
      englishApiMessages.checkTheSourceMappingFieldsActive,
      error.status,
      error.code,
      undefined,
      requestId,
    );
  const details = isRecord(error) ? error : {};
  const meta = isRecord(details.meta) ? details.meta : {};
  const adapter = isRecord(meta.driverAdapterError) ? meta.driverAdapterError : {};
  const cause = isRecord(adapter.cause) ? adapter.cause : {};
  const databaseCode = [cause.originalCode, meta.code].find(
    (value): value is string => typeof value === "string" && /^[A-Z0-9]{5}$/.test(value),
  );
  console.error(
    "[sheets/mapping]",
    {
      ...(requestId ? { requestId } : {}),
      ...(error instanceof Error ? { name: error.name } : {}),
      ...(typeof error === "object" && error !== null && "code" in error &&
        typeof error.code === "string" && /^[A-Z0-9_]{2,64}$/.test(error.code)
        ? { code: error.code } : {}),
      ...(databaseCode ? { databaseCode } : {}),
    },
  );
  return apiError(
    englishApiMessages.sheetsMappingIsTemporarilyUnavailable,
    503,
    "SHEETS_MAPPING_UNAVAILABLE",
    undefined,
    requestId,
  );
}
