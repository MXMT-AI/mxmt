export const MAX_DRIVE_ROWS = 100_000;

export function assertDriveRowLimit(totalRows: number): void {
  if (totalRows > MAX_DRIVE_ROWS) {
    throw new Error(`Google Drive workbook cannot exceed ${MAX_DRIVE_ROWS} total rows`);
  }
}
