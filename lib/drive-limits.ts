import { formatMessage } from "@/i18n/format-message";
import { driveLimitsMessages } from "@/messages/en.json";

export const MAX_DRIVE_ROWS = 100_000;

export function assertDriveRowLimit(totalRows: number): void {
  if (totalRows > MAX_DRIVE_ROWS) {
    throw new Error(formatMessage(driveLimitsMessages.rowLimit, { maximum: MAX_DRIVE_ROWS }));
  }
}
