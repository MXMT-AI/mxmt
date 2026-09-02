import { ProductMatchStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normalizeRawWorkbook } from "@/lib/data-normalization";
import { parseRawWorkbook } from "@/lib/data-import-workbook";

const productHeaders = [
  "ID", "Name", "Price", "Old Price", "Vendor Price", "Stock Qty", "Status",
  "Category", "Vendor", "Vendor Code", "Article",
];
const saleHeaders = [
  "orderId", "id", "orderTime", "statusId", "paymentDate", "product.amount",
  "product.manufacturer", "product.parameter", "product.productId", "product.sku",
  "ProductPaymentAmount", "ProductcostPriceAmount",
];

function workbook(products: unknown[][], sales: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([productHeaders, ...products], { cellDates: true }),
    "Product YML 2.0"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([saleHeaders, ...sales], { cellDates: true }),
    "ZAVOD_API"
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function normalize(products: unknown[][], sales: unknown[][]) {
  return normalizeRawWorkbook(parseRawWorkbook(workbook(products, sales)));
}

describe("typed source normalization", () => {
  it("keeps coupon service rows out of product warnings and calculated sales", () => {
    const result = normalize(
      [["SKU-1", "First", 100, "", 40, 3, "active", "Cat", "Brand", "VC-1", "ART-1"]],
      [["order-1", "coupon-1", "2026-08-02T10:00:00Z", 5, "2026-08-02", 1, "", "COUPON", "", "", 100, 0]]
    );

    expect(result.saleLines).toHaveLength(1);
    expect(result.saleLines[0].normalizedSales).toBeNull();
    expect(result.issues.some((item) => item.code === "UNMATCHED_PRODUCT")).toBe(false);
  });

  it("ignores formatting-only product rows but blocks populated rows without valid identity", () => {
    const result = normalize(
      [
        ["SKU-1", "First", 100, "", 40, 3, "active", "Category", "Brand", "VC-1", "ART-1"],
        [],
        ["", "Missing ID", 100, "", 40, 1],
        ["SKU-1", "Duplicate", 100, "", 40, 1],
      ],
      [["order", "line", "", 6, "", 1, "", "", "", "SKU-1", 0, 0]]
    );

    expect(result.products).toHaveLength(2);
    expect(result.blockingIssues.map((item) => item.code)).toEqual(
      expect.arrayContaining(["MISSING_PRODUCT_ID", "DUPLICATE_PRODUCT_ID"])
    );
  });

  it("applies resolver priority and normalizes sales and returns with absolute source values", () => {
    const result = normalize(
      [
        ["SKU-1", "First", 100, 120, 40, 3, "active", "Cat", "Brand", "VC-1", "ART-1"],
        ["Case-ID", "Case", 200, "", 80, 2, "active", "Cat", "Brand", "VC-2", "ART-2"],
      ],
      [
        ["order-1", "line-1", "2026-08-02T10:00:00Z", 5, "2026-08-02T23:00:00Z", -2, "Maker", "", "internal", " SKU-1 ", -200, -80],
        ["order-2", "line-2", "2026-08-03T10:00:00Z", 7, "2026-08-03T10:00:00Z", 1, "Maker", "", "internal", "case-id", 200, 80],
        ["order-3", "line-3", "2026-08-04T10:00:00Z", 5, "2026-08-04T10:00:00Z", 1, "Maker", "VC-1", "internal", "unknown", 100, 40],
        ["order-4", "line-4", "2026-08-04T10:00:00Z", 6, "bad-date", 1, "Maker", "", "internal", "SKU-1", 100, 40],
      ]
    );

    expect(result.blockingIssues).toEqual([]);
    expect(result.saleLines.map((line) => [line.matchMethod, line.resolvedProductId])).toEqual([
      ["SKU_EXACT_ID", "SKU-1"],
      ["SKU_CASE_INSENSITIVE_ID", "Case-ID"],
      ["PARAMETER_ARTICLE_OR_VENDOR_CODE", "SKU-1"],
      ["SKU_EXACT_ID", "SKU-1"],
    ]);
    expect(result.saleLines[0].normalizedQuantity?.toString()).toBe("2");
    expect(result.saleLines[0].normalizedSales?.toString()).toBe("200");
    expect(result.saleLines[1].normalizedQuantity?.toString()).toBe("-1");
    expect(result.saleLines[1].normalizedCost?.toString()).toBe("-80");
    expect(result.saleLines[3].normalizedQuantity).toBeNull();
    expect(result.saleLines[0].paymentDate?.toISOString()).toBe("2026-08-03T00:00:00.000Z");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "INVALID_NON_FINAL_PAYMENT_DATE", rowNumber: 5 })
    );
  });

  it("excludes ambiguous, unmatched, invalid-date, and duplicate final rows with issues", () => {
    const result = normalize(
      [
        ["SKU-1", "First", 100, "", 40, 3, "active", "Cat", "Brand", "VC-1", "DUP"],
        ["SKU-2", "Second", 100, "", 40, 3, "active", "Cat", "Brand", "VC-2", "DUP"],
      ],
      [
        ["o1", "duplicate-line", "", 5, "2026-08-01", 1, "", "", "", "DUP", 100, 40],
        ["o1", "duplicate-line", "", 5, "2026-08-01", 1, "", "", "", "DUP", 100, 40],
        ["o2", "line-2", "", 5, "2026-08-01", 1, "", "", "", "UNKNOWN", 100, 40],
        ["o3", "line-3", "", 5, "bad-date", 1, "", "", "", "SKU-1", 100, 40],
      ]
    );

    expect(result.saleLines.every((line) => line.normalizedSales === null)).toBe(true);
    expect(result.saleLines[0].matchStatus).toBe(ProductMatchStatus.AMBIGUOUS);
    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "DUPLICATE_SALE_LINE",
        "AMBIGUOUS_PRODUCT_MATCH",
        "UNMATCHED_PRODUCT",
        "INVALID_PAYMENT_DATE",
      ])
    );
  });
});
