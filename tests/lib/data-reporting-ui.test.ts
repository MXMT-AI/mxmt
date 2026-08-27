import { describe, expect, it } from "vitest";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import {
  formatTableValue,
  nextSortDirection,
  resolveVisibleColumns,
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
});
