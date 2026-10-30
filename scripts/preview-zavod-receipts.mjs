import { readFile } from "node:fs/promises";
import { readWorkbook } from "../lib/workbook-compat.mjs";
import { previewZavodReceiptSheet } from "../lib/zavod-receipt-workbook.mjs";

const file = process.argv[2];
if (!file) throw new Error("Usage: node scripts/preview-zavod-receipts.mjs <saved-workbook.xlsx>");
const workbook = readWorkbook(await readFile(file), { type: "buffer", sheets: ["Надходження товарів"], dense: true, cellDates: false, cellFormula: false, cellHTML: false });
const sheet = workbook.Sheets["Надходження товарів"];
if (!sheet) throw new Error("RECEIPT_SHEET_NOT_FOUND");
console.log(JSON.stringify(previewZavodReceiptSheet(sheet), null, 2));
