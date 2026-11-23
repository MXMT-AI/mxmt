import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  models: null as any,
  cookie: "",
  fetcher: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: state.cookie }) }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, { get: (_, k) => state.models?.[k] }),
}));
vi.mock("@/lib/server-fetch", () => ({
  fetchWithTimeout: (u: URL, i: RequestInit) => state.fetcher(u, i),
}));
import type { createScreenDb } from "../helpers/screen-db";
import { connectorApiRequest, loginConnectorApi, setupConnectorApi } from "../helpers/connector-api";
import {
  shopifyConfig as config,
  shopifyFetcher,
} from "../fixtures/shopify-connector";
import { GET, PUT, POST } from "@/app/api/connectors/[provider]/route";
const ctx = { params: Promise.resolve({ provider: "shopify" }) };
let f: Awaited<ReturnType<typeof createScreenDb>>;
const login = (role?: string, tenantId?: string) => loginConnectorApi(state, role, tenantId);
const req = connectorApiRequest("http://localhost/api/connectors/shopify");
beforeAll(async () => {
  f = await setupConnectorApi(state, "JWT_SECRET", "synthetic-auth-secret-for-shopify-tests");
  state.fetcher.mockImplementation(shopifyFetcher());
}, 30000);
afterAll(async () => {
  await f?.pg.close();
  vi.unstubAllEnvs();
});
it("requires signed ADMIN and rejects identity overrides or oversized credentials before requests", async () => {
  expect((await PUT(req("PUT", config), ctx)).status).toBe(401);
  await login("VIEWER");
  expect((await PUT(req("PUT", config), ctx)).status).toBe(403);
  expect((await POST(req("POST"), ctx)).status).toBe(403);
  await login();
  expect(
    (await PUT(req("PUT", { ...config, tenantId: "b" }), ctx)).status,
  ).toBe(400);
  expect(
    (await PUT(req("PUT", { ...config, accessToken: "x".repeat(17000) }), ctx))
      .status,
  ).toBe(413);
  expect(state.fetcher).not.toHaveBeenCalled();
});
it("encrypts write-only Shopify tokens and records owner-approved mappings without selecting a source", async () => {
  const response = await PUT(req("PUT", config), ctx);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.text()).not.toContain(config.accessToken);
  const row = (
    await f.pg.query<any>(
      `SELECT "encryptedConfig" FROM "ConnectorConnection" WHERE provider='shopify'`,
    )
  ).rows[0];
  expect(row.encryptedConfig).toMatch(/^v1\./);
  expect(row.encryptedConfig).not.toContain(config.accessToken);
  expect(
    (
      await f.pg.query(
        `SELECT "actorId" FROM "MerchandisingAction" WHERE action='CONNECTOR_MAPPING_SAVED'`,
      )
    ).rows,
  ).toEqual([{ actorId: "owner" }]);
  expect(
    (
      await f.pg.query(
        `SELECT * FROM "ConnectorSelection" WHERE "tenantId"='a'`,
      )
    ).rows,
  ).toHaveLength(0);
  await login("VIEWER");
  expect(await (await GET(req(), ctx)).text()).not.toMatch(
    /accessToken|encryptedConfig|synthetic-shopify-token/,
  );
  await login("ADMIN", "b");
  expect(await (await GET(req(), ctx)).json()).toMatchObject({
    configured: false,
  });
  await login();
});
it("checks scopes/version/shop/cost/history separately through the real shared budget and clears checks on token rotation", async () => {
  const response = await POST(req("POST"), ctx);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.lastCheck.ok).toBe(true);
  expect(body.lastCheck.checks).toContainEqual({
    resource: "history",
    code: "NOT_CONFIGURED",
  });
  expect(body.lastCheck.checks).toContainEqual({
    resource: "cost",
    code: "OK",
  });
  for (const evidence of [
    { physicalStock: false },
    { financials: false },
    { locationIds: ["gid://shopify/Location/2"] },
    { reference: "new approval" },
  ])
    expect(
      (
        await PUT(
          req("PUT", {
            ...config,
            evidence: { ...config.evidence, ...evidence },
          }),
          ctx,
        )
      ).status,
    ).toBe(409);
  expect(
    (
      await PUT(
        req("PUT", { ...config, timezone: "UTC", mappingRevision: 2 }),
        ctx,
      )
    ).status,
  ).toBe(409);
  const rotated = await PUT(
    req("PUT", { ...config, accessToken: "rotated-synthetic-token" }),
    ctx,
  );
  expect(await rotated.json()).toMatchObject({ revision: 2, lastCheck: null });
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "MerchandisingAction" WHERE action='CONNECTOR_MAPPING_SAVED'`,
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
  const changed = await PUT(
    req("PUT", {
      ...config,
      mappingRevision: 2,
      evidence: { ...config.evidence, financials: false },
    }),
    ctx,
  );
  expect(changed.status).toBe(200);
});
