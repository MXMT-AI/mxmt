import type { PromoSimulation } from "@/lib/promo-calc";

// Будує 2D-масив для експорту симуляції акції.
// formulas=true → живі формули для Google Sheets (знижка в B2, можна міняти);
// formulas=false → готові числа (Excel-файл).

export type SheetCell = string | number;

export const PROMO_SHEET_HEADERS = [
  "SKU", "Назва", "Категорія", "Залишок, шт", "Ціна, грн", "Закупка, грн",
  "Ціна зі знижкою", "Маржа до, %", "Маржа після, %", "Швидкість, шт/д",
  "Без акції, шт", "Прогноз акції, шт", "Виручка акції, грн", "Маржа акції, грн",
  "Звільнений капітал, грн", "Залишок після, шт", "WOH після, дн",
];

const HEADER_ROW = 5; // рядок заголовків таблиці (1-індексований)

export function buildPromoSheetValues(
  sim: PromoSimulation,
  opts: { title: string; formulas: boolean }
): SheetCell[][] {
  const { formulas } = opts;
  const periodNote =
    `${sim.periodDays} дн.` +
    (sim.dateFrom ? ` (${sim.dateFrom} — ${sim.asOf ?? "сьогодні"})` : "");
  const modelNote =
    sim.forecastModel === "ai_percent"
      ? `${sim.unitsToSellPercent}% залишку (прогноз AI)`
      : "еластичність ×2 від базової швидкості";

  const values: SheetCell[][] = [
    ["Акція", opts.title, "", "Бренд", sim.brandName],
    ["Знижка, %", sim.discountPercent, "", "Тривалість, дн", sim.durationDays],
    ["Модель прогнозу", modelNote, "", "Період даних", periodNote],
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
      ? ["РАЗОМ", "", "", sum("D"), "", "", "", "", "", "", sum("K"), sum("L"), sum("M"), sum("N"), sum("O"), sum("P"), ""]
      : ["РАЗОМ", "", "", t.stock, "", "", "", "", "", "", t.baselineUnits, t.promoUnits, t.promoRevenue, t.promoMarginUah, t.capitalReleased, t.stockAfter, ""]
  );

  return values;
}
