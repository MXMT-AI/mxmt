import type { CellObject } from "xlsx";

export type SheetCell = string | number;

export function buildXlsxWorkbook(
  { utils }: Pick<typeof import("xlsx"), "utils">,
  values: SheetCell[][],
  sheetName: string,
) {
  const sheet = utils.aoa_to_sheet(values);

  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    const cell: CellObject | undefined = sheet[address];
    if (cell && typeof cell.v === "string" && cell.v.startsWith("=")) {
      cell.f = cell.v.slice(1);
      cell.t = "n";
      cell.v = 0;
    }
  }

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, sheetName);
  return workbook;
}
