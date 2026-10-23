import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { SalesDriveConnector } from "@/lib/connectors/salesdrive";
import { parseSalesDriveCredentials } from "@/lib/connectors/config";
import { decryptCredentials, encryptCredentials } from "@/lib/connectors/secrets";
import type { MerchandisingConnector } from "@/lib/connectors/contract";
import { MockConnector } from "../fixtures/mock-connector";

const credentials = { accountHost: "demo.salesdrive.me", ordersApiKey: "orders-secret", receiptsApiKey: "receipts-secret", ymlUrl: "https://demo.salesdrive.me/export/yml/export.yml?publicKey=feed-secret" };
const xml = '<yml_catalog><shop><offers><offer id="p1"><name>Dress</name><vendorCode>SKU1</vendorCode><price>123.4567</price><currencyId>UAH</currencyId><quantity_in_stock>2</quantity_in_stock></offer></offers></shop></yml_catalog>';
const order = { id: 1, statusId: 5, sajt: 10, orderTime: "2026-10-01 12:00:00", paymentDate: "2026-10-02", products: [{ productId: 1, sku: "SKU1", amount: 2, price: 100, discount: 10, percentDiscount: 1, commission: 15, percentCommission: 0 }] };
const receipt = { id: 2, type: "2", status: { id: 1 }, date: "2026-10-01", documentItems: [{ count: "2.000", price: "45.6789", product: { id: 1 } }] };

function transport() {
  return vi.fn(async (url: URL, _init: RequestInit) => {
    if (url.pathname === "/export/yml/export.yml") return new Response(xml);
    if (url.pathname === "/api/statuses/") return Response.json({ success: true, data: [{ id: 5, name: "Paid" }] });
    return Response.json({ status: "success", data: url.pathname === "/api/order/list/" ? [order] : [receipt],
      pagination: { currentPage: 1, pageCount: 1 }, meta: { fields: { sajt: { options: [{ id: 10, name: "Shop" }] } } } });
  });
}

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe.each(["salesdrive", "mock"])("shared %s connector contract", (provider) => {
  async function adapter(): Promise<MerchandisingConnector> {
    if (provider === "salesdrive") return new SalesDriveConnector(credentials, transport());
    const context = { observedAt: "2026-10-23T00:00:00.000Z", updatedAt: null };
    return new MockConnector({
      orders: [{ ...context, externalId: "1", statusId: "5", channelId: "10", orderedAt: "2026-10-01 12:00:00", paidAt: "2026-10-02", lines: [{ externalLineId: null, productId: "1", sku: "SKU1", quantity: "2", unitPrice: "100", discount: "10", discountUnit: "percentage", commission: "15", commissionUnit: "amount", costPrice: null }] }],
      products: [{ ...context, externalId: "p1", sku: "SKU1", name: "Dress", barcode: null, brand: null, categoryId: null, retailPrice: "123.4567", costPrice: null, currency: "UAH" }],
      stock: [{ ...context, externalId: "p1", productId: "p1", onHand: "2", inTransit: null }],
      receipts: [{ ...context, externalId: "2", movementType: "transfer", statusId: "1", supplierId: null, receivedAt: "2026-10-01", postingVerified: false, lines: [{ externalLineId: null, productId: "1", quantity: "2.000", unitCost: "45.6789" }] }],
    });
  }
  it("supplies the same formula-independent source DTOs and explicit unknown values", async () => {
    const connector = await adapter();
    expect(connector.capabilities.writes).toBe(false);
    const orders = await connector.getOrders({ limit: 1 });
    expect(orders.records[0]).toMatchObject({ externalId: "1", paidAt: "2026-10-02", channelId: "10", lines: [{ externalLineId: null,
      quantity: "2", unitPrice: "100", discount: "10", discountUnit: "percentage", commission: "15", commissionUnit: "amount", costPrice: null }] });
    expect(orders.nextPage).toBeNull();
    expect((await connector.getProducts()).records[0]).toMatchObject({ externalId: "p1", retailPrice: "123.4567", costPrice: null, currency: "UAH" });
    expect((await connector.getStock()).records[0]).toMatchObject({ productId: "p1", onHand: "2", inTransit: null });
    expect((await connector.getReceipts()).records[0]).toMatchObject({ movementType: "transfer", postingVerified: false, supplierId: null, lines: [{ quantity: "2.000", unitCost: "45.6789" }] });
    expect((await connector.getStatuses()).entries).toEqual([{ id: "5", name: "Paid" }]);
    expect((await connector.getChannels()).entries).toEqual([{ id: "10", name: "Shop" }]);
    expect((await connector.checkConnection()).ok).toBe(true);
  });
  it("accepts an observed UTC instant as an incremental watermark", async () => {
    const connector = await adapter();
    const observedAt = (await connector.getOrders()).observedAt;
    await expect(connector.getOrders({ updatedFrom: observedAt })).resolves.toMatchObject({ nextPage: null });
    await expect(connector.getReceipts({ updatedFrom: observedAt })).resolves.toMatchObject({ nextPage: null });
    await expect(connector.getOrders({ updatedFrom: "2026-10-01 00:00:00" })).rejects.toThrow();
  });
});

describe("SalesDrive read transport", () => {
  it("uses verified read paths and separate X-Api-Key scopes; feed tokens get no API header", async () => {
    const fetcher = transport();
    const connector = new SalesDriveConnector(credentials, fetcher);
    await connector.checkConnection();
    const requests = fetcher.mock.calls;
    expect(requests.map(([url]) => url.pathname)).toEqual(["/api/order/list/", "/api/statuses/", "/api/arrival-product/list/", "/export/yml/export.yml"]);
    expect(requests.map(([, init]) => new Headers(init.headers).get("X-Api-Key"))).toEqual(["orders-secret", "orders-secret", "receipts-secret", null]);
    for (const [, init] of requests) expect(init).toMatchObject({ method: "GET", redirect: "error", cache: "no-store" });
    expect(requests[0][0].searchParams.get("limit")).toBe("1");
  });
  it("uses distinct update filter names and honours pagination", async () => {
    const fetcher = vi.fn(async () => Response.json({ status: "success", data: [], pagination: { pageCount: 3 } }));
    const connector = new SalesDriveConnector(credentials, fetcher);
    expect((await connector.getOrders({ page: 2, limit: 50, updatedFrom: "2026-10-01T00:00:00.000Z" })).nextPage).toBe(3);
    await connector.getReceipts({ updatedFrom: "2026-10-01T00:00:00.000Z" });
    const calls = fetcher.mock.calls as unknown as Array<[URL, RequestInit]>;
    expect(calls[0][0].searchParams.get("filter[updateAt][from]")).toBe("2026-10-01 03:00:00");
    expect(calls[1][0].searchParams.get("filter[updatedAt][from]")).toBe("2026-10-01 03:00:00");
  });
  it.each([
    ["2026-01-01T22:00:00Z", "2026-01-02 00:00:00"],
    ["2026-07-01T22:00:00.999Z", "2026-07-02 01:00:00"],
    ["2026-03-29T00:59:59Z", "2026-03-29 02:59:59"],
    ["2026-03-29T01:00:00Z", "2026-03-29 04:00:00"],
  ])("converts UTC watermark %s using the source's Kyiv timezone and DST", async (updatedFrom, expected) => {
    const fetcher = transport();
    await new SalesDriveConnector(credentials, fetcher).getOrders({ updatedFrom });
    expect(fetcher.mock.calls[0][0].searchParams.get("filter[updateAt][from]")).toBe(expected);
  });
  it("supports an explicitly configured source timezone", async () => {
    const fetcher = transport();
    await new SalesDriveConnector(credentials, fetcher, "UTC").getOrders({ updatedFrom: "2026-07-01T22:00:00Z" });
    expect(fetcher.mock.calls[0][0].searchParams.get("filter[updateAt][from]")).toBe("2026-07-01 22:00:00");
  });
  it.each(["", "2026-02-30T00:00:00Z", "2026-10-01T00:00:00+02:00", "not-a-date"])("rejects an invalid watermark before making a request", async (updatedFrom) => {
    const fetcher = transport();
    await expect(new SalesDriveConnector(credentials, fetcher).getOrders({ updatedFrom })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([[401, "AUTH_FAILED"], [403, "AUTH_FAILED"], [429, "RATE_LIMITED"], [500, "NETWORK_ERROR"]] as const)("sanitizes HTTP %i failures", async (status, code) => {
    const connector = new SalesDriveConnector(credentials, async () => new Response("orders-secret feed-secret", { status }));
    const result = await connector.checkConnection();
    expect(result.ok).toBe(false);
    expect(result.checks.every((check) => check.code === code)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/orders-secret|feed-secret/);
  });
  it("keeps missing scopes explicit and never claims a complete channel dictionary", async () => {
    const connector = new SalesDriveConnector({ ...credentials, receiptsApiKey: null, ymlUrl: null }, transport());
    const result = await connector.checkConnection();
    expect(result.ok).toBe(false);
    expect(result.checks.filter((check) => check.code === "NOT_CONFIGURED").map((check) => check.resource)).toEqual(["receipts", "catalog"]);
    expect(result.channels.complete).toBe(false);
    expect(result.channels.reason).toBe("CUSTOMER_METADATA_UNVERIFIED");
  });
  it("does not infer channel names from sampled order codes", async () => {
    const connector = new SalesDriveConnector(credentials, async () => Response.json({ data: [order], pagination: { pageCount: 1 } }));
    expect(await connector.getChannels()).toEqual({ entries: [], complete: false, reason: "CHANNEL_DICTIONARY_UNAVAILABLE" });
  });
  it.each(["<!DOCTYPE x><yml_catalog/>", "<html>orders-secret</html>", "not XML"])("rejects unsafe or invalid feed contents", async (body) => {
    const connector = new SalesDriveConnector(credentials, async () => new Response(body));
    await expect(connector.getProducts()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("shares a feed observation between products and stock without inventing history", async () => {
    const fetcher = transport();
    const connector = new SalesDriveConnector(credentials, fetcher);
    const [products, stock] = await Promise.all([connector.getProducts(), connector.getStock()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(products.observedAt).toBe(stock.observedAt);
    expect(stock.records[0].updatedAt).toBeNull();
  });
  it("shares a failed load between concurrent callers, then retries and caches a successful observation", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new DOMException("timeout", "TimeoutError")).mockResolvedValueOnce(new Response(xml));
    const connector = new SalesDriveConnector(credentials, fetcher);
    const failed = await Promise.allSettled([connector.getProducts(), connector.getStock()]);
    expect(failed).toEqual([{ status: "rejected", reason: expect.objectContaining({ code: "TIMEOUT" }) }, { status: "rejected", reason: expect.objectContaining({ code: "TIMEOUT" }) }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await connector.getStock()).records[0].productId).toBe("p1");
    await connector.getProducts();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("preserves page-to-quantity alignment when projecting a later stock page", async () => {
    const catalog = '<yml_catalog><shop><offers>' + [1, 2, 3].map((n) => `<offer id="p${n}"><quantity_in_stock>${n * 10}</quantity_in_stock></offer>`).join("") + '</offers></shop></yml_catalog>';
    const connector = new SalesDriveConnector(credentials, async () => new Response(catalog));
    const first = await connector.getStock({ page: 1, limit: 2 });
    const second = await connector.getStock({ page: 2, limit: 2 });
    expect(first.nextPage).toBe(2);
    expect(second).toMatchObject({ nextPage: null, observedAt: first.observedAt, records: [{ productId: "p3", onHand: "30" }] });
    await expect(connector.getStock({ page: 0 })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("rejects oversized API bodies before parsing", async () => {
    const connector = new SalesDriveConnector(credentials, async () => new Response(" ".repeat(4 * 1024 * 1024 + 1)));
    await expect(connector.getOrders()).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });
  it("accepts an explicitly empty feed without fabricating stock records", async () => {
    const connector = new SalesDriveConnector(credentials, async () => new Response("<yml_catalog><shop><offers/></shop></yml_catalog>"));
    expect((await connector.getProducts()).records).toEqual([]);
    expect((await connector.getStock()).records).toEqual([]);
  });
  it("sanitizes thrown fetch errors and timeouts", async () => {
    const network = new SalesDriveConnector(credentials, async () => { throw new Error(credentials.ymlUrl); });
    await expect(network.getOrders()).rejects.toMatchObject({ message: "NETWORK_ERROR" });
    const timeout = new SalesDriveConnector(credentials, async () => { throw new DOMException("orders-secret", "TimeoutError"); });
    await expect(timeout.getOrders()).rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("redacts credentials even if a remote dictionary echoes them", async () => {
    const connector = new SalesDriveConnector(credentials, async () => Response.json({ data: [{ id: 5, name: "orders-secret feed-secret receipts-secret" }] }));
    expect(JSON.stringify(await connector.getStatuses())).not.toMatch(/orders-secret|feed-secret|receipts-secret/);
  });
  it("rejects malformed JSON, corrupt rows and missing pagination rather than treating them as empty", async () => {
    for (const body of ["not JSON", JSON.stringify({ data: [null], pagination: { pageCount: 1 } }), JSON.stringify({ data: [] })]) {
      await expect(new SalesDriveConnector(credentials, async () => new Response(body)).getOrders()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });
});

describe("credential validation and encryption", () => {
  it.each(["ключ", "key-€", "key-😀"])("rejects non-ByteString API keys before they reach fetch", (key) => {
    expect(parseSalesDriveCredentials({ ...credentials, ordersApiKey: key }).credentials).toBeNull();
    expect(parseSalesDriveCredentials({ ...credentials, receiptsApiKey: key }).credentials).toBeNull();
    expect(() => new Headers({ "X-Api-Key": key })).toThrow();
  });
  it.each(["key-\u0080", "key-é", "key-ÿ"])("preserves header-compatible Latin-1 keys", (key) => {
    const parsed = parseSalesDriveCredentials({ ...credentials, ordersApiKey: key, receiptsApiKey: key });
    expect(parsed.credentials).toMatchObject({ ordersApiKey: key, receiptsApiKey: key });
    expect(new Headers({ "X-Api-Key": key }).get("X-Api-Key")).toBe(key);
  });
  it.each(["localhost", "127.0.0.1", "demo.salesdrive.me.attacker.test", "https://demo.salesdrive.me", "demo.salesdrive.me:443"])("rejects unsafe account target %s", (accountHost) => {
    expect(parseSalesDriveCredentials({ ...credentials, accountHost }).credentials).toBeNull();
  });
  it.each(["http://demo.salesdrive.me/export/yml/export.yml?publicKey=secret", "https://other.salesdrive.me/export/yml/export.yml?publicKey=secret", "https://demo.salesdrive.me/api/order/list/", "https://user:secret@demo.salesdrive.me/export/yml/export.yml?publicKey=secret"])("rejects unsafe feed target", (ymlUrl) => {
    expect(parseSalesDriveCredentials({ ...credentials, ymlUrl }).credentials).toBeNull();
  });
  it("encrypts with random nonces and rejects ciphertext tampering or tenant substitution", () => {
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const encrypted = encryptCredentials(credentials, "a");
    expect(encrypted).not.toContain("orders-secret");
    expect(encrypted).not.toBe(encryptCredentials(credentials, "a"));
    expect(decryptCredentials(encrypted, "a")).toEqual(credentials);
    expect(() => decryptCredentials(encrypted, "b")).toThrow("CONNECTOR_STORAGE_UNAVAILABLE");
    expect(() => decryptCredentials(encrypted.slice(0, -6), "a")).toThrow("CONNECTOR_STORAGE_UNAVAILABLE");
  });
  it("fails closed without a valid encryption key", () => {
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", "not-a-key");
    expect(() => encryptCredentials(credentials, "a")).toThrow("CONNECTOR_STORAGE_UNAVAILABLE");
  });
  it.each([4, 8, 12, 13, 14, 15])("rejects a valid tag truncated to %i bytes", (length) => {
    vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const parts = encryptCredentials(credentials, "a").split(".");
    parts[2] = Buffer.from(parts[2], "base64").subarray(0, length).toString("base64");
    expect(() => decryptCredentials(parts.join("."), "a")).toThrow("CONNECTOR_STORAGE_UNAVAILABLE");
  });
});
