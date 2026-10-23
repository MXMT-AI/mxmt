import "server-only";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { isRecord } from "@/lib/api-contracts";
import { fetchWithTimeout } from "@/lib/server-fetch";
import { parseSalesDriveCredentials, type SalesDriveCredentials } from "./config";
import { utcWatermark } from "./requests";
import type { CheckCode, ConnectionCheck, ConnectorCapabilities, ConnectorPage, Dictionary, MerchandisingConnector, OrderDto, PageRequest, ProductDto, ReceiptDto, StockDto } from "./contract";

export class ConnectorReadError extends Error {
  constructor(readonly code: Exclude<CheckCode, "OK">) { super(code); this.name = "ConnectorReadError"; }
}
type Fetcher = (url: URL, init: RequestInit) => Promise<Response>;
const emptyDictionary = (reason: string): Dictionary => ({ entries: [], complete: false, reason });
const text = (value: unknown): string | null => typeof value === "string" && value !== "" ? value : null;
const id = (value: unknown): string | null => text(value) ?? (typeof value === "number" && Number.isSafeInteger(value) ? String(value) : null);
const decimal = (value: unknown): string | null => {
  const result = typeof value === "number" && Number.isFinite(value) ? String(value) : text(value);
  return result && /^-?\d+(\.\d+)?$/.test(result) ? result : null;
};
const object = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const array = (value: unknown): Record<string, unknown>[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((row) => !isRecord(row))) throw new ConnectorReadError("INVALID_RESPONSE");
  return value;
};
const unit = (value: unknown): "percentage" | "amount" | "unknown" => value === 1 || value === "1" ? "percentage" : value === 0 || value === "0" ? "amount" : "unknown";

/** Bound response memory before parsing; discard remote errors rather than echoing them. */
async function responseText(response: Response, maxBytes: number): Promise<string> {
  if (response.status === 401 || response.status === 403) throw new ConnectorReadError("AUTH_FAILED");
  if (response.status === 429) throw new ConnectorReadError("RATE_LIMITED");
  if (!response.ok || !response.body) throw new ConnectorReadError("NETWORK_ERROR");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new ConnectorReadError("RESPONSE_TOO_LARGE"); }
      parts.push(value);
    }
    return Buffer.concat(parts).toString("utf8");
  } finally { reader.releaseLock(); }
}

/** Read-only transport and source DTO projection; no sale, cost or ownership policy. */
export class SalesDriveConnector implements MerchandisingConnector {
  readonly provider = "salesdrive" as const;
  readonly capabilities: ConnectorCapabilities;
  private readonly credentials: SalesDriveCredentials;
  private catalog: Promise<{ records: ProductDto[]; quantities: Array<string | null>; observedAt: string }> | null = null;

  constructor(credentials: SalesDriveCredentials, private readonly fetcher: Fetcher = fetchWithTimeout, private readonly sourceTimezone = "Europe/Kyiv") {
    const parsed = parseSalesDriveCredentials(credentials);
    if (!parsed.credentials) throw new ConnectorReadError("NOT_CONFIGURED");
    this.credentials = parsed.credentials;
    this.capabilities = {
      orders: true, products: Boolean(credentials.ymlUrl), stock: Boolean(credentials.ymlUrl),
      receipts: Boolean(credentials.receiptsApiKey), statuses: true, channels: "metadata",
      incrementalOrders: true, incrementalReceipts: Boolean(credentials.receiptsApiKey), historicalStock: false, writes: false,
    };
  }

  private async request(url: URL, key: string | null, xml = false): Promise<string> {
    try {
      const response = await this.fetcher(url, {
        method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8_000),
        headers: { Accept: xml ? "application/xml,text/xml" : "application/json", ...(key ? { "X-Api-Key": key } : {}) },
      });
      return await responseText(response, xml ? 16 * 1024 * 1024 : 4 * 1024 * 1024);
    } catch (error) {
      if (error instanceof ConnectorReadError) throw error;
      throw new ConnectorReadError(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "TIMEOUT" : "NETWORK_ERROR");
    }
  }

  private async api(path: "/api/order/list/" | "/api/statuses/" | "/api/arrival-product/list/", request: PageRequest = {}) {
    const page = request.page ?? 1;
    const limit = request.limit ?? 100;
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ConnectorReadError("INVALID_RESPONSE");
    const key = path === "/api/arrival-product/list/" ? this.credentials.receiptsApiKey : this.credentials.ordersApiKey;
    if (!key) throw new ConnectorReadError("NOT_CONFIGURED");
    const url = new URL(path, `https://${this.credentials.accountHost}`);
    if (path !== "/api/statuses/") {
      url.searchParams.set("page", String(page)); url.searchParams.set("limit", String(limit));
      if (request.updatedFrom !== undefined) {
        const instant = utcWatermark(request.updatedFrom);
        if (!instant) throw new ConnectorReadError("INVALID_RESPONSE");
        let localTime: string;
        try {
          const parts = new Intl.DateTimeFormat("en-CA", { timeZone: this.sourceTimezone, year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(instant);
          const part = (name: string) => parts.find((value) => value.type === name)!.value;
          localTime = `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
        } catch { throw new ConnectorReadError("INVALID_RESPONSE"); }
        url.searchParams.set(path === "/api/order/list/" ? "filter[updateAt][from]" : "filter[updatedAt][from]", localTime);
      }
    }
    try {
      const result: unknown = JSON.parse(await this.request(url, key));
      if (!isRecord(result) || !Array.isArray(result.data) || result.success === false || result.status === "error") throw new ConnectorReadError("INVALID_RESPONSE");
      return result;
    } catch (error) {
      if (error instanceof ConnectorReadError) throw error;
      throw new ConnectorReadError("INVALID_RESPONSE");
    }
  }

  private page<T>(data: Record<string, unknown>, records: T[], observedAt: string, request: PageRequest): ConnectorPage<T> {
    const currentPage = request.page ?? 1;
    const pagination = object(data.pagination);
    if (typeof pagination.pageCount !== "number" || !Number.isSafeInteger(pagination.pageCount) || pagination.pageCount < 0) throw new ConnectorReadError("INVALID_RESPONSE");
    return { records, observedAt, nextPage: currentPage < pagination.pageCount ? currentPage + 1 : null };
  }

  /** Project source lines without inventing line IDs or interpreting discount/commission flags as rates. */
  async getOrders(request: PageRequest = {}): Promise<ConnectorPage<OrderDto>> {
    const result = await this.api("/api/order/list/", request);
    const observedAt = new Date().toISOString();
    const records = array(result.data).map((row): OrderDto => {
      const externalId = id(row.id);
      if (!externalId) throw new ConnectorReadError("INVALID_RESPONSE");
      return { externalId, observedAt, updatedAt: text(row.updateAt), statusId: id(row.statusId), channelId: id(row.sajt),
        orderedAt: text(row.orderTime), paidAt: text(row.paymentDate), lines: array(row.products).map((line) => ({
          externalLineId: id(line.id), productId: id(line.productId) ?? id(line.parameter), sku: text(line.sku),
          quantity: decimal(line.amount), unitPrice: decimal(line.price), discount: decimal(line.discount), discountUnit: unit(line.percentDiscount),
          commission: decimal(line.commission), commissionUnit: unit(line.percentCommission), costPrice: decimal(line.costPrice),
        })) };
    });
    return this.page(result, records, observedAt, request);
  }

  /** All movement types remain distinct; posting and supplier mappings stay unverified. */
  async getReceipts(request: PageRequest = {}): Promise<ConnectorPage<ReceiptDto>> {
    const result = await this.api("/api/arrival-product/list/", request);
    const observedAt = new Date().toISOString();
    const types = { "1": "supplier_receipt", "2": "transfer", "3": "write_off", "4": "inventory_adjustment" } as const;
    const records = array(result.data).map((row): ReceiptDto => {
      const externalId = id(row.id);
      if (!externalId) throw new ConnectorReadError("INVALID_RESPONSE");
      return { externalId, observedAt, updatedAt: text(row.updatedAt), receivedAt: text(row.date),
        movementType: types[String(row.type) as keyof typeof types] ?? "unknown", statusId: id(object(row.status).id),
        supplierId: null, postingVerified: false, lines: array(row.documentItems).map((line) => ({
          externalLineId: id(line.id), productId: id(object(line.product).id), quantity: decimal(line.count), unitCost: decimal(line.price),
        })) };
    });
    return this.page(result, records, observedAt, request);
  }

  private loadCatalog() {
    if (!this.credentials.ymlUrl) throw new ConnectorReadError("NOT_CONFIGURED");
    const url = new URL(this.credentials.ymlUrl);
    this.catalog ??= (async () => {
      const xml = await this.request(url, null, true);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new ConnectorReadError("INVALID_RESPONSE");
      const root = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, processEntities: false,
        isArray: (name) => name === "offer" }).parse(xml);
      const shop = object(object(object(root).yml_catalog).shop);
      if (shop.offers !== "" && !isRecord(shop.offers)) throw new ConnectorReadError("INVALID_RESPONSE");
      const offers = array(object(shop.offers).offer ?? []);
      const observedAt = new Date().toISOString();
      const records = offers.map((offer): ProductDto => {
        const externalId = id(offer["@_id"]);
        if (!externalId) throw new ConnectorReadError("INVALID_RESPONSE");
        return { externalId, observedAt, updatedAt: null, sku: text(offer.vendorCode) ?? text(offer.article), name: text(offer.name_ua) ?? text(offer.name) ?? externalId,
          barcode: text(offer.barcode), brand: text(offer.vendor), categoryId: id(offer.categoryId),
          retailPrice: decimal(offer.price), costPrice: decimal(offer.vendorprice), currency: text(offer.currencyId) };
      });
      return { records, quantities: offers.map((offer) => decimal(offer.quantity_in_stock)), observedAt };
    })().catch((error) => {
      this.catalog = null;
      if (error instanceof ConnectorReadError) throw error;
      throw new ConnectorReadError("INVALID_RESPONSE");
    });
    return this.catalog;
  }

  private catalogPage<T>(records: T[], observedAt: string, request: PageRequest): ConnectorPage<T> {
    const page = request.page ?? 1, limit = request.limit ?? 100;
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ConnectorReadError("INVALID_RESPONSE");
    return { records: records.slice((page - 1) * limit, page * limit), observedAt, nextPage: page * limit < records.length ? page + 1 : null };
  }

  /** Read catalog values as exact strings; missing cost is null, never zero. */
  async getProducts(request: PageRequest = {}): Promise<ConnectorPage<ProductDto>> {
    const catalog = await this.loadCatalog();
    return this.catalogPage(catalog.records, catalog.observedAt, request);
  }

  /** A current feed observation cannot supply historical or in-transit stock. */
  async getStock(request: PageRequest = {}): Promise<ConnectorPage<StockDto>> {
    const catalog = await this.loadCatalog();
    const page = this.catalogPage(catalog.records, catalog.observedAt, request);
    const offset = ((request.page ?? 1) - 1) * (request.limit ?? 100);
    return { ...page, records: page.records.map((product, index) => ({ externalId: product.externalId, productId: product.externalId,
      observedAt: catalog.observedAt, updatedAt: null, onHand: catalog.quantities[offset + index], inTransit: null })) };
  }

  private safeName(value: string): string {
    const tokens = [this.credentials.ordersApiKey, this.credentials.receiptsApiKey, this.credentials.ymlUrl,
      this.credentials.ymlUrl ? new URL(this.credentials.ymlUrl).searchParams.get("publicKey") : null];
    return tokens.reduce<string>((result, token) => token ? result.split(token).join("[redacted]") : result, value).slice(0, 200);
  }

  /** Status names are fetched read-only; status IDs carry no built-in business meaning. */
  async getStatuses(): Promise<Dictionary> {
    const result = await this.api("/api/statuses/");
    const rows = array(result.data);
    if (rows.some((row) => !/^\d+$/.test(id(row.id) ?? "") || !text(row.name))) throw new ConnectorReadError("INVALID_RESPONSE");
    return { entries: rows.slice(0, 1000).map((row) => ({ id: id(row.id)!, name: this.safeName(text(row.name)!) })), complete: rows.length <= 1000, reason: rows.length > 1000 ? "DICTIONARY_TRUNCATED" : null };
  }

  private channelsFrom(result: Record<string, unknown>): Dictionary {
    const options = object(object(object(result.meta).fields).sajt).options;
    // The public schema leaves meta.fields opaque. Expose only recognizable options,
    // and keep customer verification explicit even when those options are present.
    const entries = (Array.isArray(options) ? array(options) : []).filter((row) => /^\d+$/.test(id(row.id) ?? "") && text(row.name)).slice(0, 1000)
      .map((row) => ({ id: id(row.id)!, name: this.safeName(text(row.name)!) }));
    return { entries, complete: false, reason: entries.length ? "CUSTOMER_METADATA_UNVERIFIED" : "CHANNEL_DICTIONARY_UNAVAILABLE" };
  }

  /** No undocumented channel endpoint or guessed ID-to-name mapping is used. */
  async getChannels(): Promise<Dictionary> { return this.channelsFrom(await this.api("/api/order/list/", { limit: 1 })); }

  /** Probe each configured read scope independently; never include remote error bodies. */
  async checkConnection(): Promise<ConnectionCheck> {
    const result: ConnectionCheck = { checkedAt: new Date().toISOString(), ok: false, checks: [],
      statuses: emptyDictionary("NOT_CHECKED"), channels: emptyDictionary("NOT_CHECKED") };
    const probes = [
      ["orders", async () => { const data = await this.api("/api/order/list/", { limit: 1 }); this.page(data, [], result.checkedAt, { limit: 1 }); result.channels = this.channelsFrom(data); }],
      ["statuses", async () => { result.statuses = await this.getStatuses(); }],
      ["receipts", async () => { await this.getReceipts({ limit: 1 }); }],
      ["catalog", async () => { await this.getProducts({ limit: 1 }); }],
    ] as const;
    for (const [resource, probe] of probes) {
      try { await probe(); result.checks.push({ resource, code: "OK" }); }
      catch (error) { result.checks.push({ resource, code: error instanceof ConnectorReadError ? error.code : "INVALID_RESPONSE" }); }
    }
    result.ok = result.checks.every((check) => check.code === "OK");
    return result;
  }
}
