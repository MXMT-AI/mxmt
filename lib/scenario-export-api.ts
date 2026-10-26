import { apiError } from "./api-contracts";
import { ScenarioExportError } from "./scenario-csv";
import { RepricingError } from "./repricing";
import { ReorderingError } from "./reorder-calc";
import { merchandisingApiError } from "./merchandising-api-error";
/** Preserve typed validation/conflict errors without exposing database or connector exceptions. */
export function scenarioExportApiError(error: unknown) {
  return error instanceof ScenarioExportError ||
    error instanceof RepricingError ||
    error instanceof ReorderingError
    ? apiError(
        "Could not export this scenario. Check preview readiness, permissions and the export ID.",
        error.status,
        error.code,
        "details" in error ? error.details : undefined,
      )
    : merchandisingApiError(error);
}
