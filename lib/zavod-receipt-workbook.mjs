import * as XLSX from "xlsx";
import { sheetToJson } from "./workbook-compat.mjs";
import { previewZavodReceipts, RECEIPT_PREVIEW_MAX_ROWS, RECEIPT_PREVIEW_MAX_COLUMNS } from "./zavod-receipt-preview.ts";

/** Reject oversized used ranges before conversion fills missing cells or materializes rows. */
export function previewZavodReceiptSheet(sheet) {
  if (sheet["!ref"]) {
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    // Column positions and the first row are physical header coordinates.
    if (!Number.isSafeInteger(range.e.r) || !Number.isSafeInteger(range.e.c) ||
      range.e.r < 0 || range.e.c < 0 ||
      range.e.r > RECEIPT_PREVIEW_MAX_ROWS || range.e.c + 1 > RECEIPT_PREVIEW_MAX_COLUMNS)
      throw new Error("RECEIPT_PREVIEW_LIMIT");
  }
  const [headers = [], ...rows] = sheetToJson(sheet, { header: 1, raw: true, defval: null });
  return previewZavodReceipts(headers.map(value => String(value ?? "")), rows);
}
