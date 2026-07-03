import type { ReorderSimulation } from "@/lib/reorder-calc";
import type { SheetCell } from "@/lib/promo-sheet";

// Будує 2D-масив для експорту симуляції дозамовлення.
// formulas=true → живі формули: покриття в B2, множник в E2 — можна міняти прямо в таблиці.

export const REORDER_SHEET_HEADERS = [
  "SKU", "Назва", "Категорія", "Залишок, шт", "Швидкість, шт/д", "WOH зараз, дн",
  "Дозамовлення, шт", "Закупка, грн", "Вартість замовлення, грн", "Залишок після, шт", "WOH після, дн",
];

const HEADER_ROW = 5;

export function buildReorderSheetValues(
  sim: ReorderSimulation,
  opts: { title: string; formulas: boolean }
): SheetCell[][] {
  const { formulas } = opts;
  const periodNote =
    `${sim.periodDays} дн.` +
    (sim.dateFrom ? ` (${sim.dateFrom} — ${sim.asOf ?? "сьогодні"})` : "");

  const values: SheetCell[][] = [
    ["Дозамовлення", opts.title, "", "Бренд", sim.brandName],
    ["Покриття, дн", sim.coverDays, "", "Множник", sim.qtyMultiplier],
    [
      "Формула",
      "замовлення = швидкість × покриття × множник − залишок",
      "",
      sim.leadTimeDays != null ? "Lead time, дн" : "Період даних",
      sim.leadTimeDays != null ? sim.leadTimeDays : periodNote,
    ],
    [],
    [...REORDER_SHEET_HEADERS],
  ];

  sim.rows.forEach((row, i) => {
    const r = HEADER_ROW + 1 + i;
    if (formulas) {
      values.push([
        row.sku, row.name, row.category, row.stock, row.velocityPerDay,
        row.wohNowDays ?? "",
        `=MAX(0,ROUND(E${r}*$B$2*$E$2-D${r},0))`,
        row.pricePurchase,
        `=ROUND(G${r}*H${r},2)`,
        `=D${r}+G${r}`,
        `=IF(E${r}>0,ROUND(J${r}/E${r},0),"")`,
      ]);
    } else {
      values.push([
        row.sku, row.name, row.category, row.stock, row.velocityPerDay,
        row.wohNowDays ?? "", row.orderQty, row.pricePurchase,
        row.orderCost, row.stockAfter, row.wohAfterDays ?? "",
      ]);
    }
  });

  const first = HEADER_ROW + 1;
  const last = HEADER_ROW + sim.rows.length;
  const sum = (col: string) => `=SUM(${col}${first}:${col}${last})`;
  const t = sim.totals;

  values.push(
    formulas && sim.rows.length > 0
      ? ["РАЗОМ", "", "", sum("D"), "", "", sum("G"), "", sum("I"), sum("J"), ""]
      : ["РАЗОМ", "", "", t.stock, "", "", t.orderQty, "", t.orderCost, t.stockAfter, ""]
  );

  return values;
}
