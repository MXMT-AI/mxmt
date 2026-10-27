import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { isRecord } from "@/lib/api-contracts";
import { ConnectorReadError } from "../read-error";
import { parseSourceJson } from "../json";
import { exact, sourceDate } from "../order-normalization";
import { retryAfter } from "../budget";
import { parseHoroshopConfig, type HoroshopConfig } from "./config";
import type {
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
type Row = Record<string, unknown>;
type Path =
  | "auth"
  | "orders/get"
  | "orders/get_available_statuses"
  | "catalog/export";
const invalid = (): never => {
  throw new ConnectorReadError("INVALID_RESPONSE");
};
const object = (v: unknown): Row => (isRecord(v) ? v : invalid());
const id = (v: unknown): string => {
  const s =
    typeof v === "string"
      ? v
      : typeof v === "number" && Number.isSafeInteger(v)
        ? String(v)
        : "";
  return s && s.length <= 200 && s.trim() === s && !/[\x00-\x1f\x7f]/.test(s)
    ? s
    : invalid();
};
const text = (v: unknown): string =>
  typeof v === "string" && v.trim() && v.length <= 1000 ? v : invalid();
const title = (v: unknown): string =>
  typeof v === "string"
    ? text(v)
    : text(object(v).ua ?? object(v).en ?? object(v).ru);
const rows = (v: unknown): Row[] =>
  Array.isArray(v) && v.length <= 1000 ? v.map(object) : invalid();
const decimal = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  const s =
    typeof v === "string"
      ? v
      : typeof v === "number" && Number.isSafeInteger(v)
        ? String(v)
        : null;
  return s !== null && exact(s) ? s : invalid();
};
const unavailable = (reason = "UNSUPPORTED"): Dictionary => ({
  entries: [],
  complete: false,
  reason,
});
/** Read-only JSON POST transport; tokens live only on this tenant/source/revision-bound runtime instance. */
export class HoroshopConnector implements MerchandisingConnector {
  readonly provider = "horoshop" as const;
  readonly capabilities: ConnectorCapabilities;
  private readonly config: HoroshopConfig;
  private session: Promise<{ token: string; expires: number }> | null = null;
  constructor(
    config: HoroshopConfig,
    private readonly fetcher: (
      url: URL,
      init: RequestInit,
    ) => Promise<Response>,
    private readonly now = () => Date.now(),
  ) {
    const parsed = parseHoroshopConfig(config);
    if (!parsed.credentials) throw new ConnectorReadError("NOT_CONFIGURED");
    this.config = parsed.credentials;
    this.capabilities = {
      orders: config.evidence.stableOrderPagination,
      products: config.evidence.catalogCount !== null,
      stock:
        config.evidence.physicalStock && config.evidence.catalogCount !== null,
      receipts: false,
      statuses: true,
      channels: "unavailable",
      incrementalOrders: false,
      incrementalReceipts: false,
      historicalStock: false,
      writes: false,
      automaticSync: false,
      orderRevisions: "observation",
      pagination: { orders: "offset", catalog: "offset" },
      pageSize: { orders: 100, catalog: 100 },
    };
  }
  /** Redact credential echoes only in audit copies, never in the payload mapped to facts. */
  private audit(value: unknown, token?: string): unknown {
    const secrets = [this.config.password, this.config.login, token].filter(
      (v): v is string => Boolean(v),
    );
    const redact = (v: unknown): unknown => {
      if (typeof v === "string")
        return secrets.reduce(
          (text, key) => text.split(key).join("[REDACTED]"),
          v,
        );
      if (Array.isArray(v)) return v.map(redact);
      if (isRecord(v))
        return Object.fromEntries(
          Object.entries(v).map(([key, item]) => [
            String(redact(key)),
            ["token", "password", "login"].includes(key.toLowerCase())
              ? "[REDACTED]"
              : redact(item),
          ]),
        );
      return v;
    };
    return redact(value);
  }
  private async post(path: Path, data: Row, secret?: string) {
    let response: Response;
    try {
      response = await this.fetcher(
        new URL(`/api/${path}/`, this.config.origin),
        {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(data),
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
    if (!response.body) invalid();
    const reader = response.body!.getReader(),
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
    try {
      let raw = new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks),
      );
      const body = object(parseSourceJson(raw));
      // Source facts are immutable. Mask only independent audit copies.
      const auditRecord = (value: Row) => object(this.audit(value, secret));
      if (path !== "auth") raw = JSON.stringify(auditRecord(body));
      if (path === "auth" && body.status !== "OK")
        throw new ConnectorReadError("AUTH_FAILED");
      if (
        body.status === "UNAUTHORIZED" ||
        body.status === "AUTHORIZATION_ERROR"
      )
        throw new ConnectorReadError("AUTH_FAILED");
      if (body.status === "HTTP_ERROR" && object(body.response).code === 429)
        throw new ConnectorReadError(
          "RATE_LIMITED",
          retryAfter(response.headers.get("Retry-After")),
        );
      if (
        body.status !== "OK" &&
        !(body.status === "EMPTY" && path === "orders/get")
      )
        invalid();
      return {
        body,
        raw,
        auditRecord,
        observedAt: new Date(this.now()).toISOString(),
      };
    } catch (e) {
      if (e instanceof ConnectorReadError) throw e;
      return invalid();
    }
  }
  private async token(): Promise<string> {
    if (this.session) {
      const current = this.session,
        cached = await current;
      if (cached.expires > this.now()) return cached.token;
      if (this.session === current) this.session = null;
      else return this.token();
    }
    this.session = (async () => {
      const started = this.now(),
        r = await this.post("auth", {
          login: this.config.login,
          password: this.config.password,
        }),
        token = object(r.body.response).token;
      if (typeof token !== "string" || !/^[a-zA-Z0-9]{32}$/.test(token))
        invalid();
      return { token: token as string, expires: started + 550000 };
    })();
    try {
      return (await this.session).token;
    } catch (e) {
      this.session = null;
      throw e;
    }
  }
  private async read(path: Exclude<Path, "auth">, data: Row = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.token();
      try {
        return await this.post(path, { ...data, token }, token);
      } catch (e) {
        if (
          attempt === 0 &&
          e instanceof ConnectorReadError &&
          e.code === "AUTH_FAILED"
        ) {
          this.session = null;
          continue;
        }
        throw e;
      }
    }
    return invalid();
  }
  private position(r: PageRequest) {
    const offset = r.offset ?? 0,
      limit = r.limit ?? 100;
    if (
      r.cursor !== undefined ||
      (r.page !== undefined && ![1].includes(r.page)) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 1000000 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      invalid();
    return { offset, limit };
  }
  private async page(
    path: "orders/get" | "catalog/export",
    r: PageRequest,
    data: Row = {},
  ) {
    const { offset, limit } = this.position(r),
      result = await this.read(path, { ...data, offset, limit }),
      key = path === "orders/get" ? "orders" : "products";
    const values =
      result.body.status === "EMPTY"
        ? []
        : rows(object(result.body.response)[key]);
    if (
      result.body.status === "EMPTY" &&
      isRecord(result.body.response) &&
      Array.isArray(result.body.response.orders) &&
      result.body.response.orders.length
    )
      invalid();
    if (values.length > limit) invalid();
    const ids = values.map((v) =>
      id(path === "orders/get" ? v.order_id : v.article),
    );
    if (new Set(ids).size !== ids.length) invalid();
    return {
      ...result,
      values,
      offset,
      limit,
      nextPage: null,
      next:
        values.length === limit
          ? { kind: "offset" as const, offset: offset + values.length }
          : null,
    };
  }
  async getOrders(request: PageRequest = {}): Promise<ConnectorPage<OrderDto>> {
    if (request.updatedFrom || request.updatedTo)
      throw new ConnectorReadError("NOT_CONFIGURED");
    // Every refresh rescans the entire accessible account. Creation filters would skip older modifications.
    const data: Row = request.orderId ? { ids: [id(request.orderId)] } : {},
      r = await this.page("orders/get", request, data);
    if (
      request.orderId &&
      r.values.some((v) => id(v.order_id) !== request.orderId)
    )
      invalid();
    return {
      records: r.values.map((v): OrderDto => {
        const externalId = id(v.order_id);
        try {
          return this.order(v, r.observedAt, r.auditRecord);
        } catch (error) {
          if (
            !(error instanceof ConnectorReadError) ||
            error.code !== "INVALID_RESPONSE"
          )
            throw error;
          // Retain a quarantined slot so offset advancement counts every source row.
          return {
            externalId,
            observedAt: r.observedAt,
            updatedAt: null,
            statusId: null,
            channelId: null,
            orderedAt: null,
            paidAt: null,
            lines: [],
            raw: r.auditRecord(v),
            rejectionCode:
              v.currency !== this.config.evidence.currency
                ? "ORDER_CURRENCY_MISMATCH"
                : "ORDER_RECORD_INVALID",
          };
        }
      }),
      nextPage: null,
      next: r.next,
      rawResponse: r.raw,
      observedAt: r.observedAt,
    };
  }
  private order(
    v: Row,
    observedAt: string,
    audit: (row: Row) => Row,
  ): OrderDto {
    const e = this.config.evidence;
    if (v.currency !== e.currency) invalid();
    const date =
      typeof v.stat_created === "string"
        ? sourceDate(v.stat_created, this.config.timezone).date
        : null;
    if (!date) invalid();
    const products = rows(v.products),
      seen = new Set<string>();
    const lines = products.map((p) => {
      const key = id(p.storage_id);
      if (seen.has(key)) invalid();
      seen.add(key);
      const article = id(p.article),
        quantity = decimal(p.quantity);
      if (quantity === null) invalid();
      // Bundles/order-level discounts lack a verified allocation. Do not double-count them.
      const plain =
        p.type == null ||
        p.type === "" ||
        p.type === "gift" ||
        p.type === "gift_parent";
      const noOrderDiscount = [
        "discount_value",
        "discount_percent",
        "coupon_discount_value",
        "coupon_percent",
        "manager_discount",
      ].every(
        (k) =>
          v[k] != null &&
          decimal(v[k]) !== null &&
          new Prisma.Decimal(decimal(v[k])!).isZero(),
      );
      const price =
        e.netUnitPrice && plain && noOrderDiscount ? decimal(p.price) : null;
      if (price !== null) {
        const total = decimal(p.total_price);
        if (
          total === null ||
          !new Prisma.Decimal(price).mul(quantity!).eq(total)
        )
          invalid();
      }
      return {
        externalLineId: key,
        productId: article,
        sku: article,
        quantity,
        unitPrice: price,
        discount: null,
        discountUnit: "unknown" as const,
        commission: null,
        commissionUnit: "unknown" as const,
        costPrice: null,
      };
    });
    return {
      externalId: id(v.order_id),
      statusId: id(v.stat_status),
      channelId: null,
      orderedAt: date!.toISOString(),
      paidAt: null,
      returnedAt: null,
      updatedAt: null,
      observedAt,
      lines: lines.sort((a, b) =>
        a.externalLineId.localeCompare(b.externalLineId),
      ),
      raw: audit({
        ...v,
        products: [...products].sort((a, b) =>
          id(a.storage_id).localeCompare(id(b.storage_id)),
        ),
      }),
    };
  }
  async getStatuses(): Promise<Dictionary> {
    const r = await this.read("orders/get_available_statuses"),
      data = object(object(r.body.response).statuses);
    if (Object.keys(data).length > 100) invalid();
    return {
      entries: Object.entries(data).map(([k, v]) => {
        const s = object(v);
        if (id(s.id) !== k) invalid();
        return { id: k, name: title(s.title) };
      }),
      complete: true,
      reason: null,
    };
  }
  async getChannels() {
    return unavailable();
  }
  private product(
    v: Row,
    observedAt: string,
    audit: (row: Row) => Row,
  ): ProductDto {
    const article = id(v.article),
      parent = v.parent == null ? null : object(v.parent),
      brand =
        v.brand == null
          ? null
          : typeof v.brand === "string"
            ? v.brand
            : title(object(v.brand).value);
    return {
      externalId: article,
      sku: article,
      name: title(v.title),
      barcode: v.gtin ? id(v.gtin) : null,
      brand,
      categoryId: parent?.id == null ? null : id(parent.id),
      categoryName: parent?.value == null ? null : title(parent.value),
      retailPrice: decimal(v.price),
      oldPrice: decimal(v.price_old),
      costPrice: null,
      currency: this.config.evidence.currency,
      observedAt,
      updatedAt: null,
      raw: audit(v),
    };
  }
  private stock(v: Row, observedAt: string): StockDto {
    let onHand: string | null = null;
    const e = this.config.evidence;
    if (e.physicalStock) {
      const residues = rows(v.residues),
        seen = new Set<string>();
      let sum = new Prisma.Decimal(0);
      for (const w of residues) {
        const warehouse = text(w.warehouse);
        if (seen.has(warehouse)) invalid();
        seen.add(warehouse);
        if (e.warehouses.includes(warehouse)) {
          const q = decimal(w.quantity);
          if (q === null) invalid();
          sum = sum.add(q!);
        }
      }
      if (e.warehouses.some((w) => !seen.has(w))) invalid();
      onHand = decimal(sum.toFixed());
    }
    return {
      externalId: id(v.article),
      productId: id(v.article),
      onHand,
      inTransit: null,
      updatedAt: null,
      observedAt,
    };
  }
  async getProducts(r: PageRequest = {}): Promise<ConnectorPage<ProductDto>> {
    const p = await this.page("catalog/export", r);
    return {
      records: p.values.map((v) =>
        this.product(v, p.observedAt, p.auditRecord),
      ),
      nextPage: null,
      next: p.next,
      observedAt: p.observedAt,
      rawResponse: p.raw,
    };
  }
  async getStock(r: PageRequest = {}): Promise<ConnectorPage<StockDto>> {
    const p = await this.page("catalog/export", r);
    return {
      records: p.values.map((v) => this.stock(v, p.observedAt)),
      nextPage: null,
      next: p.next,
      observedAt: p.observedAt,
      rawResponse: p.raw,
    };
  }
  async getCatalogPage(r: PageRequest = {}) {
    const count = this.config.evidence.catalogCount;
    if (count === null || !this.config.evidence.physicalStock)
      throw new ConnectorReadError("NOT_CONFIGURED");
    const p = await this.page("catalog/export", r);
    if (
      p.offset > count ||
      p.values.length !== Math.min(p.limit, Math.max(0, count - p.offset))
    )
      invalid();
    // Independently approved population count + explicit empty terminal probe, never presence labels.
    const next = p.values.length
      ? { kind: "offset" as const, offset: p.offset + p.values.length }
      : null;
    return {
      records: p.values.map((v) => ({
        product: this.product(v, p.observedAt, p.auditRecord),
        stock: this.stock(v, p.observedAt),
      })),
      nextPage: null,
      next,
      observedAt: p.observedAt,
      rawResponse: p.raw,
      observationId: r.observationId ?? randomUUID(),
      completePopulation: true,
    };
  }
  async getReceipts(): Promise<ConnectorPage<ReceiptDto>> {
    throw new ConnectorReadError("NOT_CONFIGURED");
  }
  async checkConnection(): Promise<ConnectionCheck> {
    const checks: ConnectionCheck["checks"] = [];
    let statuses = unavailable("NOT_CHECKED");
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
    await check("orders", () => this.getOrders({ limit: 1 }));
    await check("statuses", async () => {
      statuses = await this.getStatuses();
    });
    await check("catalog", () => this.getProducts({ limit: 1 }));
    if (this.config.evidence.physicalStock)
      await check("stock", () => this.getStock({ limit: 1 }));
    else checks.push({ resource: "stock", code: "NOT_CONFIGURED" });
    checks.push({ resource: "receipts", code: "NOT_CONFIGURED" });
    return {
      checkedAt: new Date(this.now()).toISOString(),
      ok:
        this.capabilities.orders &&
        checks
          .filter((c) => !["receipts", "stock"].includes(c.resource))
          .every((c) => c.code === "OK") &&
        (!this.capabilities.stock ||
          checks.find((c) => c.resource === "stock")?.code === "OK"),
      checks,
      statuses,
      channels: unavailable(),
    };
  }
}
