import { describe, expect, it } from "vitest";
import { assertDriveRowLimit, MAX_DRIVE_ROWS } from "@/lib/drive-limits";

describe("Google Drive import limits", () => {
  it("accepts the current operational workbook size", () => {
    expect(() => assertDriveRowLimit(66_344)).not.toThrow();
  });

  it("rejects workbooks above the safety limit", () => {
    expect(() => assertDriveRowLimit(MAX_DRIVE_ROWS + 1)).toThrow(
      `Google Drive workbook cannot exceed ${MAX_DRIVE_ROWS} total rows`
    );
  });
});
