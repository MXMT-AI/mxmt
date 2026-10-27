import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
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
vi.mock("@/lib/connectors/horoshop/transport", () => ({
  horoshopFetch: (u: URL, i: RequestInit) => state.fetcher(u, i),
}));
import { createScreenDb } from "../helpers/screen-db";
import { connectorModels } from "../helpers/connector-models";
import { signAccessToken } from "@/lib/auth";
import {
  horoshopConfig as config,
  horoshopFetcher,
} from "../fixtures/horoshop-connector";
import { GET, PUT, POST } from "@/app/api/connectors/[provider]/route";
const ctx = { params: Promise.resolve({ provider: "horoshop" }) };
let f: Awaited<ReturnType<typeof createScreenDb>>;
const login = async (role = "ADMIN", tenantId = "a") => {
  state.cookie = await signAccessToken({ sub: "owner", tenantId, role });
};
const req = (method = "GET", body?: unknown) =>
  new NextRequest("http://localhost/api/connectors/horoshop", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeAll(async () => {
  vi.stubEnv("JWT_SECRET", "synthetic-auth-secret-for-horoshop-tests");
  vi.stubEnv(
    "CONNECTOR_ENCRYPTION_KEY",
    Buffer.alloc(32, 9).toString("base64"),
  );
  f = await createScreenDb();
  state.models = {
    ...connectorModels(f.db),
    $transaction: (cb: any) =>
      f.db.$transaction((tx) => cb(connectorModels(tx))),
  };
  state.fetcher.mockImplementation(horoshopFetcher());
}, 30000);
afterAll(async () => {
  await f?.pg.close();
  vi.unstubAllEnvs();
});
it("requires signed ADMIN, bounds JSON and rejects tenant/source overrides before any network/storage", async () => {
  expect((await PUT(req("PUT", config), ctx)).status).toBe(401);
  await login("VIEWER");
  expect((await PUT(req("PUT", config), ctx)).status).toBe(403);
  expect((await POST(req("POST"), ctx)).status).toBe(403);
  await login();
  expect(
    (await PUT(req("PUT", { ...config, tenantId: "b" }), ctx)).status,
  ).toBe(400);
  expect(
    (await PUT(req("PUT", { ...config, password: "x".repeat(17000) }), ctx))
      .status,
  ).toBe(413);
  expect(state.fetcher).not.toHaveBeenCalled();
});
it("saves encrypted provider-bound credentials with actor-approved mapping and no implicit source selection", async () => {
  const r = await PUT(req("PUT", config), ctx);
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(await r.text()).not.toMatch(
    /synthetic-password|integration-user|encryptedConfig/,
  );
  const row = (
    await f.pg.query<{ encryptedConfig: string }>(
      `SELECT "encryptedConfig" FROM "ConnectorConnection" WHERE provider='horoshop'`,
    )
  ).rows[0];
  expect(row.encryptedConfig).toMatch(/^v1\./);
  expect(row.encryptedConfig).not.toContain(config.password);
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
    /synthetic-password|integration-user|encryptedConfig/,
  );
  await login("ADMIN", "b");
  expect(await (await GET(req(), ctx)).json()).toMatchObject({
    configured: false,
  });
  await login();
});
it("runs independent checks and invalidates them on rotation; mapping/quota/warehouse changes need a higher audited revision", async () => {
  const r = await POST(req("POST"), ctx);
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({
    lastCheck: {
      ok: true,
      checks: [
        { resource: "orders", code: "OK" },
        { resource: "statuses", code: "OK" },
        { resource: "catalog", code: "OK" },
        { resource: "stock", code: "OK" },
        { resource: "receipts", code: "NOT_CONFIGURED" },
      ],
    },
  });
  for (const change of [
    { requestsPerWindow: 10 },
    { warehouses: ["Other"] },
    { catalogCount: 2 },
    { stableOrderPagination: false },
    { netUnitPrice: false },
    { reference: "new evidence" },
  ])
    expect(
      (
        await PUT(
          req("PUT", {
            ...config,
            evidence: { ...config.evidence, ...change },
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
    req("PUT", { ...config, password: "rotated-password" }),
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
      evidence: { ...config.evidence, catalogCount: 2 },
    }),
    ctx,
  );
  expect(changed.status).toBe(200);
  expect(
    (
      await f.pg.query(
        `SELECT revision FROM "MerchandisingConfig" WHERE "tenantId"='a' AND key LIKE 'horoshop:%' AND "configType"='SOURCE_MAPPING' AND "isActive"`,
      )
    ).rows,
  ).toEqual([{ revision: 2 }]);
});
