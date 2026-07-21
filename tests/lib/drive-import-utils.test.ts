import { describe, expect, it } from "vitest";
import { dedupeBySku } from "@/lib/drive-import-utils";

describe("Google Drive catalog import", () => {
  it("keeps one catalog item per SKU", () => {
    const items = [
      { sku: "A-1", stock: 1 },
      { sku: "B-2", stock: 3 },
      { sku: "A-1", stock: 5 },
    ];

    expect(dedupeBySku(items)).toEqual([
      { sku: "A-1", stock: 5 },
      { sku: "B-2", stock: 3 },
    ]);
  });
});
