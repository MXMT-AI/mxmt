import { apiError } from "./api-contracts";
import { ScenarioExportError } from "./scenario-csv";
import { RepricingError } from "./repricing";
import { ReorderingError } from "./reorder-calc";
import { merchandisingApiError } from "./merchandising-api-error";
import { scenarioExportApiMessages as englishCopy } from "@/messages/en.json";
export function scenarioExportApiError(error: unknown) {
  return error instanceof ScenarioExportError ||
    error instanceof RepricingError ||
    error instanceof ReorderingError
    ? apiError(
        englishCopy.couldNotExportThisScenario,
        error.status,
        error.code,
        "details" in error ? error.details : undefined,
      )
    : merchandisingApiError(error);
}
