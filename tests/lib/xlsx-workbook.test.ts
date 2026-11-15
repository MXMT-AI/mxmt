import * as XLSX from "xlsx";
import { expect, it } from "vitest";
import { valuesToXlsxBuffer } from "@/lib/gsheets";
import { buildXlsxWorkbook } from "@/lib/xlsx-workbook";
import { buildPromoSheetValues } from "@/lib/promo-sheet";
import { buildReorderSheetValues } from "@/lib/reorder-sheet";

const common = { brandId: "sample", brandName: "Sample", periodDays: 30, asOf: null, dateFrom: null };
const row = { sku: "0001", name: "Jacket", category: "Outerwear", stock: 10, pricePurchase: 5, velocityPerDay: 1, stockAfter: 8, wohAfterDays: 8 };

const cases = [
  {
    name: "Уцінка",
    values: buildPromoSheetValues({
      ...common, discountPercent: 10, durationDays: 2, unitsToSellPercent: null, forecastModel: "elasticity",
      rows: [{ ...row, priceRetail: 10, newPrice: 9, marginBeforePct: 50, marginAfterPct: 44, baselineUnits: 1, promoUnits: 2, promoRevenue: 18, promoMarginUah: 8, capitalReleased: 10 }],
      totals: { skuCount: 1, stock: 10, frozenCapital: 50, baselineUnits: 1, promoUnits: 2, promoRevenue: 18, promoMarginUah: 8, baselineMarginUah: 5, capitalReleased: 10, stockAfter: 8 },
    }, { title: "Promo", formulas: true }),
    formula: "ROUND(E6*(1-$B$2/100),2)",
  },
  {
    name: "Дозамовлення",
    values: buildReorderSheetValues({
      ...common, qtyMultiplier: 1, coverDays: 14, leadTimeDays: null,
      rows: [{ ...row, wohNowDays: 10, orderQty: 4, orderCost: 20, stockAfter: 14, wohAfterDays: 14 }],
      totals: { skuCount: 1, stock: 10, orderQty: 4, orderCost: 20, stockAfter: 14 },
    }, { title: "Reorder", formulas: true }),
    formula: "MAX(0,ROUND(E6*$B$2*$E$2-D6,0))",
  },
];

it.each(cases)("round-trips the $name workbook across both export paths", async ({ name, values, formula }) => {
  const browserXlsx = await import("xlsx");
  const browserBuffer = browserXlsx.write(buildXlsxWorkbook(browserXlsx, values, name), { type: "array", bookType: "xlsx" });
  for (const content of [browserBuffer, valuesToXlsxBuffer(values, name)]) {
    const book = XLSX.read(content, { cellFormula: true });
    expect(book.SheetNames).toEqual([name]);
    expect(book.Sheets[name].A6).toMatchObject({ t: "s", v: "0001" });
    expect(book.Sheets[name].G6).toMatchObject({ t: "n", f: formula });
    expect(book.Sheets[name].A7.v).toBe("РАЗОМ");
    expect(book.Sheets[name].D7.f).toBe("SUM(D6:D6)");
  }
});
