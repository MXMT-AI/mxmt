import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { auditZavodWorkbook } from "@/lib/zavod-workbook-audit.mjs";
const serial = (year: number, month: number, day: number) =>
  (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000;
const reference = {
  period: { from: "2026-09-01", to: "2026-09-30" },
  metrics: {
    revenue: "290",
    grossProfit: "210",
    orderCount: "1",
    salesUnits: "3",
    stockCost: "200",
    stockUnits: "5",
    lyRevenue: "0",
    lyGrossProfit: "0",
  },
};
const headers = [
  "orderId",
  "id",
  "paymentDate",
  "statusId",
  "sajt",
  "product.amount",
  "product.price",
  "product.costPrice",
  "product.discount",
  "product.percentDiscount",
  "wrong-measure",
  "wrong-key",
];
function workbook(
  change?: (api: XLSX.WorkSheet, catalog: XLSX.WorkSheet) => void,
) {
  const api = XLSX.utils.aoa_to_sheet([
    headers,
    ["order", "order", serial(2026, 9, 15), 5, 38, 2, 100, 40, 10, 0],
    ["order", "order", serial(2026, 9, 15), 5, 38, 1, 100, 0, 0, 0],
    ["refusal", "refusal", serial(2026, 9, 15), 6, 38, 1, 500, 100, 0, 0],
    ["return", "return", serial(2026, 9, 15), 7, 38, 1, 50, 25, 0, 0],
  ]);
  api.G2.z = "dd.mm.yyyy";
  const catalog = XLSX.utils.aoa_to_sheet([
    ["ID", "Stock Qty", "Vendor Price", "Stock Amount"],
    ["SKU", 5, 40, 200],
  ]);
  change?.(api, catalog);
  const article: XLSX.WorkSheet = {
    M2: { t: "n", v: serial(2022, 1, 1) },
    M3: { t: "n", v: serial(2030, 12, 31) },
    M6: { t: "n", v: 0, f: "SUMIFS(ZAVOD_API!$K:$K,ZAVOD_API!$L:$L,$B6)" },
    AD4: { t: "n", v: 0, f: "SUBTOTAL(9,AD6:AD4002)" },
    "!ref": "A1:AX5002",
  };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, api, "ZAVOD_API");
  XLSX.utils.book_append_sheet(wb, catalog, "Product YML 2.0");
  XLSX.utils.book_append_sheet(wb, article, "ARTICLE REPORT");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
describe("frozen workbook evidence audit", () => {
  it("separates orders, lines, quantities and excluded refusals without altering agreed policy", () => {
    const result = auditZavodWorkbook(workbook(), reference),
      current = result.periods["2026-09"];
    expect(current).toMatchObject({
      lineCount: 2,
      distinctOrders: 1,
      units: "3",
      saleStatuses: [5, 59, 60],
      zeroCostRows: 1,
      accountingAccepted: false,
      candidateDiscountPerLineRevenue: "290",
      candidateDiscountPerUnitRevenue: "280",
      candidateUnitCostDifference: "210",
    });
    expect(current.rawRowsIncludingRefusals).toMatchObject({
      lineCount: 3,
      distinctOrders: 2,
      units: "4",
    });
    expect(result.customerAcceptance).toBe("NOT_APPROVED");
  });
  it("retains raw numeric prices despite incorrect cell date formatting and preserves Decimal arithmetic", () => {
    const result = auditZavodWorkbook(workbook(), reference);
    expect(result.periods["2026-09"].grossPriceTimesQuantity).toBe("300");
    expect(result.stock).toMatchObject({
      units: "5",
      cost: "200",
      observationDate: null,
    });
  });
  it("identifies schema, formula-reference, control-period and stock-date evidence gaps", () => {
    const result = auditZavodWorkbook(workbook(), reference);
    expect(result.missingLegacyAmountHeaders).toEqual([
      "ProductPaymentAmount",
      "ProductcostPriceAmount",
    ]);
    expect(result.article.formulas[0].references).toEqual([
      { column: "K", header: "wrong-measure" },
      { column: "L", header: "wrong-key" },
    ]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "WORKBOOK_DIFFERS_FROM_LEGACY_IMPORT_SCHEMA",
        "ARTICLE_FORMULAS_REFERENCE_DIFFERENT_FIELDS",
        "ARTICLE_CONTROLS_NOT_REFERENCE_MONTH",
        "ARTICLE_SUBTOTAL_RANGE_REQUIRES_TAIL_REVIEW",
        "SOURCE_STOCK_OBSERVATION_DATE_UNCONFIRMED",
        "RETURN_EVENT_DATES_UNVERIFIED",
      ]),
    );
  });
  it("does not treat missing discount flags as verified zero or lose known stock without a cached source subtotal", () => {
    const result = auditZavodWorkbook(
      workbook((api, catalog) => {
        delete api.J2;
        delete catalog.D2;
      }),
      reference,
    );
    expect(result.periods["2026-09"]).toMatchObject({
      invalidNumericRows: 1,
      units: "3",
    });
    expect(
      result.comparisons.find((r: any) => r.metric === "candidateRevenue")
        ?.status,
    ).toBe("BLOCKED");
    expect(result.stock).toMatchObject({
      units: "5",
      cost: "200",
      missingCachedStockAmountRows: 1,
    });
  });
  it("keeps undated paid sales visible rather than silently certifying month coverage", () => {
    const result = auditZavodWorkbook(
      workbook((api) => {
        delete api.C2;
      }),
      reference,
    );
    expect(result.undatedPaidSaleRows).toBe(1);
    expect(
      result.comparisons.find((r: any) => r.metric === "candidateRevenue")
        ?.status,
    ).toBe("BLOCKED");
  });
  it("does not count a missing order ID as one order or accept a missing amount field", () => {
    const result = auditZavodWorkbook(
      workbook((api) => {
        delete api.A2;
        delete api.B2;
      }),
      reference,
    );
    expect(result.periods["2026-09"].missingOrderRows).toBe(1);
    expect(
      result.comparisons.find(
        (r: any) => r.metric === "sourceDistinctSaleOrders",
      )?.status,
    ).toBe("BLOCKED");
    expect(() =>
      auditZavodWorkbook(
        workbook((api) => {
          api.G1.v = "unknown-price-field";
        }),
        reference,
      ),
    ).toThrow("REQUIRED_RAW_FIELDS_MISSING");
  });
});
