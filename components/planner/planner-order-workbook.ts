import type { CartItem } from "./planner-types";

export function buildPlannerOrderWorkbook({ utils }: Pick<typeof import("xlsx"), "utils">, cart: CartItem[]) {
  const rows = cart.map(item => ({
    Brand: item.brandName,
    SKU: item.sku,
    Name: item.name,
    Category: item.category,
    Qty: item.qty,
    "Unit Price": item.price,
    Total: item.price * item.qty,
    Currency: item.currency,
  }));
  const sheet = utils.json_to_sheet(rows);
  sheet["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, "Purchase Order");
  return workbook;
}
