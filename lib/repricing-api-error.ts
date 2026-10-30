import { apiError } from "./api-contracts";
import { RepricingError } from "./repricing";
import { merchandisingApiError } from "./merchandising-api-error";
export function repricingApiError(error: unknown) {
  return error instanceof RepricingError
    ? apiError(
        error.status === 400
          ? "Invalid repricing request."
          : error.status === 422
            ? "Repricing selection or prices require correction."
            : "Repricing inputs unavailable. Check the snapshot and synchronization.",
        error.status,
        error.code,
        error.details,
      )
    : merchandisingApiError(error);
}
