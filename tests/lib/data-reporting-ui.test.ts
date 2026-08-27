import { describe, expect, it } from "vitest";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import {
  currentKyivMonth,
  formatTableValue,
  nextSortDirection,
  resolveVisibleColumns,
  validateReportPeriod,
} from "@/lib/data-reporting-ui";

const columns: DataColumnMetadata[] = [
  { key: "article", label: "Article", type: "text", defaultVisible: true },
  { key: "sales", label: "Sales", type: "money", defaultVisible: true },
  { key: "source_a", label: "Source A", type: "source", defaultVisible: false },
];

describe("data reporting UI helpers", () => {
  it("uses valid saved columns in their saved order", () => {
    expect(resolveVisibleColumns(columns, ["sales", "missing", "article"]))
      .toEqual(["sales", "article"]);
  });

  it("falls back to default columns when no preference is saved", () => {
    expect(resolveVisibleColumns(columns, [])).toEqual(["article", "sales"]);
  });

  it("formats percentages from decimal report values", () => {
    expect(formatTableValue("0.125", "percentage", "en-GB")).toBe("12.5%");
  });

  it("renders missing values consistently", () => {
    expect(formatTableValue(null, "money", "uk-UA")).toBe("—");
  });

  it("toggles a repeated sort and resets a new one to ascending", () => {
    expect(nextSortDirection("sales", "asc", "sales")).toBe("desc");
    expect(nextSortDirection("sales", "desc", "article")).toBe("asc");
  });

  it("derives the current report month in the Kyiv timezone", () => {
    expect(currentKyivMonth(new Date("2026-01-31T22:30:00.000Z"))).toEqual({
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
    });
  });

  it("validates that both report dates exist and are ordered", () => {
    expect(validateReportPeriod("", "2026-08-31")).toBe("required");
    expect(validateReportPeriod("2026-09-01", "2026-08-31")).toBe("reversed");
    expect(validateReportPeriod("2026-08-01", "2026-08-31")).toBeNull();
  });
});
