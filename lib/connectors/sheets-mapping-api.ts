import { apiError, isRecord } from "../api-contracts";
import { AiExecutionError } from "../ai-execution/contracts";
import { SheetsMappingError } from "./sheets-mapping-validation";
/** Preserve safe diagnostic codes while keeping raw database error data private. */
export function sheetsMappingApiError(error: unknown, requestId?: string) {
  if (error instanceof SheetsMappingError || error instanceof AiExecutionError)
    return apiError(
      "Check the source, mapping fields, active import and preview revision.",
      error.status,
      error.code,
      undefined,
      requestId,
    );
  const details = isRecord(error) ? error : {};
  const meta = isRecord(details.meta) ? details.meta : {};
  const adapter = isRecord(meta.driverAdapterError) ? meta.driverAdapterError : {};
  const cause = isRecord(adapter.cause) ? adapter.cause : {};
  // Prisma 7's pg adapter retains SQLSTATE in driverAdapterError.cause;
  // older engines expose it directly in meta.code.
  const databaseCode = [cause.originalCode, meta.code].find(
    (value): value is string => typeof value === "string" && /^[A-Z0-9]{5}$/.test(value),
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
      ...(databaseCode ? { databaseCode } : {}),
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
