import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { KeyCrmConnector } from "@/lib/connectors/keycrm/adapter";
import {
  parseKeyCrmConfig,
  keyCrmMapping,
} from "@/lib/connectors/keycrm/config";
import {
  keyCrmConfig,
  keyCrmOrder,
  keyCrmProduct,
  keyCrmOffer,
  keyCrmStock,
  keyCrmPage,
} from "../fixtures/keycrm-connector";
import { normalizeOrder } from "@/lib/connectors/order-normalization";
const response = (data: unknown) => new Response(JSON.stringify(data));
it("uses fixed origin, bearer GET, documented UTC filters and local page metadata without following remote links", async () => {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const connector = new KeyCrmConnector(keyCrmConfig, async (url, init) => {
    calls.push({ url, init });
    return response(
      keyCrmPage(
        [keyCrmOrder(Number(url.searchParams.get("page")))],
        Number(url.searchParams.get("page")),
        1,
        2,
      ),
    );
  });
  const first = await connector.getOrders({
    page: 1,
    limit: 1,
    orderedFrom: "2026-09-01T00:00:00.000Z",
    orderedTo: "2026-09-30T23:59:59.999Z",
  });
  expect(first.nextPage).toBe(2);
  await connector.getOrders({ page: 2, limit: 1 });
  expect(calls).toHaveLength(2);
  for (const { url, init } of calls) {
    expect(url.origin).toBe("https://openapi.keycrm.app");
    expect(url.pathname).toBe("/v1/order");
    expect(init).toMatchObject({
      method: "GET",
      redirect: "error",
      cache: "no-store",
      headers: { Authorization: "Bearer synthetic-key-one" },
    });
  }
  expect(calls[0].url.searchParams.get("include")).toBe(
    "products.offer,status,payments",
  );
  expect(calls[0].url.searchParams.get("filter[created_between]")).toBe(
    "2026-09-01 00:00:00,2026-10-01 00:00:00",
  );
  expect(first.historyCoverage).toBeUndefined();
  const incremental = new KeyCrmConnector(keyCrmConfig, async (url) => {
    expect(url.searchParams.get("filter[updated_between]")).toBe(
      "2026-10-01 00:00:00,2026-10-02 00:00:00",
    );
    return response(keyCrmPage([], 1, 50));
  });
  await incremental.getOrders({
    updatedFrom: "2026-10-01T00:00:00.000Z",
    updatedTo: "2026-10-02T00:00:00.000Z",
  });
});
it("preserves exact decimal/large-ID tokens and uses independently approved full-payment dates with stable native line/offer IDs", async () => {
  const raw = JSON.stringify(keyCrmPage([keyCrmOrder()]))
    .replace('"id":1,', '"id":9007199254740993,')
    .replace('"20.1250"', "20.1250");
  const page = await new KeyCrmConnector(
    keyCrmConfig,
    async () => new Response(raw),
  ).getOrders();
  const order = page.records[0];
  expect(order.externalId).toBe("9007199254740993");
  expect(order.lines[0]).toMatchObject({
    externalLineId: "101",
    productId: "11",
    sku: "001-A",
    unitPrice: "20.1250",
    costPrice: "10.0000",
  });
  expect(order.paidAt).toBe("2026-09-10T10:00:00.000Z");
  expect(order.returnedAt).toBeNull();
  expect(
    normalizeOrder(
      order,
      "Europe/Kyiv",
      keyCrmMapping(keyCrmConfig).values as any,
    ).lines[0].netAmount?.toFixed(),
  ).toBe("40.25");
});
it("keeps partial payments, missing payment dates, unknown prices/costs and refunds unverified", async () => {
  for (const change of [
    { payment_status: "part_paid" },
    { payments: [{ status: "paid", amount: "40.25", payment_date: null }] },
    {
      payments: [
        { status: "paid", amount: "1", payment_date: "2026-09-10 10:00:00" },
      ],
    },
  ]) {
    const order = (
      await new KeyCrmConnector(keyCrmConfig, async () =>
        response(keyCrmPage([{ ...keyCrmOrder(), ...change }])),
      ).getOrders()
    ).records[0];
    expect(order.paidAt).toBeNull();
  }
  const unverified = (
    await new KeyCrmConnector({ ...keyCrmConfig, evidence: null }, async () =>
      response(keyCrmPage([keyCrmOrder()])),
    ).getOrders()
  ).records[0];
  expect(unverified.lines[0].unitPrice).toBeNull();
  expect(unverified.lines[0].costPrice).toBeNull();
  expect(unverified.paidAt).toBeNull();
  const missing = keyCrmOrder();
  (missing.products[0] as any).purchased_price = null;
  expect(
    (
      await new KeyCrmConnector(keyCrmConfig, async () =>
        response(keyCrmPage([missing])),
      ).getOrders()
    ).records[0].lines[0].costPrice,
  ).toBeNull();
});
it("does not certify empty history without approved range evidence; bounds proof to the approved interval", async () => {
  const connector = new KeyCrmConnector(
    {
      ...keyCrmConfig,
      evidence: {
        ...keyCrmConfig.evidence!,
        history: {
          from: "2026-09-01T00:00:00.000Z",
          to: "2026-09-30T23:59:59.999Z",
          reference: "approved fixture",
        },
      },
    },
    async () => response(keyCrmPage([])),
  );
  const page = await connector.getOrders({
    orderedFrom: "2024-01-01T00:00:00.000Z",
    orderedTo: "2026-10-25T00:00:00.000Z",
  });
  expect(page.historyCoverage).toMatchObject({
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-09-30T23:59:59.999Z",
  });
  expect(
    (
      await connector.getOrders({
        updatedFrom: "2026-10-01T00:00:00.000Z",
        updatedTo: "2026-10-25T00:00:00.000Z",
      })
    ).historyCoverage,
  ).toBeUndefined();
});
it("joins offers/products/physical stock with separate identities and explicit warehouse scope, never subtracting reserve", async () => {
  const calls: string[] = [];
  const connector = new KeyCrmConnector(
    {
      ...keyCrmConfig,
      evidence: { ...keyCrmConfig.evidence!, warehouseIds: ["2"] },
    },
    async (url) => {
      calls.push(url.pathname);
      return response(
        keyCrmPage(
          url.pathname.endsWith("/stocks")
            ? [keyCrmStock]
            : url.pathname.endsWith("/offers")
              ? [keyCrmOffer]
              : [keyCrmProduct],
        ),
      );
    },
  );
  const page = await connector.getCatalogPage({ limit: 50 });
  expect(calls).toEqual(["/v1/offers", "/v1/products", "/v1/offers/stocks"]);
  expect(page.records[0].product).toMatchObject({
    externalId: "11",
    sku: "001-A",
    barcode: "000000001",
  });
  expect(page.records[0].stock.onHand).toBe("4.5");
  expect(page.completePopulation).toBe(true);
  const incomplete = new KeyCrmConnector(keyCrmConfig, async (url) =>
    response(
      keyCrmPage(
        url.pathname.endsWith("/stocks")
          ? []
          : url.pathname.endsWith("/offers")
            ? [keyCrmOffer]
            : [keyCrmProduct],
      ),
    ),
  );
  await expect(incomplete.getCatalogPage()).rejects.toMatchObject({
    code: "INVALID_RESPONSE",
  });
  await expect(connector.getReceipts()).rejects.toMatchObject({
    code: "NOT_CONFIGURED",
  });
});
it.each([401, 403, 429, 500])(
  "sanitizes provider HTTP %i errors and honors Retry-After",
  async (status) => {
    const connector = new KeyCrmConnector(
      keyCrmConfig,
      async () =>
        new Response("private customer and secret key", {
          status,
          headers: { "Retry-After": "120" },
        }),
    );
    await expect(connector.getOrders()).rejects.toMatchObject({
      code:
        status === 401 || status === 403
          ? "AUTH_FAILED"
          : status === 429
            ? "RATE_LIMITED"
            : "NETWORK_ERROR",
    });
  },
);
it("rejects malformed/ignored pagination, large pages, missing native IDs and invalid configuration before any remote call", async () => {
  for (const body of [
    keyCrmPage([keyCrmOrder()], 2),
    { ...keyCrmPage([keyCrmOrder()]), per_page: 100 },
    keyCrmPage([
      {
        ...keyCrmOrder(),
        products: [{ ...keyCrmOrder().products[0], id: null }],
      },
    ]),
    { data: [] },
    { errors: ["private"] },
  ])
    await expect(
      new KeyCrmConnector(keyCrmConfig, async () => response(body)).getOrders(),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  const fetch = vi.fn();
  const connector = new KeyCrmConnector(keyCrmConfig, fetch);
  await expect(connector.getOrders({ limit: 51 })).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
  expect(
    parseKeyCrmConfig({ ...keyCrmConfig, accountId: "https://evil.test" })
      .credentials,
  ).toBeNull();
  expect(
    parseKeyCrmConfig({ ...keyCrmConfig, apiKey: "bad\nheader" }).credentials,
  ).toBeNull();
  expect(
    parseKeyCrmConfig({ ...keyCrmConfig, statuses: { "7": "RETURN" } })
      .credentials,
  ).toBeNull();
});

it("bounds and sanitizes malformed JSON, invalid UTF-8, timeouts and oversized source responses", async () => {
  for (const [response, code] of [
    [new Response("{broken"), "INVALID_RESPONSE"],
    [new Response(new Uint8Array([0xff])), "INVALID_RESPONSE"],
    [new Response("x".repeat(4 * 1024 * 1024 + 1)), "RESPONSE_TOO_LARGE"],
  ] as const) {
    await expect(
      new KeyCrmConnector(keyCrmConfig, async () => response).getOrders(),
    ).rejects.toMatchObject({ code });
  }
  const timeout = new KeyCrmConnector(keyCrmConfig, async () => {
    throw new DOMException("private source", "TimeoutError");
  });
  await expect(timeout.getOrders()).rejects.toMatchObject({ code: "TIMEOUT" });
});

it("bounds onboarding to one page per independent scope and labels paginated dictionaries as partial", async () => {
  let calls = 0;
  const connector = new KeyCrmConnector(keyCrmConfig, async (url) => {
    calls++;
    const limit = Number(url.searchParams.get("limit"));
    const data =
      url.pathname.endsWith("/status") || url.pathname.endsWith("/source")
        ? Array.from({ length: 50 }, (_, i) => ({
            id: i + 1,
            name: "Entry " + i,
          }))
        : url.pathname === "/v1/order"
          ? [keyCrmOrder()]
          : url.pathname.endsWith("/offers")
            ? [keyCrmOffer]
            : url.pathname.endsWith("/stocks")
              ? [keyCrmStock]
              : [keyCrmProduct];
    return response(keyCrmPage(data, 1, limit, limit === 50 ? 51 : 1));
  });
  const checked = await connector.checkConnection();
  expect(calls).toBe(6);
  expect(checked.ok).toBe(true);
  expect(checked.statuses).toMatchObject({
    complete: false,
    reason: "CHECK_FIRST_PAGE_ONLY",
  });
  expect(checked.channels.complete).toBe(false);
});
