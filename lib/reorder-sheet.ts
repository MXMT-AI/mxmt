import type { ReorderSimulation } from "@/lib/legacy-reorder-calc";
import type { SheetCell } from "@/lib/xlsx-workbook";
import { formatMessage } from "@/i18n/format-message";
import { reorderSheetMessages as ukrainianCopy } from "@/messages/uk.json";

export const REORDER_SHEET_HEADERS = [
  "SKU", ukrainianCopy.rEORDERSHEETHEADERSНазва, ukrainianCopy.rEORDERSHEETHEADERSКатегорія, ukrainianCopy.rEORDERSHEETHEADERSЗалишокШт, ukrainianCopy.rEORDERSHEETHEADERSЧистаШвидкістьШтД, ukrainianCopy.rEORDERSHEETHEADERSDOHЗаразДн,
  ukrainianCopy.rEORDERSHEETHEADERSДозамовленняШт, ukrainianCopy.rEORDERSHEETHEADERSЗакупкаГрн, ukrainianCopy.rEORDERSHEETHEADERSВартістьЗамовленняГрн, ukrainianCopy.rEORDERSHEETHEADERSЗалишокПісляШт, ukrainianCopy.rEORDERSHEETHEADERSDOHПісляДн,
];

const HEADER_ROW = 5;

export function buildReorderSheetValues(
  sim: ReorderSimulation,
  opts: { title: string; formulas: boolean }
): SheetCell[][] {
  const { formulas } = opts;
  const periodNote =
    formatMessage(ukrainianCopy.periodNoteДн, { periodDays: sim.periodDays }) +
    (sim.dateFrom ? ` (${sim.dateFrom} — ${sim.asOf ?? ukrainianCopy.periodNoteСьогодні})` : "");

  const values: SheetCell[][] = [
    [ukrainianCopy.valuesДозамовлення, opts.title, "", ukrainianCopy.valuesБренд, sim.brandName],
    [ukrainianCopy.valuesПокриттяДн, sim.coverDays, "", ukrainianCopy.valuesМножник, sim.qtyMultiplier],
    [
      ukrainianCopy.valuesФормула,
      ukrainianCopy.valuesЗамовленняШвидкістьПокриття,
      "",
      sim.leadTimeDays != null ? ukrainianCopy.valuesLeadTimeДн : ukrainianCopy.valuesПеріодДаних,
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
      ? [ukrainianCopy.рАЗОМ, "", "", sum("D"), "", "", sum("G"), "", sum("I"), sum("J"), ""]
      : [ukrainianCopy.рАЗОМ, "", "", t.stock, "", "", t.orderQty, "", t.orderCost, t.stockAfter, ""]
  );

  return values;
}
