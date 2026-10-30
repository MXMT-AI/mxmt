import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { isRecord } from "@/lib/api-contracts";
import { parseSourceJson } from "../json";
import { payloadHash } from "../order-storage";
import { ConnectorReadError } from "../read-error";
import { retryAfter } from "../budget";
import { utcWatermark } from "../requests";
import type {
  CatalogSnapshot,
  ConnectorCapabilities,
  ConnectorPage,
  ConnectionCheck,
  Dictionary,
  MerchandisingConnector,
  OrderDto,
  PageRequest,
  ProductDto,
  ReceiptDto,
  StockDto,
} from "../contract";
import {
  parseShopifyConfig,
  SHOPIFY_VERSION,
  type ShopifyConfig,
} from "./config";
import { QUERIES, type QueryName } from "./queries";
import type { ReadJournal } from "./journal";
import {
  connection,
  gid,
  instant,
  list,
  object,
  text,
  invalid,
  type Row,
} from "./values";
import { mapOrders, mapVariant, type FullOrder } from "./mapping";
class YieldRead extends Error {}
class ChangedRead extends Error {}
interface Position {
  a: string | null;
  n: number;
  e: number;
  g: number;
  b: string;
}
interface Saved {
  data: Row;
  observedAt: string;
}
const empty = (): Dictionary => ({
  entries: [],
  complete: false,
  reason: "UNSUPPORTED",
});
export class ShopifyConnector implements MerchandisingConnector {
  readonly provider = "shopify" as const;
  readonly capabilities: ConnectorCapabilities;
  private readonly config: ShopifyConfig;
  private readonly binding: string;
  constructor(
    config: ShopifyConfig,
    private readonly fetcher: (
      url: URL,
      init: RequestInit,
    ) => Promise<Response>,
    private readonly journal?: ReadJournal,
  ) {
    const parsed = parseShopifyConfig(config);
    if (!parsed.credentials) throw new ConnectorReadError("NOT_CONFIGURED");
    this.config = parsed.credentials;
    this.binding = payloadHash({
      version: SHOPIFY_VERSION,
      queries: QUERIES,
      config: {
        ...config,
        accessToken: createHash("sha256")
          .update(config.accessToken)
          .digest("hex"),
      },
      journal: journal?.binding ?? "check",
    });
    this.capabilities = {
      orders: true,
      products: true,
      stock: config.evidence.physicalStock,
      receipts: false,
      statuses: true,
      channels: "unavailable",
      incrementalOrders: true,
      incrementalReceipts: false,
      historicalStock: false,
      writes: false,
      automaticSync: false,
      pagination: { orders: "cursor", catalog: "cursor" },
      pageSize: { orders: 100, catalog: 1 },
    };
  }
  private audit = (row: Row): Row => {
    const redact = (v: unknown): unknown =>
      typeof v === "string"
        ? v.split(this.config.accessToken).join("[REDACTED]")
        : Array.isArray(v)
          ? v.map(redact)
          : isRecord(v)
            ? Object.fromEntries(
                Object.entries(v).map(([k, x]) => [
                  k.toLowerCase() === "accesstoken" ? "[REDACTED]" : k,
                  k.toLowerCase().includes("token") ? "[REDACTED]" : redact(x),
                ]),
              )
            : v;
    return object(redact(row));
  };
  private async query(name: QueryName, variables: Row = {}): Promise<Saved> {
    let response: Response;
    try {
      response = await this.fetcher(
        new URL(
          `https://${this.config.shop}/admin/api/${SHOPIFY_VERSION}/graphql.json`,
        ),
        {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
          headers: {
            "X-Shopify-Access-Token": this.config.accessToken,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ query: QUERIES[name], variables }),
        },
      );
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
        [401, 403].includes(response.status)
          ? "AUTH_FAILED"
          : response.status === 429
            ? "RATE_LIMITED"
            : "NETWORK_ERROR",
        response.status === 429
          ? retryAfter(response.headers.get("Retry-After"))
          : undefined,
      );
    }
    if (response.headers.get("X-Shopify-API-Version") !== SHOPIFY_VERSION) {
      await response.body?.cancel().catch(() => undefined);
      invalid();
    }
    const reader = response.body?.getReader();
    if (!reader) invalid();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader!.read();
        if (done) break;
        size += value.length;
        if (size > 4 * 1024 * 1024) {
          await reader!.cancel();
          throw new ConnectorReadError("RESPONSE_TOO_LARGE");
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof ConnectorReadError) throw error;
      throw new ConnectorReadError("NETWORK_ERROR");
    } finally {
      reader!.releaseLock();
    }
    let body: Row;
    try {
      body = object(
        parseSourceJson(
          new TextDecoder("utf-8", { fatal: true }).decode(
            Buffer.concat(chunks),
          ),
        ),
      );
    } catch {
      invalid();
    }
    if (
      Array.isArray(body!.errors) &&
      body!.errors.some(
        (e) =>
          isRecord(e) &&
          isRecord(e.extensions) &&
          e.extensions.code === "THROTTLED",
      )
    )
      throw new ConnectorReadError(
        "RATE_LIMITED",
        retryAfter(response.headers.get("Retry-After")),
      );
    if (
      JSON.stringify(body!).includes(
        JSON.stringify(this.config.accessToken).slice(1, -1),
      )
    )
      invalid();
    if (
      body!.errors !== undefined &&
      (!Array.isArray(body!.errors) || body!.errors.length)
    )
      invalid();
    return { data: object(body!.data), observedAt: new Date().toISOString() };
  }
  private async identity() {
    const r = await this.query("Identity"),
      shop = object(r.data.shop),
      app = object(r.data.currentAppInstallation);
    gid(shop.id, "Shop");
    if (
      shop.myshopifyDomain !== this.config.shop ||
      shop.ianaTimezone !== this.config.timezone ||
      shop.currencyCode !== this.config.evidence.currency ||
      gid(object(app.app).id, "App") !== this.config.appId
    )
      throw new ConnectorReadError("AUTH_FAILED");
    const scopes = new Set(list(app.accessScopes).map((v) => text(v.handle)));
    if (
      ["read_orders", "read_products", "read_inventory", "read_locations"].some(
        (s) => !scopes.has(s),
      )
    )
      throw new ConnectorReadError("AUTH_FAILED");
    return {
      scopes,
      observedAt: r.observedAt,
      metadata: {
        apiVersion: SHOPIFY_VERSION,
        shopId: gid(shop.id, "Shop"),
        appId: gid(object(app.app).id, "App"),
        timezone: this.config.timezone,
        scopes: [...scopes].sort(),
      },
    };
  }
  private filter(r: PageRequest) {
    const from = r.updatedFrom ?? r.orderedFrom,
      to = r.updatedTo ?? r.orderedTo,
      field = r.updatedFrom ? "updated_at" : "created_at";
    if (
      ((r.updatedFrom || r.updatedTo) && (r.orderedFrom || r.orderedTo)) ||
      (from !== undefined &&
        (!to ||
          !utcWatermark(from) ||
          !utcWatermark(to) ||
          Date.parse(from) > Date.parse(to))) ||
      (from === undefined && to !== undefined)
    )
      invalid();
    if (r.orderId) throw new ConnectorReadError("NOT_CONFIGURED");
    return {
      filter: from && to ? `${field}:>='${from}' ${field}:<='${to}'` : "",
      sort: field === "updated_at" ? "UPDATED_AT" : "CREATED_AT",
    };
  }
  private position(
    r: PageRequest,
    resource: string,
    filter: unknown,
  ): Position {
    if (
      r.offset !== undefined ||
      r.page !== undefined ||
      (r.limit !== undefined &&
        (!Number.isSafeInteger(r.limit) || r.limit < 1 || r.limit > 100))
    )
      invalid();
    const b = payloadHash({
      binding: this.binding,
      resource,
      filter,
      limit: r.limit ?? 100,
    });
    if (r.cursor == null) return { a: null, n: 0, e: 0, g: 0, b };
    try {
      if (r.cursor.length > 4096) invalid();
      const p = JSON.parse(Buffer.from(r.cursor, "base64url").toString("utf8"));
      if (
        !isRecord(p) ||
        p.b !== b ||
        (p.a !== null && (typeof p.a !== "string" || p.a.length > 1500)) ||
        ![p.n, p.e, p.g].every(
          (v) => Number.isSafeInteger(v) && Number(v) >= 0,
        ) ||
        Number(p.n) > 9999 ||
        Number(p.e) > 1001 ||
        Number(p.g) > 3
      )
        invalid();
      return p as unknown as Position;
    } catch {
      return invalid();
    }
  }
  private cursor(p: Position) {
    return {
      kind: "cursor" as const,
      cursor: Buffer.from(JSON.stringify(p)).toString("base64url"),
    };
  }
  private session(p: Position) {
    if (!this.journal) throw new ConnectorReadError("NOT_CONFIGURED");
    let remaining = 3;
    const pages: Saved[] = [];
    const read = async (name: QueryName, variables: Row = {}) => {
      const key = payloadHash({ b: p.b, a: p.a, g: p.g, name, variables }),
        cached = await this.journal!.get(key);
      let r: Saved;
      if (cached) {
        const c = object(cached);
        r = { data: object(c.data), observedAt: instant(c.observedAt) };
      } else {
        if (remaining-- <= 0) throw new YieldRead();
        r = await this.query(name, variables);
        await this.journal!.put(key, r);
      }
      pages.push(r);
      return r;
    };
    const all = async (
      name: QueryName,
      id: string,
      root: string,
      field: string,
      updatedAt?: string,
    ) => {
      const result: Row[] = [],
        seen = new Set<string>(),
        cursors = new Set<string>();
      let after: string | null = null;
      for (let page = 0; page < 1000; page++) {
        const r = await read(name, { id, after }),
          node = object(r.data[root]);
        if (gid(node.id) !== id) invalid();
        if (updatedAt && instant(node.updatedAt) !== updatedAt)
          throw new ChangedRead();
        const c = connection(node[field], after);
        for (const row of c.records) {
          const key = gid(row.id);
          if (seen.has(key)) invalid();
          seen.add(key);
          result.push(row);
        }
        if (!c.next) return { records: result, node };
        if (cursors.has(c.next)) invalid();
        cursors.add(c.next);
        after = c.next;
      }
      throw new ConnectorReadError("RESPONSE_TOO_LARGE");
    };
    return { read, all, pages };
  }
  async getOrders(r: PageRequest = {}): Promise<ConnectorPage<OrderDto>> {
    const filter = this.filter(r),
      p = this.position(r, "orders", filter),
      identity = await this.identity(),
      session = this.session(p);
    const proof = this.config.evidence.history;
    const coverage =
      proof && identity.scopes.has("read_all_orders")
        ? {
            historyCoverage: { from: proof.from, to: proof.to, complete: true },
          }
        : {};
    try {
      const root = await session.read("Orders", { after: p.a, ...filter }),
        page = connection(root.data.orders, p.a, 1),
        order = page.records[0];
      if (!order)
        return {
          ...coverage,
          records: [],
          nextPage: null,
          next: null,
          observedAt: root.observedAt,
        };
      const id = gid(order.id, "Order"),
        updatedAt = instant(order.updatedAt),
        lines = await session.all(
          "OrderLines",
          id,
          "order",
          "lineItems",
          updatedAt,
        ),
        refunds: FullOrder["refunds"] = [];
      for (const refund of list(order.refunds)) {
        const rid = gid(refund.id, "Refund"),
          version = instant(refund.updatedAt),
          items = await session.all(
            "RefundLines",
            rid,
            "refund",
            "refundLineItems",
            version,
          ),
          transactions = await session.all(
            "RefundTransactions",
            rid,
            "refund",
            "transactions",
            version,
          );
        refunds.push({
          refund: transactions.node,
          lines: items.records,
          transactions: transactions.records,
        });
      }
      const fence = object(
        (await session.read("OrderFence", { id })).data.order,
      );
      if (
        gid(fence.id, "Order") !== id ||
        instant(fence.updatedAt) !== updatedAt
      )
        throw new ChangedRead();
      const observedAt = session.pages.at(-1)!.observedAt;
      let records: OrderDto[];
      try {
        if (order.currencyCode !== this.config.evidence.currency) invalid();
        records = mapOrders(
          this.config,
          { order, lines: lines.records, refunds },
          observedAt,
          this.audit,
        );
      } catch (error) {
        if (
          !(error instanceof ConnectorReadError) ||
          error.code !== "INVALID_RESPONSE"
        )
          throw error;
        records = [
          {
            externalId: id,
            observedAt,
            updatedAt,
            statusId: null,
            channelId: null,
            orderedAt: null,
            paidAt: null,
            lines: [],
            raw: this.audit({ order, lines: lines.records, refunds }),
            rejectionCode:
              order.currencyCode !== this.config.evidence.currency
                ? "ORDER_CURRENCY_MISMATCH"
                : "ORDER_RECORD_INVALID",
          },
        ];
      }
      const limit = r.limit ?? 100,
        selected = records.slice(p.e, p.e + limit),
        next =
          p.e + limit < records.length
            ? this.cursor({ ...p, e: p.e + limit, n: p.n + 1 })
            : page.next
              ? this.cursor({ ...p, a: page.next, e: 0, n: 0, g: 0 })
              : null;
      return {
        records: selected,
        nextPage: null,
        next,
        observedAt,
        rawResponse: JSON.stringify(
          this.audit({ order, lines: lines.records, refunds }),
        ),
        ...coverage,
      };
    } catch (e) {
      if (e instanceof YieldRead || e instanceof ChangedRead) {
        if (e instanceof ChangedRead && p.g >= 3) invalid();
        return {
          ...coverage,
          records: [],
          nextPage: null,
          next: this.cursor({
            ...p,
            n: p.n + 1,
            g: p.g + (e instanceof ChangedRead ? 1 : 0),
            e: 0,
          }),
          observedAt: identity.observedAt,
        };
      }
      throw e;
    }
  }
  async getCatalogPage(r: PageRequest = {}) {
    const p = this.position(r, "catalog", null),
      identity = await this.identity(),
      session = this.session(p),
      observationId = payloadHash({
        binding: this.binding,
        resource: "catalog",
      });
    if (r.observationId && r.observationId !== observationId)
      throw new Error("CONNECTOR_CONFIG_CHANGED");
    try {
      const root = await session.read("Variants", { after: p.a }),
        page = connection(root.data.productVariants, p.a, 1),
        v = page.records[0];
      if (!v)
        return {
          records: [],
          nextPage: null,
          next: null,
          observedAt: root.observedAt,
          observationId,
          completePopulation: true,
        };
      const item = object(v.inventoryItem),
        levels = this.config.evidence.physicalStock
          ? await session.all(
              "Levels",
              gid(item.id, "InventoryItem"),
              "inventoryItem",
              "inventoryLevels",
            )
          : { records: [] },
        observedAt = session.pages.at(-1)!.observedAt;
      return {
        records: [
          mapVariant(this.config, v, levels.records, observedAt, this.audit),
        ],
        nextPage: null,
        next: page.next ? this.cursor({ ...p, a: page.next, n: 0 }) : null,
        observedAt,
        observationId,
        completePopulation: true,
        rawResponse: JSON.stringify(
          this.audit({ variant: v, levels: levels.records }),
        ),
      };
    } catch (e) {
      if (e instanceof YieldRead)
        return {
          records: [],
          nextPage: null,
          next: this.cursor({ ...p, n: p.n + 1 }),
          observedAt: identity.observedAt,
          observationId,
          completePopulation: true,
        };
      throw e;
    }
  }
  async getProducts(r: PageRequest = {}): Promise<ConnectorPage<ProductDto>> {
    const p = await this.getCatalogPage(r);
    return { ...p, records: p.records.map((r) => r.product) };
  }
  async getStock(r: PageRequest = {}): Promise<ConnectorPage<StockDto>> {
    const p = await this.getCatalogPage(r);
    return { ...p, records: p.records.map((r) => r.stock) };
  }
  async getReceipts(): Promise<ConnectorPage<ReceiptDto>> {
    throw new ConnectorReadError("NOT_CONFIGURED");
  }
  async getStatuses(): Promise<Dictionary> {
    return {
      entries: [
        { id: "1", name: "Verified full payment" },
        { id: "2", name: "Refund event" },
        { id: "3", name: "Unverified or partial payment" },
        { id: "4", name: "Unpaid cancellation" },
      ],
      complete: true,
      reason: null,
    };
  }
  async getChannels() {
    return empty();
  }
  async checkConnection(): Promise<ConnectionCheck> {
    const checks: ConnectionCheck["checks"] = [];
    const check = async (
      resource: ConnectionCheck["checks"][number]["resource"],
      fn: () => Promise<unknown>,
    ) => {
      try {
        await fn();
        checks.push({ resource, code: "OK" });
      } catch (e) {
        checks.push({
          resource,
          code: e instanceof ConnectorReadError ? e.code : "NETWORK_ERROR",
        });
      }
    };
    let verified: Awaited<ReturnType<ShopifyConnector["identity"]>> | null =
      null;
    let firstVariant: Row | undefined;
    await check("identity", async () => {
      verified = await this.identity();
    });
    await check("orders", async () => {
      const result = await this.query("Orders", {
        after: null,
        filter: "",
        sort: "CREATED_AT",
      });
      connection(result.data.orders, null, 1);
    });
    await check("products", async () => {
      firstVariant = connection(
        (await this.query("Variants", { after: null })).data.productVariants,
        null,
        1,
      ).records[0];
    });
    await check("locations", async () =>
      connection(
        (await this.query("Locations", { after: null })).data.locations,
        null,
      ),
    );
    if (this.config.evidence.physicalStock)
      await check("stock", async () => {
        if (!firstVariant) throw new ConnectorReadError("NOT_CONFIGURED");
        const item = object(firstVariant.inventoryItem),
          result = await this.query("Levels", {
            id: gid(item.id, "InventoryItem"),
            after: null,
          }),
          node = object(result.data.inventoryItem);
        if (gid(node.id, "InventoryItem") !== item.id) invalid();
        for (const level of connection(node.inventoryLevels, null).records)
          if (!list(level.quantities).some((q) => q.name === "on_hand"))
            invalid();
      });
    else checks.push({ resource: "stock", code: "NOT_CONFIGURED" });
    await check("cost", async () =>
      connection((await this.query("Cost")).data.inventoryItems, null),
    );
    const observed = verified as Awaited<
      ReturnType<ShopifyConnector["identity"]>
    > | null;
    checks.push({
      resource: "history",
      code:
        observed?.scopes.has("read_all_orders") && this.config.evidence.history
          ? "OK"
          : "NOT_CONFIGURED",
    });
    checks.push({ resource: "receipts", code: "NOT_CONFIGURED" });
    return {
      ...(observed ? { metadata: observed.metadata } : {}),
      checkedAt: new Date().toISOString(),
      ok: checks
        .filter(
          (c) =>
            ![
              "history",
              "receipts",
              "cost",
              ...(this.config.evidence.physicalStock ? [] : ["stock"]),
            ].includes(c.resource),
        )
        .every((c) => c.code === "OK"),
      checks,
      statuses: await this.getStatuses(),
      channels: empty(),
    };
  }
}
