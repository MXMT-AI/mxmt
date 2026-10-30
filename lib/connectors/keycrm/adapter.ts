import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { isRecord } from "@/lib/api-contracts";
import { parseSourceJson } from "../json";
import { ConnectorReadError } from "../read-error";
import { payloadHash } from "../order-storage";
import { retryAfter } from "../budget";
import { sourceDate, exact } from "../order-normalization";
import { utcWatermark } from "../requests";
import { parseKeyCrmConfig, type KeyCrmConfig } from "./config";
import type {
  MerchandisingConnector,
  ConnectorCapabilities,
  ConnectorPage,
  ConnectionCheck,
  Dictionary,
  PageRequest,
  ProductDto,
  StockDto,
  OrderDto,
  ReceiptDto,
  CheckCode,
} from "../contract";
type Row = Record<string, unknown>;
type Fetcher = (url: URL, init: RequestInit) => Promise<Response>;
const object = (v: unknown): Row => {
  if (!isRecord(v)) throw new ConnectorReadError("INVALID_RESPONSE");
  return v;
};
const id = (v: unknown) => {
  const s =
    typeof v === "string"
      ? v
      : typeof v === "number" && Number.isSafeInteger(v)
        ? String(v)
        : null;
  if (!s || s.length > 200 || s.trim() !== s || /[\x00-\x1f\x7f]/.test(s))
    throw new ConnectorReadError("INVALID_RESPONSE");
  return s;
};
const label = (v: unknown, max = 1000) => {
  if (typeof v !== "string" || !v.trim() || v.length > max || v.includes("\0"))
    throw new ConnectorReadError("INVALID_RESPONSE");
  return v;
};
const optional = (v: unknown) =>
  v === null || v === undefined || v === "" ? null : id(v);
const rows = (v: unknown): Row[] => {
  if (!Array.isArray(v) || v.length > 1000)
    throw new ConnectorReadError("INVALID_RESPONSE");
  return v.map(object);
};
const decimal = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const s =
    typeof v === "string"
      ? v
      : typeof v === "number" && Number.isSafeInteger(v)
        ? String(v)
        : null;
  if (s === null || !exact(s)) throw new ConnectorReadError("INVALID_RESPONSE");
  return s;
};
const timestamp = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z?$/.test(v)
  )
    throw new ConnectorReadError("INVALID_RESPONSE");
  const parsed = sourceDate(
    v.replace(" ", "T").replace(/Z?$/, "Z"),
    "UTC",
  ).date;
  if (!parsed) throw new ConnectorReadError("INVALID_RESPONSE");
  return parsed.toISOString();
};
const empty = (reason: string): Dictionary => ({
  entries: [],
  complete: false,
  reason,
});
export class KeyCrmConnector implements MerchandisingConnector {
  readonly provider = "keycrm" as const;
  readonly capabilities: ConnectorCapabilities;
  private readonly config: KeyCrmConfig;
  constructor(
    config: KeyCrmConfig,
    private readonly fetcher: Fetcher,
  ) {
    const parsed = parseKeyCrmConfig(config);
    if (!parsed.credentials) throw new ConnectorReadError("NOT_CONFIGURED");
    this.config = parsed.credentials;
    this.capabilities = {
      orders: true,
      products: config.evidence?.physicalStock === true,
      stock: config.evidence?.physicalStock === true,
      receipts: false,
      statuses: true,
      channels: "metadata",
      incrementalOrders: true,
      incrementalReceipts: false,
      historicalStock: false,
      writes: false,
      automaticSync: false,
      pagination: { orders: "page", catalog: "page" },
      pageSize: { orders: 50, catalog: 50 },
    };
  }
  private async read(
    path: string,
    query: Record<string, string> = {},
  ): Promise<{ body: Row; raw: string; observedAt: string }> {
    const url = new URL("https://openapi.keycrm.app/v1" + path);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "GET",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: "application/json",
        },
      });
    } catch (e) {
      if (e instanceof ConnectorReadError) throw e;
      throw new ConnectorReadError(
        e instanceof Error && ["AbortError", "TimeoutError"].includes(e.name)
          ? "TIMEOUT"
          : "NETWORK_ERROR",
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new ConnectorReadError(
        response.status === 401 || response.status === 403
          ? "AUTH_FAILED"
          : response.status === 429
            ? "RATE_LIMITED"
            : "NETWORK_ERROR",
        response.status === 429
          ? retryAfter(response.headers.get("Retry-After"))
          : undefined,
      );
    }
    if (!response.body) throw new ConnectorReadError("INVALID_RESPONSE");
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4 * 1024 * 1024) {
          await reader.cancel();
          throw new ConnectorReadError("RESPONSE_TOO_LARGE");
        }
        chunks.push(value);
      }
    } catch (e) {
      if (e instanceof ConnectorReadError) throw e;
      throw new ConnectorReadError("NETWORK_ERROR");
    } finally {
      reader.releaseLock();
    }
    let raw: string;
    try {
      raw = new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks),
      );
    } catch {
      throw new ConnectorReadError("INVALID_RESPONSE");
    }
    try {
      const body = object(parseSourceJson(raw));
      if (body.error || body.errors || (body.message && !body.data))
        throw new Error();
      return { body, raw, observedAt: new Date().toISOString() };
    } catch {
      throw new ConnectorReadError("INVALID_RESPONSE");
    }
  }
  private async page(
    path: string,
    request: PageRequest = {},
    query: Record<string, string> = {},
  ) {
    const page = request.page ?? 1,
      limit = request.limit ?? 50;
    if (
      request.cursor !== undefined ||
      request.offset !== undefined ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 10000 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw new ConnectorReadError("INVALID_RESPONSE");
    const result = await this.read(path, {
        ...query,
        page: String(page),
        limit: String(limit),
      }),
      body = result.body,
      records = rows(body.data);
    const number = (v: unknown) =>
      typeof v === "number" && Number.isSafeInteger(v)
        ? v
        : typeof v === "string" && /^\d{1,9}$/.test(v)
          ? Number(v)
          : NaN;
    const total = number(body.total),
      current = number(body.current_page),
      per = number(body.per_page);
    if (
      current !== page ||
      per !== limit ||
      !Number.isSafeInteger(total) ||
      total < 0 ||
      total > 500000 ||
      records.length > limit ||
      records.length !==
        Math.min(limit, Math.max(0, total - (page - 1) * limit))
    )
      throw new ConnectorReadError("INVALID_RESPONSE");
    const ids = records.map((r) => id(r.id));
    if (new Set(ids).size !== ids.length)
      throw new ConnectorReadError("INVALID_RESPONSE");
    return {
      ...result,
      records,
      nextPage: page * limit < total ? page + 1 : null,
    };
  }
  async getOrders(request: PageRequest = {}): Promise<ConnectorPage<OrderDto>> {
    const query: Record<string, string> = {
      include: "products.offer,status,payments",
      sort: "id",
    };
    const range = (from: unknown, to: unknown, key: string) => {
      if (from === undefined && to === undefined) return;
      if (
        typeof from !== "string" ||
        !utcWatermark(from) ||
        typeof to !== "string" ||
        !utcWatermark(to) ||
        Date.parse(String(from)) > Date.parse(String(to))
      )
        throw new ConnectorReadError("INVALID_RESPONSE");
      const format = (s: string, upper = false) =>
        new Date((upper ? Math.ceil : Math.floor)(Date.parse(s) / 1000) * 1000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
      query[`filter[${key}]`] =
        `${format(String(from))},${format(String(to), true)}`;
    };
    range(request.orderedFrom, request.orderedTo, "created_between");
    range(request.updatedFrom, request.updatedTo, "updated_between");
    if (request.orderId) {
      if (!/^\d{1,20}$/.test(request.orderId))
        throw new ConnectorReadError("INVALID_RESPONSE");
      const r = await this.read(`/order/${request.orderId}`, {
        include: query.include,
      });
      return {
        records: [this.order(r.body, r.observedAt)],
        nextPage: null,
        observedAt: r.observedAt,
        rawResponse: r.raw,
      };
    }
    const r = await this.page("/order", request, query),
      records = r.records.map((o) => this.order(o, r.observedAt));
    const proof = this.config.evidence?.history;
    return {
      records,
      nextPage: r.nextPage,
      observedAt: r.observedAt,
      rawResponse: r.raw,
      ...(proof && request.orderedFrom && request.orderedTo
        ? {
            historyCoverage: { from: proof.from, to: proof.to, complete: true },
          }
        : {}),
    };
  }
  private order(row: Row, observedAt: string): OrderDto {
    const products = rows(row.products),
      seen = new Set<string>();
    const lines = products.map((p) => {
      const line = id(p.id);
      if (seen.has(line)) throw new ConnectorReadError("INVALID_RESPONSE");
      seen.add(line);
      const offer = p.offer == null ? null : object(p.offer);
      return {
        externalLineId: line,
        productId: offer ? optional(offer.id) : null,
        sku: optional(p.sku),
        quantity: decimal(p.quantity),
        unitPrice: this.config.evidence?.netUnitPrice
          ? decimal(p.price_sold)
          : null,
        discount: null,
        discountUnit: "unknown" as const,
        costPrice: this.config.evidence?.purchasedPriceUnit
          ? decimal(p.purchased_price)
          : null,
        commission: null,
        commissionUnit: "unknown" as const,
      };
    });
    let paidAt: string | null = null;
    if (
      this.config.evidence?.fullPaymentDate &&
      ["paid", "overpaid"].includes(String(row.payment_status))
    ) {
      const paid = rows(row.payments).filter((p) => p.status === "paid"),
        total = decimal(row.grand_total);
      let sum = new Prisma.Decimal(0),
        latest: string | null = null,
        verified =
          paid.length > 0 && total !== null && new Prisma.Decimal(total).gt(0);
      for (const p of paid) {
        const amount = decimal(p.amount),
          at = timestamp(p.payment_date);
        if (amount === null || !at || new Prisma.Decimal(amount).lte(0))
          verified = false;
        else {
          sum = sum.add(amount);
          if (!latest || at > latest) latest = at;
        }
      }
      if (verified && sum.gte(total!)) paidAt = latest;
    }
    return {
      externalId: id(row.id),
      statusId: optional(row.status_id),
      channelId: optional(row.source_id),
      orderedAt: timestamp(row.created_at),
      paidAt,
      returnedAt: null,
      updatedAt: timestamp(row.updated_at),
      observedAt,
      lines: lines.sort((a, b) =>
        a.externalLineId.localeCompare(b.externalLineId),
      ),
      raw: {
        ...row,
        products: [...products].sort((a, b) =>
          id(a.id).localeCompare(id(b.id)),
        ),
        ...(Array.isArray(row.payments)
          ? {
              payments: [...row.payments].sort((a, b) =>
                payloadHash(a).localeCompare(payloadHash(b)),
              ),
            }
          : {}),
      },
    };
  }
  private async dictionary(
    path: string,
    checkOnly = false,
  ): Promise<Dictionary> {
    const entries: Dictionary["entries"] = [],
      seen = new Set<string>();
    for (let page = 1; page <= (checkOnly ? 1 : 10); page++) {
      const result = await this.page(path, { page, limit: 50 });
      for (const r of result.records) {
        const key = id(r.id);
        if (seen.has(key)) throw new ConnectorReadError("INVALID_RESPONSE");
        seen.add(key);
        entries.push({ id: key, name: label(r.name, 500) });
      }
      if (result.nextPage === null)
        return { entries, complete: true, reason: null };
      if (checkOnly)
        return { entries, complete: false, reason: "CHECK_FIRST_PAGE_ONLY" };
    }
    throw new ConnectorReadError("RESPONSE_TOO_LARGE");
  }
  getStatuses() {
    return this.dictionary("/order/status");
  }
  getChannels() {
    return this.dictionary("/order/source");
  }
  async getProducts(
    request: PageRequest = {},
  ): Promise<ConnectorPage<ProductDto>> {
    const r = await this.page("/products", request);
    return {
      records: r.records.map((p) => this.product(p, p, r.observedAt)),
      nextPage: r.nextPage,
      observedAt: r.observedAt,
      rawResponse: r.raw,
    };
  }
  private product(p: Row, offer: Row, observedAt: string): ProductDto {
    if (
      this.config.evidence &&
      p.currency_code &&
      p.currency_code !== this.config.evidence.currency
    )
      throw new ConnectorReadError("INVALID_RESPONSE");
    return {
      externalId: id(offer.id),
      sku: optional(offer.sku),
      name: label(p.name),
      barcode: optional(offer.barcode),
      brand: null,
      categoryId: optional(p.category_id),
      retailPrice: decimal(offer.price),
      costPrice: null,
      currency: this.config.evidence?.currency ?? null,
      observedAt,
      updatedAt: timestamp(p.updated_at),
      raw: { product: p, offer },
    };
  }
  async getStock(request: PageRequest = {}): Promise<ConnectorPage<StockDto>> {
    const r = await this.page("/offers/stocks", request, {
      "filter[details]": "true",
    });
    const quantities = r.records.map((s) => this.quantity(s));
    if (
      this.config.evidence?.physicalStock &&
      quantities.some((q) => q === null)
    )
      throw new ConnectorReadError("INVALID_RESPONSE");
    return {
      records: r.records.map((s, i) => ({
        externalId: id(s.id),
        productId: id(s.id),
        onHand: quantities[i],
        inTransit: null,
        observedAt: r.observedAt,
        updatedAt: null,
      })),
      nextPage: r.nextPage,
      observedAt: r.observedAt,
      rawResponse: r.raw,
    };
  }
  private quantity(s: Row): string | null {
    if (!this.config.evidence?.physicalStock) return null;
    const ids = this.config.evidence.warehouseIds;
    if (!ids.length) return decimal(s.quantity);
    const warehouses = rows(s.warehouse),
      seen = new Set<string>();
    let sum = new Prisma.Decimal(0);
    for (const w of warehouses) {
      const key = id(w.id);
      if (seen.has(key)) throw new ConnectorReadError("INVALID_RESPONSE");
      seen.add(key);
      if (ids.includes(key)) {
        const q = decimal(w.quantity);
        if (q === null) return null;
        sum = sum.add(q);
      }
    }
    if (ids.some((i) => !seen.has(i))) return null;
    return exact(sum.toFixed()) ? sum.toFixed() : null;
  }
  async getCatalogPage(request: PageRequest = {}) {
    if (!this.config.evidence?.physicalStock)
      throw new ConnectorReadError("NOT_CONFIGURED");
    const offers = await this.page(
        "/offers",
        { ...request, limit: Math.min(request.limit ?? 50, 50) },
        { sort: "id" },
      ),
      observationId = request.observationId ?? randomUUID();
    if (!offers.records.length)
      return {
        records: [],
        nextPage: null,
        observedAt: offers.observedAt,
        observationId,
        completePopulation: true,
        rawResponse: offers.raw,
      };
    const productIds = [
        ...new Set(offers.records.map((o) => id(o.product_id))),
      ],
      offerIds = offers.records.map((o) => id(o.id));
    const products = await this.page(
        "/products",
        { page: 1, limit: 50 },
        { "filter[product_id]": productIds.join(",") },
      ),
      stocks = await this.page(
        "/offers/stocks",
        { page: 1, limit: 50 },
        { "filter[offers_id]": offerIds.join(","), "filter[details]": "true" },
      );
    if (
      products.nextPage ||
      stocks.nextPage ||
      products.records.length !== productIds.length ||
      stocks.records.length !== offerIds.length
    )
      throw new ConnectorReadError("INVALID_RESPONSE");
    const byProduct = new Map(products.records.map((p) => [id(p.id), p])),
      byStock = new Map(stocks.records.map((s) => [id(s.id), s]));
    const records = offers.records.map((o) => {
      const p = byProduct.get(id(o.product_id)),
        s = byStock.get(id(o.id));
      if (!p || !s) throw new ConnectorReadError("INVALID_RESPONSE");
      const onHand = this.quantity(s);
      if (onHand === null) throw new ConnectorReadError("INVALID_RESPONSE");
      return {
        product: this.product(p, o, products.observedAt),
        stock: {
          externalId: id(o.id),
          productId: id(o.id),
          onHand,
          inTransit: null,
          observedAt: stocks.observedAt,
          updatedAt: null,
        },
      };
    });
    return {
      records,
      nextPage: offers.nextPage,
      observedAt: stocks.observedAt,
      observationId,
      completePopulation: true,
      rawResponse: JSON.stringify({
        offers: offers.raw,
        products: products.raw,
        stocks: stocks.raw,
      }),
    };
  }
  async getReceipts(): Promise<ConnectorPage<ReceiptDto>> {
    throw new ConnectorReadError("NOT_CONFIGURED");
  }
  async checkConnection(): Promise<ConnectionCheck> {
    const checks: ConnectionCheck["checks"] = [];
    let statuses = empty("NOT_CHECKED"),
      channels = empty("NOT_CHECKED");
    const check = async (
      resource: ConnectionCheck["checks"][number]["resource"],
      read: () => Promise<unknown>,
    ) => {
      try {
        await read();
        checks.push({ resource, code: "OK" });
      } catch (e) {
        checks.push({
          resource,
          code:
            e instanceof ConnectorReadError
              ? e.code
              : ("NETWORK_ERROR" as CheckCode),
        });
      }
    };
    await check("orders", () => this.getOrders({ limit: 1 }));
    await check("statuses", async () => {
      statuses = await this.dictionary("/order/status", true);
    });
    await check("channels", async () => {
      channels = await this.dictionary("/order/source", true);
    });
    await check("products", () => this.getProducts({ limit: 1 }));
    await check("offers", () => this.page("/offers", { limit: 1 }));
    await check("stock", () => this.getStock({ limit: 1 }));
    checks.push({ resource: "receipts", code: "NOT_CONFIGURED" });
    return {
      ok: checks
        .filter((c) => c.resource !== "receipts")
        .every((c) => c.code === "OK"),
      checkedAt: new Date().toISOString(),
      checks,
      statuses,
      channels,
    };
  }
}
