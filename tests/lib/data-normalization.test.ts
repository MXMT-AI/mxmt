import { ProductMatchStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normalizeRawWorkbook } from "@/lib/data-normalization";
import { parseRawWorkbook } from "@/lib/data-import-workbook";

const productHeaders = [
  "ID", "Name", "Price", "Old Price", "Vendor Price", "Stock Qty", "Status",
  "Category", "Vendor", "Vendor Code", "Article", "Barcode",
];
const saleHeaders = [
  "orderId", "id", "orderTime", "statusId", "paymentDate", "product.amount",
  "product.manufacturer", "product.parameter", "product.productId", "product.sku",
  "ProductPaymentAmount", "ProductcostPriceAmount", "product.barcode", "updateAt",
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

  it("matches a sale by product barcode when its sku was converted to a date", () => {
    const result = normalize(
      [["SKU-1", "First", 100, "", 40, 3, "active", "Cat", "Brand", "VC-1", "ART-1", "2341901086754"]],
      [["order-1", "line-1", "2026-08-02T10:00:00Z", 5, "2026-08-02", 1, "", new Date("2037-09-10T00:00:00Z"), "", new Date("2037-09-10T00:00:00Z"), 100, 40, "2341901086754"]]
    );

    expect(result.saleLines[0]).toEqual(
      expect.objectContaining({
        matchStatus: ProductMatchStatus.MATCHED,
        matchMethod: "BARCODE_EXACT",
        resolvedProductId: "SKU-1",
      })
    );
    expect(result.issues.some((item) => item.code === "UNMATCHED_PRODUCT")).toBe(false);
  });

  it("matches formatting variants and reuses an unambiguous source product alias", () => {
    const result = normalize(
      [["6307 10 10 00", "First", 100, "", 40, 3, "active", "Cat", "Brand", "", "", ""]],
      [
        ["order-1", "line-1", "2026-08-02T10:00:00Z", 5, "2026-08-02", 1, "", "6307 10 10 00", "7750", "6307 10 10 00", 100, 40, ""],
        ["order-2", "line-2", "2026-08-03T10:00:00Z", 5, "2026-08-03", 1, "", "6307101000", "7750", "6307101000", 100, 40, ""],
        ["order-3", "line-3", "2026-08-04T10:00:00Z", 5, "2026-08-04", 1, "", new Date("2037-09-10T00:00:00Z"), "7750", new Date("2037-09-10T00:00:00Z"), 100, 40, ""],
      ]
    );

    expect(result.saleLines.map((line) => line.matchMethod)).toEqual([
      "SKU_EXACT_ID",
      "COMPACT_IDENTIFIER",
      "SOURCE_PRODUCT_ID_ALIAS",
    ]);
    expect(result.saleLines.every((line) => line.matchStatus === ProductMatchStatus.MATCHED)).toBe(true);
    expect(result.issues.some((item) => item.code === "UNMATCHED_PRODUCT")).toBe(false);
  });

  it("infers missing final payment dates from the correct lifecycle timestamp", () => {
    const result = normalize(
      [["SKU-1", "First", 100, "", 40, 3, "active", "Cat", "Brand", "", "", ""]],
      [
        ["order-1", "sale-1", "2026-08-05T10:00:00Z", 5, "", 1, "", "", "", "SKU-1", 100, 40, "", "2026-08-07T10:00:00Z"],
        ["order-2", "return-1", "2026-08-01T10:00:00Z", 7, "", 1, "", "", "", "SKU-1", 100, 40, "", "2026-08-10T10:00:00Z"],
      ]
    );

    expect(result.saleLines.map((line) => line.paymentDate?.toISOString())).toEqual([
      "2026-08-05T00:00:00.000Z",
      "2026-08-10T00:00:00.000Z",
    ]);
    expect(result.saleLines.map((line) => line.normalizedSales?.toString())).toEqual(["100", "-100"]);
    expect(result.issues.filter((item) => item.code === "INFERRED_PAYMENT_DATE")).toEqual([
      expect.objectContaining({ rowNumber: 2, severity: "INFO", context: expect.objectContaining({ fallbackField: "orderTime" }) }),
      expect.objectContaining({ rowNumber: 3, severity: "INFO", context: expect.objectContaining({ fallbackField: "updateAt" }) }),
    ]);
    expect(result.issues.some((item) => item.code === "INVALID_PAYMENT_DATE")).toBe(false);
  });

  it("includes the first identical sale line and excludes only later copies", () => {
    const duplicateRow = [
      "order-1", "line-1", "2026-08-02T10:00:00Z", 5, "2026-08-02", 1,
      "", "", "", "SKU-1", 100, 40, "", "2026-08-02T10:01:00Z",
    ];
    const result = normalize(
      [["SKU-1", "First", 100, "", 40, 3, "active", "Cat", "Brand", "", "", ""]],
      [duplicateRow, [...duplicateRow]]
    );

    expect(result.saleLines.map((line) => line.normalizedSales?.toString() ?? null)).toEqual([
      "100",
      null,
    ]);
    expect(result.issues.filter((item) => item.code === "DUPLICATE_SALE_LINE")).toEqual([
      expect.objectContaining({ rowNumber: 3 }),
    ]);
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
