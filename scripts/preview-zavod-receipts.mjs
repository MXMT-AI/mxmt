import { readFile } from "node:fs/promises";
import { readWorkbook, sheetToJson } from "../lib/workbook-compat.mjs";
import { previewZavodReceipts } from "../lib/zavod-receipt-preview.ts";

const file = process.argv[2];
if (!file) throw new Error("Usage: node scripts/preview-zavod-receipts.mjs <saved-workbook.xlsx>");
const workbook = readWorkbook(await readFile(file), { type: "buffer", sheets: ["Надходження товарів"], dense: true, cellDates: false, cellFormula: false, cellHTML: false });
const sheet = workbook.Sheets["Надходження товарів"];
if (!sheet) throw new Error("RECEIPT_SHEET_NOT_FOUND");
const [headers = [], ...rows] = sheetToJson(sheet, { header: 1, raw: true, defval: null });
console.log(JSON.stringify(previewZavodReceipts(headers.map(value => String(value ?? "")), rows), null, 2));
