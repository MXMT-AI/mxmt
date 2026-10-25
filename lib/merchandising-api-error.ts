import { apiError } from "./api-contracts";
import { ScreenApiError } from "./merchandising-snapshot";
import { SalesReportError } from "./sales-report";
import { DailySkuError } from "./sku-daily-store";
import { SalesPeriodError } from "./sales-period";
import { DailySkuPeriodError } from "./sku-daily-period";
export function merchandisingApiError(error: unknown) {
  if (
    error instanceof ScreenApiError ||
    error instanceof SalesReportError ||
    error instanceof DailySkuError
  )
    return apiError(
      error.status === 400
        ? "Invalid merchandising screen query."
        : "Merchandising data unavailable. Check the selected snapshot, source and import progress.",
      error.status,
      error.code,
    );
  if (error instanceof SalesPeriodError || error instanceof DailySkuPeriodError)
    return apiError(error.message, 400, "INVALID_SCREEN_PERIOD");
  return apiError(
    "Could not load merchandising data. Retry after synchronization completes.",
    503,
    "SCREEN_DATA_UNAVAILABLE",
  );
}
