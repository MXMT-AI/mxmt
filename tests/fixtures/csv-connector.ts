import type {
  CsvFileInput,
  CsvOptions,
  CsvResource,
} from "@/lib/connectors/csv/schema";
export const csvOptions: CsvOptions = {
  schemaVersion: 1,
  mappingRevision: 1,
  timezone: "Europe/Kyiv",
  catalog: "complete",
  stock: "complete",
  history: {
    from: "2024-01-01T00:00:00.000Z",
    to: "2026-10-25T09:00:00.000Z",
    complete: true,
  },
  receiptHistory: null,
  discountUnit: "amount",
  policy: {
    statuses: { "5": "SALE", "7": "RETURN" },
    channels: { "1": "Shop" },
    amounts: {
      price: "gross_unit",
      absoluteDiscount: "line",
      currency: "UAH",
      cost: "unit",
    },
  },
  approved: true,
};
export function csvFile(
  resource: CsvResource,
  rows: Record<string, string>[],
  headers = Object.keys(rows[0] ?? {}),
): CsvFileInput {
  const escape = (v: string) =>
    /[",\r\n]/.test(v) ? '"' + v.replaceAll('"', '""') + '"' : v;
  return {
    resource,
    delimiter: ",",
    columns: Object.fromEntries(headers.map((h) => [h, h])),
    bytes: Buffer.from(
      [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))]
        .map((r) => r.map(escape).join(","))
        .join("\r\n") + "\r\n",
    ).toString("base64"),
  };
}
export const csvProducts = [
  {
    productId: "sku-a",
    sku: "A",
    name: "Alpha",
    observedAt: "2026-08-01T00:00:00.000Z",
    retailPrice: "20.0000",
    brand: "Brand A",
  },
];
export const csvStock = [
  {
    productId: "sku-a",
    observedAt: "2026-10-25T06:00:00.000Z",
    quantity: "12",
  },
];
export const csvOrders = [
  {
    orderId: "00001",
    eventId: "sale",
    lineId: "00001",
    productId: "sku-a",
    sku: "A",
    statusId: "5",
    channelId: "1",
    orderedAt: "2026-09-10",
    paidAt: "2026-09-10",
    updatedAt: "2026-10-25T08:00:00.000Z",
    quantity: "2",
    unitPrice: "20.0000",
    discount: "0",
    costPrice: "10.0000",
  },
];
export function csvPacket() {
  return [
    csvFile("products", csvProducts),
    csvFile("stock", csvStock),
    csvFile("orders", csvOrders),
  ];
}
