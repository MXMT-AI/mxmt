import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { HoroshopConnector } from "@/lib/connectors/horoshop/adapter";
import {
  parseHoroshopConfig,
  horoshopMapping,
  shopOrigin,
} from "@/lib/connectors/horoshop/config";
import {
  publicAddress,
  resolveShop,
  horoshopFetch,
} from "@/lib/connectors/horoshop/transport";
import {
  horoshopConfig as config,
  horoshopFetcher,
  horoshopOrder,
  horoshopProduct,
  envelope,
} from "../fixtures/horoshop-connector";
it("uses allowlisted POST functions and private instance tokens; never places secrets in URLs or audit responses", async () => {
  const calls: Array<{ url: URL; init: RequestInit }> = [],
    base = horoshopFetcher();
  const c = new HoroshopConnector(config, async (url, init) => {
    calls.push({ url, init });
    const r = await base(url, init);
    if (url.pathname.endsWith("get/")) {
      const b = await r.json();
      b.response.echo = "a".repeat(32) + config.password + config.login;
      return Response.json(b);
    }
    return r;
  });
  const r = await c.getOrders();
  await c.getStatuses();
  expect(calls.filter((c) => c.url.pathname === "/api/auth/")).toHaveLength(1);
  for (const call of calls) {
    expect(call.url.search).toBe("");
    expect(call.init.method).toBe("POST");
    expect(call.init.redirect).toBe("error");
  }
  for (const secret of [config.login, config.password, "a".repeat(32)])
    expect(r.rawResponse).not.toContain(secret);
  expect(r.records[0]).toMatchObject({
    externalId: "1",
    paidAt: null,
    returnedAt: null,
    updatedAt: null,
    channelId: null,
  });
  expect(c.capabilities).toMatchObject({
    incrementalOrders: false,
    automaticSync: false,
    receipts: false,
    orderRevisions: "observation",
  });
  const second = new HoroshopConnector(
    { ...config, password: "rotated-password" },
    async (url, init) => {
      calls.push({ url, init });
      return base(url, init);
    },
  );
  await second.getOrders();
  expect(calls.filter((c) => c.url.pathname === "/api/auth/")).toHaveLength(2);
});
it("refreshes expiry once and bounds unauthorized retry; rejected authentication does not cache a token", async () => {
  let now = 0,
    auth = 0,
    reads = 0;
  const c = new HoroshopConnector(
    config,
    async (url) => {
      if (url.pathname.endsWith("auth/")) {
        auth++;
        return Response.json(envelope({ token: "b".repeat(32) }));
      }
      reads++;
      return Response.json(
        reads === 2 ? { status: "UNAUTHORIZED" } : envelope({ orders: [] }),
      );
    },
    () => now,
  );
  await c.getOrders();
  await c.getOrders();
  expect(auth).toBe(2);
  now += 551000;
  await Promise.all([c.getOrders(), c.getOrders()]);
  expect(auth).toBe(3);
  let count = 0;
  const broken = new HoroshopConnector(config, async (url) => {
    count++;
    return Response.json(
      url.pathname.endsWith("auth/")
        ? envelope({ token: "b".repeat(32) })
        : { status: "AUTHORIZATION_ERROR" },
    );
  });
  await expect(broken.getOrders()).rejects.toMatchObject({
    code: "AUTH_FAILED",
  });
  expect(count).toBe(4);
  const wrong = new HoroshopConnector(config, async () =>
    Response.json({ status: "ERROR", response: { message: config.password } }),
  );
  await expect(wrong.getOrders()).rejects.toMatchObject({
    code: "AUTH_FAILED",
  });
});
it("rescans old orders without creation/update filters and replays offsets exactly", async () => {
  const calls: any[] = [],
    base = horoshopFetcher([horoshopOrder(1), horoshopOrder(2)]),
    c = new HoroshopConnector(config, async (u, i) => {
      calls.push(JSON.parse(String(i.body)));
      return base(u, i);
    });
  const first = await c.getOrders({
    offset: 0,
    limit: 1,
    orderedFrom: "2026-01-01T00:00:00Z",
    orderedTo: "2026-10-01T00:00:00Z",
  });
  expect(first.next).toEqual({ kind: "offset", offset: 1 });
  expect(first.records[0].orderedAt).toContain("2020-09-10");
  expect(
    (await c.getOrders({ offset: 1, limit: 1 })).records[0].externalId,
  ).toBe("2");
  expect(
    (await c.getOrders({ offset: 1, limit: 1 })).records[0].externalId,
  ).toBe("2");
  expect((await c.getOrders({ offset: 2, limit: 1 })).next).toBeNull();
  expect(calls.some((d) => d.from || d.to || d.updatedFrom)).toBe(false);
  await expect(
    c.getOrders({ updatedFrom: "2026-01-01T00:00:00Z" }),
  ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
});
it("never guesses numeric stock, payment dates, costs, refund events or bundle allocations", async () => {
  const order = horoshopOrder();
  order.products[0] = { ...order.products[0], type: "set_item" } as any;
  const c = new HoroshopConnector(
    { ...config, evidence: { ...config.evidence, physicalStock: false } },
    horoshopFetcher([order]),
  );
  expect((await c.getOrders()).records[0].lines[0]).toMatchObject({
    unitPrice: null,
    costPrice: null,
    commission: null,
    discount: null,
  });
  expect((await c.getStock()).records[0].onHand).toBeNull();
  await expect(c.getReceipts()).rejects.toMatchObject({
    code: "NOT_CONFIGURED",
  });
  const discounted = horoshopOrder();
  discounted.discount_value = 5;
  expect(
    (
      await new HoroshopConnector(
        config,
        horoshopFetcher([discounted]),
      ).getOrders()
    ).records[0].lines[0].unitPrice,
  ).toBeNull();
});
it("validates the independently approved catalog count, warehouses, terminal empty probe and modification identities", async () => {
  const c = new HoroshopConnector(config, horoshopFetcher()),
    p = await c.getCatalogPage();
  expect(p.records[0]).toMatchObject({
    product: { externalId: "001-A", sku: "001-A" },
    stock: { onHand: "12.5" },
  });
  expect(p.next).toEqual({ kind: "offset", offset: 1 });
  const terminal = await c.getCatalogPage({
    offset: 1,
    observationId: p.observationId,
  });
  expect(terminal.next).toBeNull();
  expect(terminal.observationId).toBe(p.observationId);
  for (const products of [
    [],
    [{ ...horoshopProduct, residues: [] }],
    [{ ...horoshopProduct, residues: [{ warehouse: "Other", quantity: 9 }] }],
    [horoshopProduct, horoshopProduct],
  ])
    await expect(
      new HoroshopConnector(
        config,
        horoshopFetcher([], products),
      ).getCatalogPage(),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  const noProof = new HoroshopConnector(
    { ...config, evidence: { ...config.evidence, catalogCount: null } },
    horoshopFetcher(),
  );
  await expect(noProof.getCatalogPage()).rejects.toMatchObject({
    code: "NOT_CONFIGURED",
  });
});
it.each([
  { status: "EXCEPTION", response: { message: config.password } },
  { status: "OK", response: { orders: {} } },
  { status: "EMPTY", response: { orders: [horoshopOrder()] } },
  { status: "OK", response: { orders: [horoshopOrder(), horoshopOrder()] } },
])(
  "rejects malformed or partial/error envelopes without leaking provider messages",
  async (body) => {
    const c = new HoroshopConnector(config, async (u) =>
      Response.json(
        u.pathname.endsWith("auth/")
          ? envelope({ token: "a".repeat(32) })
          : body,
      ),
    );
    await expect(c.getOrders()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  },
);
it.each([401, 403, 429, 500, 302])(
  "handles HTTP %s with safe diagnostics and Retry-After",
  async (status) => {
    const c = new HoroshopConnector(
      config,
      async () =>
        new Response("sensitive message", {
          status,
          headers: { "Retry-After": "120" },
        }),
    );
    try {
      await c.getOrders();
      throw new Error("missing error");
    } catch (e: any) {
      expect(e.code).toBe(
        [401, 403].includes(status)
          ? "AUTH_FAILED"
          : status === 429
            ? "RATE_LIMITED"
            : "NETWORK_ERROR",
      );
      expect(String(e)).not.toContain("sensitive");
      if (status === 429) expect(e.retryAt).toBeInstanceOf(Date);
    }
  },
);
it("reports independent resource checks and unsupported resources", async () => {
  const base = horoshopFetcher();
  const c = new HoroshopConnector(config, async (u, i) =>
    u.pathname.endsWith("get_available_statuses/")
      ? Response.json({ status: "EXCEPTION" })
      : base(u, i),
  );
  const r = await c.checkConnection();
  expect(r.ok).toBe(false);
  expect(r.checks).toContainEqual({ resource: "catalog", code: "OK" });
  expect(r.checks).toContainEqual({
    resource: "receipts",
    code: "NOT_CONFIGURED",
  });
  expect(r.checks).toContainEqual({
    resource: "statuses",
    code: "INVALID_RESPONSE",
  });
});
it("validates origins and every DNS answer, blocks mixed/private/IPv4-mapped and unsafe custom origins", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "100.64.1.1",
    "192.168.1.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "2002:7f00:1::",
    "2001:db8::1",
  ])
    expect(publicAddress(address), address).toBe(false);
  expect(publicAddress("8.8.8.8")).toBe(true);
  expect(publicAddress("2606:4700:4700::1111")).toBe(true);
  await expect(
    resolveShop("shop.example.com", (async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]) as any),
  ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  for (const origin of [
    "http://shop.example.com",
    "https://127.0.0.1",
    "https://user:pw@shop.example.com",
    "https://shop.example.com:8443",
    "https://shop.example.com/path",
    "https://shop.local",
    "https://shop.example.com?q=token",
  ])
    expect(shopOrigin(origin)).toBeNull();
  await expect(
    horoshopFetch(new URL(config.origin + "/api/auth/"), {
      method: "POST",
      body: "{}",
    }),
  ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
});
it("requires strict account evidence and audits any stock/price/quota/status change through mapping revisions", () => {
  expect(parseHoroshopConfig(config).credentials).not.toBeNull();
  for (const value of [
    { ...config, tenantId: "foreign" },
    { ...config, evidence: { ...config.evidence, requestsPerWindow: 0 } },
    {
      ...config,
      evidence: { ...config.evidence, physicalStock: true, warehouses: [] },
    },
    { ...config, statuses: { 3: "RETURN" } },
  ])
    expect(parseHoroshopConfig(value).credentials).toBeNull();
  expect(horoshopMapping(config).values.evidence).toEqual(config.evidence);
  expect(JSON.stringify(horoshopMapping(config))).not.toContain(
    config.password,
  );
});
