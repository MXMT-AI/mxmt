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
  prisma: new Proxy({}, { get: (_, key) => state.models?.[key] }),
}));
vi.mock("@/lib/server-fetch", () => ({
  fetchWithTimeout: (url: URL, init: RequestInit) => state.fetcher(url, init),
}));
import { createScreenDb } from "../helpers/screen-db";
import { Prisma } from "@prisma/client";
import { signAccessToken } from "@/lib/auth";
import {
  keyCrmConfig,
  keyCrmPage,
  keyCrmOrder,
  keyCrmProduct,
  keyCrmOffer,
  keyCrmStock,
} from "../fixtures/keycrm-connector";
import { GET, PUT, POST } from "@/app/api/connectors/[provider]/route";
const ctx = { params: Promise.resolve({ provider: "keycrm" }) };
let f: Awaited<ReturnType<typeof createScreenDb>>;
function models(sql: any) {
  const findUnique = async ({ where }: any) => {
    const k = where.tenantId_provider;
    const [row] = (await sql.$queryRaw(
      Prisma.sql`SELECT c.*,s.timezone FROM "ConnectorConnection" c JOIN "DataSource" s ON s.id=c."sourceId" AND s."tenantId"=c."tenantId" WHERE c."tenantId"=${k.tenantId} AND c.provider=${k.provider}`,
    )) as any[];
    return row ? { ...row, source: { timezone: row.timezone } } : null;
  };
  return {
    ...sql,
    connectorConnection: {
      findUnique,
      upsert: async ({ create, update }: any) => {
        const existing = await findUnique({
          where: {
            tenantId_provider: {
              tenantId: create.tenantId,
              provider: create.provider,
            },
          },
        });
        if (existing)
          await sql.$executeRaw(
            Prisma.sql`UPDATE "ConnectorConnection" SET "sourceId"=${update.sourceId},"accountHost"=${update.accountHost},"encryptedConfig"=${update.encryptedConfig},"hasReceiptsKey"=${update.hasReceiptsKey},"hasYmlUrl"=${update.hasYmlUrl},revision=revision+1,"lastCheck"=NULL,capabilities=NULL,"updatedAt"=now() WHERE id=${existing.id}`,
          );
        else
          await sql.$executeRaw(
            Prisma.sql`INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId",provider,"accountHost","encryptedConfig","hasReceiptsKey","hasYmlUrl","updatedAt") VALUES (${crypto.randomUUID()},${create.tenantId},${create.sourceId},${create.provider},${create.accountHost},${create.encryptedConfig},${create.hasReceiptsKey},${create.hasYmlUrl},now())`,
          );
        return findUnique({
          where: {
            tenantId_provider: {
              tenantId: create.tenantId,
              provider: create.provider,
            },
          },
        });
      },
      updateMany: async ({ where, data }: any) => ({
        count: await sql.$executeRaw(
          Prisma.sql`UPDATE "ConnectorConnection" SET "lastCheck"=${JSON.stringify(data.lastCheck)}::jsonb,capabilities=${JSON.stringify(data.capabilities)}::jsonb,"checkedAt"=${data.checkedAt} WHERE "tenantId"=${where.tenantId} AND provider=${where.provider} AND revision=${where.revision}`,
        ),
      }),
    },
    dataSource: {
      upsert: async ({ create }: any) => {
        await sql.$executeRaw(
          Prisma.sql`INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey",name,timezone,"updatedAt") VALUES (${crypto.randomUUID()},${create.tenantId},${create.kind}::"DataSourceKind",${create.sourceKey},${create.name},${create.timezone},now()) ON CONFLICT("tenantId",kind,"sourceKey") DO NOTHING`,
        );
        const [row] = (await sql.$queryRaw(
          Prisma.sql`SELECT id,timezone FROM "DataSource" WHERE "tenantId"=${create.tenantId} AND kind=${create.kind}::"DataSourceKind" AND "sourceKey"=${create.sourceKey}`,
        )) as any[];
        return row;
      },
    },
  };
}
const login = async (role = "ADMIN", tenantId = "a") => {
  state.cookie = await signAccessToken({ sub: "owner", tenantId, role });
};
const request = (method = "GET", body?: unknown) =>
  new NextRequest("https://app.test/api/connectors/keycrm", {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": "b",
      "x-user-role": "SUPER_ADMIN",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
beforeAll(async () => {
  vi.stubEnv("JWT_ACCESS_SECRET", "keycrm-fixture-auth");
  vi.stubEnv(
    "CONNECTOR_ENCRYPTION_KEY",
    Buffer.alloc(32, 9).toString("base64"),
  );
  f = await createScreenDb();
  state.models = {
    ...models(f.db),
    $transaction: (callback: any) =>
      f.db.$transaction((tx) => callback(models(tx))),
  };
  state.fetcher.mockImplementation(async (url: URL) => {
    const limit = Number(url.searchParams.get("limit") ?? 50),
      page = Number(url.searchParams.get("page") ?? 1);
    return Response.json(
      keyCrmPage(
        url.pathname === "/v1/order"
          ? [keyCrmOrder()]
          : url.pathname.endsWith("/status")
            ? [{ id: 5, name: "Sale" }]
            : url.pathname.endsWith("/source")
              ? [{ id: 1, name: "Shop" }]
              : url.pathname.endsWith("/stocks")
                ? [keyCrmStock]
                : url.pathname.endsWith("/offers")
                  ? [keyCrmOffer]
                  : [keyCrmProduct],
        page,
        limit,
      ),
    );
  });
}, 30000);
afterAll(async () => {
  await f?.pg.close();
  vi.unstubAllEnvs();
});
it("requires signed ADMIN for credential saves/checks and rejects identity overrides before storage or requests", async () => {
  expect((await PUT(request("PUT", keyCrmConfig), ctx)).status).toBe(401);
  await login("VIEWER");
  expect((await PUT(request("PUT", keyCrmConfig), ctx)).status).toBe(403);
  expect((await POST(request("POST"), ctx)).status).toBe(403);
  await login();
  expect(
    (await PUT(request("PUT", { ...keyCrmConfig, tenantId: "b" }), ctx)).status,
  ).toBe(400);
  expect(
    (
      await PUT(
        request("PUT", { ...keyCrmConfig, apiKey: "x".repeat(17000) }),
        ctx,
      )
    ).status,
  ).toBe(413);
  expect(state.fetcher).not.toHaveBeenCalled();
});
it("encrypts provider/tenant credentials, versions approved mappings with actor audit and does not switch source on save", async () => {
  const response = await PUT(request("PUT", keyCrmConfig), ctx);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).not.toContain(keyCrmConfig.apiKey);
  const saved = (
    await f.pg.query<{ encryptedConfig: string }>(
      `SELECT "encryptedConfig" FROM "ConnectorConnection" WHERE "tenantId"='a' AND provider='keycrm'`,
    )
  ).rows[0];
  expect(saved.encryptedConfig).toMatch(/^v1\./);
  expect(saved.encryptedConfig).not.toContain(keyCrmConfig.apiKey);
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
        `SELECT "sourceId" FROM "ConnectorSelection" WHERE "tenantId"='a'`,
      )
    ).rows,
  ).toEqual([]);
  await login("VIEWER");
  const visible = await GET(request(), ctx);
  expect(visible.status).toBe(200);
  expect(await visible.text()).not.toMatch(
    /encryptedConfig|synthetic-key|apiKey/,
  );
  await login("ADMIN", "b");
  expect(await (await GET(request(), ctx)).json()).toMatchObject({
    configured: false,
  });
  await login();
});
it("persists independent read checks while leaving receipts unsupported and rejects mapping revision/timezone drift", async () => {
  const response = await POST(request("POST"), ctx);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.lastCheck.checks).toEqual([
    { resource: "orders", code: "OK" },
    { resource: "statuses", code: "OK" },
    { resource: "channels", code: "OK" },
    { resource: "products", code: "OK" },
    { resource: "offers", code: "OK" },
    { resource: "stock", code: "OK" },
    { resource: "receipts", code: "NOT_CONFIGURED" },
  ]);
  expect(body.lastCheck.ok).toBe(true);
  expect(
    (
      await PUT(
        request("PUT", { ...keyCrmConfig, channels: { "1": "Changed" } }),
        ctx,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await PUT(
        request("PUT", {
          ...keyCrmConfig,
          timezone: "UTC",
          mappingRevision: 2,
        }),
        ctx,
      )
    ).status,
  ).toBe(409);
  const changed = await PUT(
    request("PUT", {
      ...keyCrmConfig,
      channels: { "1": "Changed" },
      mappingRevision: 2,
    }),
    ctx,
  );
  expect(changed.status).toBe(200);
  expect(await changed.json()).toMatchObject({ revision: 2, lastCheck: null });
});

it("versions and audits all non-secret date/stock/history evidence while key-only rotation leaves mapping approval unchanged", async () => {
  const current = {
    ...keyCrmConfig,
    channels: { "1": "Changed" },
    mappingRevision: 2,
  };
  const before = (
    await f.pg.query<{ encryptedConfig: string; revision: number }>(
      `SELECT "encryptedConfig",revision FROM "ConnectorConnection" WHERE "tenantId"='a' AND provider='keycrm'`,
    )
  ).rows[0];
  const changes = [
    { fullPaymentDate: false },
    { physicalStock: false },
    { warehouseIds: ["1"] },
    {
      history: {
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-30T23:59:59.999Z",
        reference: "approved history fixture",
      },
    },
    { reference: "new account approval" },
  ];
  for (const change of changes) {
    const response = await PUT(
      request("PUT", {
        ...current,
        apiKey: "must-not-be-persisted",
        evidence: { ...current.evidence, ...change },
      }),
      ctx,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("CONNECTOR_CONFIG_CHANGED");
  }
  expect(
    (
      await f.pg.query(
        `SELECT "encryptedConfig",revision FROM "ConnectorConnection" WHERE "tenantId"='a' AND provider='keycrm'`,
      )
    ).rows,
  ).toEqual([before]);
  const changed = {
    ...current,
    mappingRevision: 3,
    evidence: {
      ...current.evidence!,
      fullPaymentDate: false,
      physicalStock: false,
      warehouseIds: ["1"],
      history: {
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-30T23:59:59.999Z",
        reference: "approved history fixture",
      },
      reference: "new account approval",
    },
  };
  expect((await PUT(request("PUT", changed), ctx)).status).toBe(200);
  const mapping = (
    await f.pg.query<{
      revision: number;
      approvalReference: string;
      values: any;
    }>(
      `SELECT revision,"approvalReference",values FROM "MerchandisingConfig" WHERE "tenantId"='a' AND "configType"='SOURCE_MAPPING' AND key LIKE 'keycrm:%' AND "isActive"`,
    )
  ).rows[0];
  expect(mapping).toMatchObject({
    revision: 3,
    approvalReference: "new account approval",
    values: { evidence: changed.evidence },
  });
  const audit = (
    await f.pg.query<{ actorId: string; revision: number; values: any }>(
      `SELECT a."actorId",c.revision,c.values FROM "MerchandisingAction" a JOIN "MerchandisingConfig" c ON c.id=a."configId" AND c."tenantId"=a."tenantId" WHERE a.action='CONNECTOR_MAPPING_SAVED' AND a."tenantId"='a' ORDER BY c.revision`,
    )
  ).rows;
  expect(audit.map((a) => a.revision)).toEqual([1, 2, 3]);
  expect(audit[2].actorId).toBe("owner");
  expect(audit[2].values.evidence).toEqual(changed.evidence);
  expect(JSON.stringify(audit)).not.toContain(keyCrmConfig.apiKey);
  expect(
    (
      await PUT(
        request("PUT", { ...changed, apiKey: "rotated-synthetic-key" }),
        ctx,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "MerchandisingAction" WHERE "tenantId"='a' AND action='CONNECTOR_MAPPING_SAVED'`,
      )
    ).rows,
  ).toEqual([{ n: 3 }]);
});
