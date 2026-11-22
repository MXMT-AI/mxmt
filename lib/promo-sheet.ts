import type { PromoSimulation } from "@/lib/promo-calc";
import type { SheetCell } from "@/lib/xlsx-workbook";
import { formatMessage } from "@/i18n/format-message";
import { promoSheetMessages as ukrainianCopy } from "@/messages/uk.json";

export const PROMO_SHEET_HEADERS = [
  "SKU", ukrainianCopy.pROMOSHEETHEADERSНазва, ukrainianCopy.pROMOSHEETHEADERSКатегорія, ukrainianCopy.pROMOSHEETHEADERSЗалишокШт, ukrainianCopy.pROMOSHEETHEADERSЦінаГрн, ukrainianCopy.pROMOSHEETHEADERSЗакупкаГрн,
  ukrainianCopy.pROMOSHEETHEADERSЦінаЗіЗнижкою, ukrainianCopy.pROMOSHEETHEADERSМаржаДо, ukrainianCopy.pROMOSHEETHEADERSМаржаПісля, ukrainianCopy.pROMOSHEETHEADERSШвидкістьШтД,
  ukrainianCopy.pROMOSHEETHEADERSБезАкціїШт, ukrainianCopy.pROMOSHEETHEADERSПрогнозАкціїШт, ukrainianCopy.pROMOSHEETHEADERSВиручкаАкціїГрн, ukrainianCopy.pROMOSHEETHEADERSМаржаАкціїГрн,
  ukrainianCopy.pROMOSHEETHEADERSЗвільненийКапіталГрн, ukrainianCopy.pROMOSHEETHEADERSЗалишокПісляШт, ukrainianCopy.pROMOSHEETHEADERSWOHПісляДн,
];

const HEADER_ROW = 5;

export function buildPromoSheetValues(
  sim: PromoSimulation,
  opts: { title: string; formulas: boolean }
): SheetCell[][] {
  const { formulas } = opts;
  const periodNote =
    formatMessage(ukrainianCopy.periodNoteДн, { periodDays: sim.periodDays }) +
    (sim.dateFrom ? ` (${sim.dateFrom} — ${sim.asOf ?? ukrainianCopy.periodNoteСьогодні})` : "");
  const modelNote =
    sim.forecastModel === "ai_percent"
      ? formatMessage(ukrainianCopy.modelNoteЗалишкуПрогнозAI, { unitsToSellPercent: sim.unitsToSellPercent })
      : ukrainianCopy.modelNoteЕластичність2ВідБазовоїШвидкості;

  const values: SheetCell[][] = [
    [ukrainianCopy.valuesАкція, opts.title, "", ukrainianCopy.valuesБренд, sim.brandName],
    [ukrainianCopy.valuesЗнижка, sim.discountPercent, "", ukrainianCopy.valuesТривалістьДн, sim.durationDays],
    [ukrainianCopy.valuesМодельПрогнозу, modelNote, "", ukrainianCopy.valuesПеріодДаних, periodNote],
    [],
    [...PROMO_SHEET_HEADERS],
  ];

  sim.rows.forEach((row, i) => {
    const r = HEADER_ROW + 1 + i;
    if (formulas) {
      values.push([
        row.sku, row.name, row.category, row.stock, row.priceRetail, row.pricePurchase,
        `=ROUND(E${r}*(1-$B$2/100),2)`,
        `=IF(E${r}>0,ROUND((E${r}-F${r})/E${r}*100,1),"")`,
        `=IF(G${r}>0,ROUND((G${r}-F${r})/G${r}*100,1),"")`,
        row.velocityPerDay, row.baselineUnits, row.promoUnits,
        `=ROUND(L${r}*G${r},2)`,
        `=ROUND(L${r}*(G${r}-F${r}),2)`,
        `=ROUND(L${r}*F${r},2)`,
        `=D${r}-L${r}`,
        `=IF(J${r}>0,ROUND(P${r}/J${r},0),"")`,
      ]);
    } else {
      values.push([
        row.sku, row.name, row.category, row.stock, row.priceRetail, row.pricePurchase,
        row.newPrice, row.marginBeforePct ?? "", row.marginAfterPct ?? "",
        row.velocityPerDay, row.baselineUnits, row.promoUnits,
        row.promoRevenue, row.promoMarginUah, row.capitalReleased,
        row.stockAfter, row.wohAfterDays ?? "",
      ]);
    }
  });

  const first = HEADER_ROW + 1;
  const last = HEADER_ROW + sim.rows.length;
  const sum = (col: string) => `=SUM(${col}${first}:${col}${last})`;
  const t = sim.totals;

  values.push(
    formulas && sim.rows.length > 0
      ? [ukrainianCopy.рАЗОМ, "", "", sum("D"), "", "", "", "", "", "", sum("K"), sum("L"), sum("M"), sum("N"), sum("O"), sum("P"), ""]
      : [ukrainianCopy.рАЗОМ, "", "", t.stock, "", "", "", "", "", "", t.baselineUnits, t.promoUnits, t.promoRevenue, t.promoMarginUah, t.capitalReleased, t.stockAfter, ""]
  );

  return values;
}
