import { expect, it } from "vitest";
import { buildCsvPreviewPacket } from "@/components/settings/csv-import-card/build-csv-preview-packet";
import type { CsvFileDraft } from "@/components/settings/csv-import-card/csv-import-types";
import type { CsvResource } from "@/lib/connectors/csv/schema";
function file(resource: CsvResource): CsvFileDraft {
  return { name: `${resource}.csv`, headers: ["id"], file: { resource, bytes: "ZGVtbw==", delimiter: ",", columns: { id: "id" } } };
}
function input(): Parameters<typeof buildCsvPreviewPacket>[0] {
  return {
    sourceId: null,
    options: { schemaVersion: 1, mappingRevision: 3, timezone: "Europe/Kyiv", catalog: "partial", stock: "complete", history: null, receiptHistory: null, discountUnit: "percentage", approved: true, policy: { statuses: {}, channels: {}, amounts: { price: "net_unit", absoluteDiscount: "unit", currency: "EUR", cost: "unit" } } },
    files: { stock: file("stock"), products: file("products") },
    statuses: [{ code: "5", kind: "SALE" }, { code: "7", kind: "RETURN" }],
    channels: [{ code: "web", name: "Website" }],
    history: { orders: false, receipts: false, receiptBaseline: true, from: "2025-01-01T00:00:00Z", to: "2026-10-31T23:59:59Z" },
    receipts: { postedStatus: "posted", supplierCode: "external", supplierId: "supplier", costVerified: true },
  };
}
it("builds the packet in schema order and retains conventions, source and mappings", () => {
  const data = input();
  data.sourceId = "source";
  const before = JSON.stringify(data);
  const packet = buildCsvPreviewPacket(data);
  expect(packet.sourceId).toBe("source");
  expect(packet.files.map(file => file.resource)).toEqual(["products", "stock"]);
  expect(packet.files[0]).toBe(data.files.products!.file);
  expect(packet.options).toMatchObject({ mappingRevision: 3, catalog: "partial", stock: "complete", approved: true, discountUnit: "percentage", policy: { amounts: data.options.policy.amounts, statuses: { "5": "SALE", "7": "RETURN" }, channels: { web: "Website" } } });
  expect(JSON.stringify(data)).toBe(before);
});
it.each([[false, false], [true, false], [false, true], [true, true]])("includes only confirmed histories for orders=%s receipts=%s", (orders, receipts) => {
  const data = input();
  data.history.orders = orders;
  data.history.receipts = receipts;
  const options = buildCsvPreviewPacket(data).options;
  const interval = { from: data.history.from, to: data.history.to, complete: true };
  expect(options.history).toEqual(orders ? interval : null);
  expect(options.receiptHistory).toEqual(receipts ? interval : null);
  expect(options.receiptBaseline).toBe(receipts);
});
it("adds receipt rules only when the receipt file exists", () => {
  const data = input();
  expect(buildCsvPreviewPacket(data).options.policy.receipts).toBeUndefined();
  data.files.receipts = file("receipts");
  expect(buildCsvPreviewPacket(data).options.policy.receipts).toEqual({ postedStatuses: ["posted"], suppliers: { external: "supplier" }, productIdField: "id", currency: "EUR", unitCostVerified: true });
});
it.each(["statuses", "channels"] as const)("rejects duplicate %s codes without silently dropping a mapping", key => {
  const data = input();
  if (key === "statuses") data.statuses.push({ code: "5", kind: "RETURN" });
  else data.channels.push({ code: "web", name: "Duplicate" });
  expect(() => buildCsvPreviewPacket(data)).toThrow("DUPLICATE_MAPPING");
});
it("keeps null source and invalid drafts intact for server validation", () => {
  const data = input();
  data.history.orders = true;
  data.history.from = "invalid-date";
  data.statuses = [{ code: "", kind: "UNKNOWN" }];
  const packet = buildCsvPreviewPacket(data);
  expect(packet.sourceId).toBeNull();
  expect(packet.options.history!.from).toBe("invalid-date");
  expect(packet.options.policy.statuses).toEqual({ "": "UNKNOWN" });
});
