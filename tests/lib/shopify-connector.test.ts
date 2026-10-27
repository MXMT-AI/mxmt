import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { ShopifyConnector } from "@/lib/connectors/shopify/adapter";
import {
  parseShopifyConfig,
  shopifyMapping,
} from "@/lib/connectors/shopify/config";
import { mapOrders } from "@/lib/connectors/shopify/mapping";
import {
  shopifyConfig as config,
  shopifyFetcher,
  memoryJournal,
  order,
  line,
  refundLine,
  refundTransaction,
  variant,
  level,
  connection,
  id,
  money,
} from "../fixtures/shopify-connector";
async function drain(c: ShopifyConnector, request: any = {}) {
  const records: any[] = [];
  let cursor: null | string = null;
  for (let i = 0; i < 100; i++) {
    const p = await c.getOrders({ ...request, cursor });
    records.push(...p.records);
    if (!p.next) return { records, page: p };
    expect(p.next.kind).toBe("cursor");
    cursor = (p.next as any).cursor;
  }
  throw new Error("did not terminate");
}
it("pins version/host/header and verifies shop/app/scopes while keeping secrets out of URLs", async () => {
  const calls: any[] = [],
    f = shopifyFetcher(),
    c = new ShopifyConnector(
      config,
      async (u, i) => {
        calls.push({ u, i });
        return f(u, i);
      },
      memoryJournal().journal,
    );
  const result = await drain(c);
  expect(result.records).toHaveLength(2);
  for (const { u, i } of calls) {
    expect(u.origin).toBe("https://fixture-store.myshopify.com");
    expect(u.pathname).toBe("/admin/api/2026-10/graphql.json");
    expect(u.search).toBe("");
    expect(i.headers["X-Shopify-Access-Token"]).toBe(config.accessToken);
    expect(i.redirect).toBe("error");
    expect(i.body).not.toContain(config.accessToken);
  }
  expect(c.capabilities).toMatchObject({
    receipts: false,
    historicalStock: false,
    writes: false,
    automaticSync: false,
  });
});
it("yields without publishing partial orders, resumes nested pages after reconstruction and replays idempotently", async () => {
  const j = memoryJournal(),
    calls: string[] = [],
    f = shopifyFetcher(),
    fetcher = async (u: URL, i: RequestInit) => {
      calls.push(JSON.parse(String(i.body)).query);
      return f(u, i);
    };
  let c = new ShopifyConnector(config, fetcher, j.journal);
  const first = await c.getOrders({ limit: 100 });
  expect(first.records).toEqual([]);
  expect(first.next).not.toBeNull();
  const before = calls.filter((v) => v.includes("query OrderLines")).length;
  c = new ShopifyConnector(config, fetcher, j.journal);
  const next = await c.getOrders({
    limit: 100,
    cursor: (first.next as any).cursor,
  });
  expect(next.records).toHaveLength(2);
  expect(calls.filter((v) => v.includes("query OrderLines"))).toHaveLength(
    before,
  );
  expect(
    (await c.getOrders({ limit: 100, cursor: (first.next as any).cursor }))
      .records,
  ).toEqual(next.records);
});
it("does not double-subtract refunds and uses full-payment/successful-refund transaction times", async () => {
  const { records } = await drain(
    new ShopifyConnector(config, shopifyFetcher(), memoryJournal().journal),
  );
  expect(records[0]).toMatchObject({
    externalId: id("Order"),
    statusId: "1",
    paidAt: "2026-09-10T10:00:00.000Z",
    lines: [
      {
        externalLineId: id("LineItem"),
        quantity: "2",
        unitPrice: "25",
        discount: "10",
        discountUnit: "amount",
        costPrice: null,
      },
    ],
  });
  expect(records[1]).toMatchObject({
    externalId: id("Refund"),
    statusId: "2",
    returnedAt: "2026-10-26T10:00:00.000Z",
    lines: [
      {
        externalLineId: id("RefundLineItem"),
        quantity: "1",
        unitPrice: "20",
        costPrice: null,
      },
    ],
  });
  expect(records[0].lines[0].quantity).toBe("2");
});
it("keeps partial/failed/authorization-only/test payments and pending refunds unavailable", () => {
  for (const change of [
    {
      transactions: [{ ...order().transactions[0], amountSet: money("10") }],
      transactionsCount: { count: 1, precision: "EXACT" },
    },
    {
      transactions: order().transactions.map((t) => ({
        ...t,
        kind: "AUTHORIZATION",
      })),
    },
    { test: true },
    { taxesIncluded: true },
  ]) {
    const o = { ...order(), ...change },
      r = mapOrders(
        config,
        {
          order: o,
          lines: [line()],
          refunds: [
            {
              refund: {
                id: id("Refund"),
                updatedAt: order().refunds[0].updatedAt,
                totalRefundedSet: money("20"),
              },
              lines: [refundLine()],
              transactions: [{ ...refundTransaction(), status: "PENDING" }],
            },
          ],
        },
        "2026-10-27T09:00:00Z",
        (v) => v,
      );
    expect(r[0].paidAt).toBeNull();
    expect(r[1].returnedAt).toBeNull();
  }
});
it("rejects changed query/filter, shop, token, app or source/revision-bound cursors", async () => {
  const j = memoryJournal(),
    c = new ShopifyConnector(config, shopifyFetcher(), j.journal),
    p = await c.getOrders({ limit: 100 }),
    cursor = (p.next as any).cursor;
  for (const changed of [
    new ShopifyConnector(
      { ...config, accessToken: "rotated-synthetic-token" },
      shopifyFetcher(),
      j.journal,
    ),
    new ShopifyConnector(
      { ...config, mappingRevision: 2 },
      shopifyFetcher(),
      j.journal,
    ),
    new ShopifyConnector(
      config,
      shopifyFetcher(),
      memoryJournal("other-tenant:other-source:2:run").journal,
    ),
  ])
    await expect(
      changed.getOrders({ cursor, limit: 100 }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  await expect(
    c.getOrders({
      cursor,
      limit: 100,
      updatedFrom: "2026-10-01T00:00:00Z",
      updatedTo: "2026-10-27T00:00:00Z",
    }),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
it("drains more than 250 order/refund lines and variant inventory levels without first-page truncation", async () => {
  const lineCount = 301,
    base = order(),
    f = shopifyFetcher({
      Orders: () => ({ orders: connection([{ ...base, refunds: [] }]) }),
      OrderLines: (v) => {
        const offset = Number(v.after ?? 0),
          rows = Array.from(
            { length: Math.min(100, lineCount - offset) },
            (_, i) => ({ ...line(offset + i + 1), currentQuantity: 2 }),
          );
        return {
          order: {
            id: v.id,
            updatedAt: base.updatedAt,
            lineItems: connection(
              rows,
              offset + 100 < lineCount,
              String(offset + 100),
            ),
          },
        };
      },
    }),
    c = new ShopifyConnector(
      { ...config, evidence: { ...config.evidence, financials: false } },
      f,
      memoryJournal().journal,
    ),
    r = await drain(c);
  expect(r.records[0].lines).toHaveLength(lineCount);
  const journal = memoryJournal(),
    catalog = new ShopifyConnector(
      config,
      shopifyFetcher({
        Levels: (v) => {
          const offset = Number(v.after ?? 0),
            rows = Array.from({ length: Math.min(100, 301 - offset) }, (_, i) =>
              level(offset + i + 1),
            );
          return {
            inventoryItem: {
              id: v.id,
              tracked: true,
              inventoryLevels: connection(
                rows,
                offset + 100 < 301,
                String(offset + 100),
              ),
            },
          };
        },
      }),
      journal.journal,
    );
  let cursor: string | null = null,
    p: any;
  for (let i = 0; i < 10; i++) {
    p = await catalog.getCatalogPage({ cursor, limit: 1 });
    if (p.records.length) break;
    cursor = p.next.cursor;
  }
  expect(p.records[0].stock.onHand).toBe("12");
  expect(journal.pages.size).toBe(5);
});
it("maps all nested refund lines and refund transactions, preserving refund and line GIDs", async () => {
  const f = shopifyFetcher({
    RefundLines: (v) => {
      const offset = Number(v.after ?? 0);
      return {
        refund: {
          id: v.id,
          updatedAt: order().refunds[0].updatedAt,
          refundLineItems: connection(
            Array.from({ length: Math.min(100, 251 - offset) }, (_, i) =>
              refundLine(offset + i + 1),
            ),
            offset + 100 < 251,
            String(offset + 100),
          ),
        },
      };
    },
    RefundTransactions: (v) => ({
      refund: {
        id: v.id,
        updatedAt: order().refunds[0].updatedAt,
        totalRefundedSet: money("20"),
        transactions: connection(
          v.after ? [refundTransaction()] : [],
          false,
          null,
        ),
      },
    }),
  });
  const r = await drain(
    new ShopifyConnector(config, f, memoryJournal().journal),
  );
  expect(r.records[1].lines).toHaveLength(251);
  expect(r.records[1].lines[250].externalLineId).toBe(
    id("RefundLineItem", 251),
  );
});
it("preserves unknown history without all-orders scope and independent approval; empty results prove no coverage", async () => {
  const p = await drain(
    new ShopifyConnector(
      config,
      shopifyFetcher({ Orders: () => ({ orders: connection([]) }) }),
      memoryJournal().journal,
    ),
  );
  expect(p.page.historyCoverage).toBeUndefined();
  const c = new ShopifyConnector(
      config,
      shopifyFetcher(),
      memoryJournal().journal,
    ),
    check = await c.checkConnection();
  expect(check.ok).toBe(true);
  expect(check.checks).toContainEqual({
    resource: "history",
    code: "NOT_CONFIGURED",
  });
  await expect(c.getReceipts()).rejects.toMatchObject({
    code: "NOT_CONFIGURED",
  });
});
it.each([
  {
    errors: [{ message: "secret provider message" }],
    data: { orders: connection([]) },
  },
  { errors: [{ extensions: { code: "THROTTLED" } }], data: {} },
  { data: null },
])(
  "rejects HTTP-200 errors and partial data without exposing raw messages",
  async (body) => {
    const c = new ShopifyConnector(
      config,
      async () =>
        Response.json(body, {
          headers: { "X-Shopify-API-Version": "2026-10" },
        }),
      memoryJournal().journal,
    );
    await expect(c.getOrders()).rejects.toMatchObject({
      code:
        Array.isArray(body.errors) &&
        (body.errors[0] as any)?.extensions?.code === "THROTTLED"
          ? "RATE_LIMITED"
          : "INVALID_RESPONSE",
    });
  },
);
it("rejects API fallback, unsafe hosts, invalid evidence, wrong app/shop and missing read scopes", async () => {
  expect(parseShopifyConfig(config).credentials).not.toBeNull();
  for (const shop of [
    "shop.example.com",
    "https://fixture-store.myshopify.com",
    "fixture-store.myshopify.com.evil.com",
    "127.0.0.1",
    "user:password@fixture-store.myshopify.com",
  ])
    expect(parseShopifyConfig({ ...config, shop }).credentials).toBeNull();
  expect(JSON.stringify(shopifyMapping(config))).not.toContain(
    config.accessToken,
  );
  const wrong = new ShopifyConnector(
    config,
    async () =>
      Response.json(
        { data: {} },
        { headers: { "X-Shopify-API-Version": "2026-07" } },
      ),
    memoryJournal().journal,
  );
  await expect(wrong.getOrders()).rejects.toMatchObject({
    code: "INVALID_RESPONSE",
  });
  for (const data of [
    {
      shop: {
        id: id("Shop"),
        myshopifyDomain: "other.myshopify.com",
        ianaTimezone: config.timezone,
        currencyCode: "UAH",
      },
      currentAppInstallation: { app: { id: config.appId }, accessScopes: [] },
    },
    {
      shop: {
        id: id("Shop"),
        myshopifyDomain: config.shop,
        ianaTimezone: config.timezone,
        currencyCode: "UAH",
      },
      currentAppInstallation: { app: { id: id("App", 2) }, accessScopes: [] },
    },
  ])
    await expect(
      new ShopifyConnector(
        config,
        shopifyFetcher({ Identity: () => data }),
        memoryJournal().journal,
      ).getOrders(),
    ).rejects.toMatchObject({ code: "AUTH_FAILED" });
});
it("never uses current inventory cost as historical COGS or availability as physical stock", async () => {
  const c = new ShopifyConnector(
      config,
      shopifyFetcher(),
      memoryJournal().journal,
    ),
    p = await c.getCatalogPage({ limit: 1 });
  expect(p.records[0]).toMatchObject({
    product: {
      externalId: id("ProductVariant"),
      sku: "001-A",
      costPrice: null,
    },
    stock: { onHand: "12", inTransit: null },
  });
  await expect(
    new ShopifyConnector(
      config,
      shopifyFetcher({
        Levels: (v) => ({
          inventoryItem: {
            id: v.id,
            tracked: true,
            inventoryLevels: connection([
              {
                ...level(),
                quantities: [{ name: "available", quantity: 100 }],
              },
            ]),
          },
        }),
      }),
      memoryJournal().journal,
    ).getCatalogPage({ limit: 1 }),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});

it("reads top-level order cursors and emits each global order identity once", async () => {
  const f = shopifyFetcher({
    Orders: (v) => ({
      orders: connection(
        [{ ...order(), id: id("Order", v.after ? 2 : 1), refunds: [] }],
        !v.after,
        v.after ? null : "next-order",
      ),
    }),
  });
  const { records } = await drain(
    new ShopifyConnector(config, f, memoryJournal().journal),
  );
  expect(records.map((r) => r.externalId)).toEqual([
    id("Order", 1),
    id("Order", 2),
  ]);
});
it("bounds changing orders and never publishes an order assembled across source versions", async () => {
  const f = shopifyFetcher({
      OrderFence: (v) => ({
        order: { id: v.id, updatedAt: "2026-10-27T11:00:00Z" },
      }),
    }),
    c = new ShopifyConnector(config, f, memoryJournal().journal);
  let cursor: string | null = null,
    sawError = false;
  for (let i = 0; i < 12; i++) {
    try {
      const p = await c.getOrders({ cursor });
      expect(p.records).toEqual([]);
      cursor = (p.next as any).cursor;
    } catch (e: any) {
      expect(e.code).toBe("INVALID_RESPONSE");
      sawError = true;
      break;
    }
  }
  expect(sawError).toBe(true);
});
it("requires both actual all-orders permission and approved history on every nested continuation", async () => {
  const base = shopifyFetcher(),
    withScopes = shopifyFetcher({
      Identity: () => ({
        shop: {
          id: id("Shop"),
          myshopifyDomain: config.shop,
          ianaTimezone: config.timezone,
          currencyCode: "UAH",
        },
        currentAppInstallation: {
          app: { id: config.appId },
          accessScopes: [
            "read_orders",
            "read_all_orders",
            "read_products",
            "read_inventory",
            "read_locations",
          ].map((handle) => ({ handle })),
        },
      }),
    });
  const proof = {
      from: "2024-10-01T00:00:00Z",
      to: "2026-10-01T00:00:00Z",
      reference: "approved synthetic history",
    },
    c = new ShopifyConnector(
      { ...config, evidence: { ...config.evidence, history: proof } },
      withScopes,
      memoryJournal().journal,
    ),
    p = await c.getOrders();
  expect(p.records).toEqual([]);
  expect(p.historyCoverage).toMatchObject({
    from: proof.from,
    to: proof.to,
    complete: true,
  });
  const completed = await c.getOrders({ cursor: (p.next as any).cursor });
  expect(completed.historyCoverage).toMatchObject({
    from: proof.from,
    to: proof.to,
    complete: true,
  });
  const limited = await drain(
    new ShopifyConnector(
      { ...config, evidence: { ...config.evidence, history: proof } },
      base,
      memoryJournal().journal,
    ),
  );
  expect(limited.page.historyCoverage).toBeUndefined();
});
it("rejects truncated transaction arrays and non-reconciling money at record level", async () => {
  for (const changed of [
    { transactionsCount: { count: 251, precision: "EXACT" } },
    { transactionsCount: { count: 2, precision: "AT_LEAST" } },
    { subtotalPriceSet: money("41") },
  ]) {
    const c = new ShopifyConnector(
      config,
      shopifyFetcher({
        Orders: () => ({ orders: connection([{ ...order(), ...changed }]) }),
      }),
      memoryJournal().journal,
    );
    const { records } = await drain(c);
    expect(records).toHaveLength(1);
    expect(records[0].rejectionCode).toBe("ORDER_RECORD_INVALID");
    expect(records[0].lines).toEqual([]);
  }
});
it("drains refund transactions beyond 250 and supports parameterized inventory level IDs", async () => {
  const c = new ShopifyConnector(
    config,
    shopifyFetcher({
      RefundTransactions: (v) => {
        const offset = Number(v.after ?? 0);
        return {
          refund: {
            id: v.id,
            updatedAt: order().refunds[0].updatedAt,
            totalRefundedSet: money("301"),
            transactions: connection(
              Array.from({ length: Math.min(100, 301 - offset) }, (_, i) => ({
                ...refundTransaction(),
                id: id("OrderTransaction", 1000 + offset + i),
                amountSet: money("1"),
              })),
              offset + 100 < 301,
              String(offset + 100),
            ),
          },
        };
      },
    }),
    memoryJournal().journal,
  );
  const { records } = await drain(c);
  expect(records[1].returnedAt).toBe("2026-10-26T10:00:00.000Z");
  expect(records[1].raw.transactions).toHaveLength(301);
  const catalog = new ShopifyConnector(
    config,
    shopifyFetcher({
      Levels: (v) => ({
        inventoryItem: {
          id: v.id,
          tracked: true,
          inventoryLevels: connection([
            {
              ...level(),
              id: "gid://shopify/InventoryLevel/1?inventory_item_id=1",
            },
          ]),
        },
      }),
    }),
    memoryJournal().journal,
  );
  expect(
    (await catalog.getCatalogPage({ limit: 1 })).records[0].stock.onHand,
  ).toBe("12");
});
it("rejects malformed pagination before caching partial facts", async () => {
  for (const value of [
    connection([line()], true, null),
    connection([line()], true, "same-cursor"),
    connection([line(), line()]),
  ]) {
    const c = new ShopifyConnector(
      config,
      shopifyFetcher({
        OrderLines: (v) => ({
          order: { id: v.id, updatedAt: order().updatedAt, lineItems: value },
        }),
      }),
      memoryJournal().journal,
    );
    if (value.pageInfo.endCursor === "same-cursor") {
      await expect(drain(c)).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
      });
    } else
      await expect(c.getOrders()).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
      });
  }
});

it("retains unknown stock for untracked variants and missing approved locations without inventing zero", async () => {
  for (const overrides of [
    {
      Variants: () => ({
        productVariants: connection([
          {
            ...variant(),
            inventoryItem: { ...variant().inventoryItem, tracked: false },
          },
        ]),
      }),
    },
    {
      Levels: (v: any) => ({
        inventoryItem: {
          id: v.id,
          tracked: true,
          inventoryLevels: connection([]),
        },
      }),
    },
  ]) {
    const p = await new ShopifyConnector(
      config,
      shopifyFetcher(overrides),
      memoryJournal().journal,
    ).getCatalogPage({ limit: 1 });
    expect(p.records[0].stock.onHand).toBeNull();
    expect(p.records[0].product.sku).toBe("001-A");
  }
  const c = new ShopifyConnector(
    { ...config, evidence: { ...config.evidence, physicalStock: false } },
    shopifyFetcher(),
    memoryJournal().journal,
  );
  expect((await c.getProducts({ limit: 1 })).records[0].externalId).toBe(
    id("ProductVariant"),
  );
});
