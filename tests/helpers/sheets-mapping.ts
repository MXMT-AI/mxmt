import {
  SHEETS_PRODUCT_FIELDS,
  SHEETS_ORDER_FIELDS,
  type SheetsFieldMapping,
  type SheetsMappingInput,
} from "@/lib/sheets-mapping-contract";
const columns = (names: readonly string[]) =>
  names.map((label, i) => ({
    key: `col_${String.fromCharCode(97 + i)}`,
    label,
  }));
export const input: SheetsMappingInput = {
  sourceId: "sheet",
  fileId: "file",
  timezone: "Europe/Kyiv",
  importRunId: "run",
  sourceChecksum: "checksum",
  importedAt: "2026-10-29T10:00:00.000Z",
  sheets: [
    {
      id: "products",
      sheetKey: "product_yml",
      sourceName: "Product YML 2.0",
      columns: columns(SHEETS_PRODUCT_FIELDS),
      checksum: "p",
      rowCount: 1,
    },
    {
      id: "orders",
      sheetKey: "zavod_api",
      sourceName: "ZAVOD_API",
      columns: columns(SHEETS_ORDER_FIELDS),
      checksum: "o",
      rowCount: 1,
    },
  ],
};
export function mapping(): SheetsFieldMapping {
  return {
    version: 1,
    products: Object.fromEntries(
      SHEETS_PRODUCT_FIELDS.map((field, i) => [
        field,
        `col_${String.fromCharCode(97 + i)}`,
      ]),
    ) as SheetsFieldMapping["products"],
    orders: Object.fromEntries(
      SHEETS_ORDER_FIELDS.map((field, i) => [
        field,
        `col_${String.fromCharCode(97 + i)}`,
      ]),
    ) as SheetsFieldMapping["orders"],
    policy: {
      statuses: { "5": "SALE", "7": "RETURN" },
      channels: { "1": "Store" },
      currency: "UAH",
      salesAmount: "net_line",
      costAmount: "line",
      lineIdentity: "column",
      stockObservation: "unverified",
      stockReference: "",
      defaultProductKind: "UNKNOWN",
      productKinds: { Watches: "MERCHANDISE" },
    },
  };
}
