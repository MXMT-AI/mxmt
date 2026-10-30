import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createScreenDb, screenSelection } from "../helpers/screen-db";
import {
  keyCrmConfig,
  keyCrmOrder,
  keyCrmProduct,
  keyCrmOffer,
  keyCrmStock,
  keyCrmPage,
} from "../fixtures/keycrm-connector";
import { KeyCrmConnector } from "@/lib/connectors/keycrm/adapter";
import { keyCrmMapping } from "@/lib/connectors/keycrm/config";
import { encryptCredentials } from "@/lib/connectors/secrets";
import {
  loadConnectorRuntime,
  PROVIDER_ADAPTERS,
} from "@/lib/connectors/runtime";
import { selectConnectorSource } from "@/lib/connectors/source";
import {
  enqueueOrderImport,
  processOrderJob,
} from "@/lib/connectors/order-jobs";
import {
  enqueueInventoryImport,
  processInventoryJob,
} from "@/lib/connectors/inventory-jobs";
import { getSalesReport } from "@/lib/sales-report";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import {
  SCREEN_NAMES,
  parseScreenQuery,
} from "@/lib/merchandising-screen-query";
import { budgetedFetcher, accountBudgetKey } from "@/lib/connectors/budget";
let f: Awaited<ReturnType<typeof createScreenDb>>,
  order = keyCrmOrder();
const connector = new KeyCrmConnector(keyCrmConfig, async (url) => {
  const page = Number(url.searchParams.get("page") ?? 1),
    limit = Number(url.searchParams.get("limit") ?? 50);
  const data =
    url.pathname === "/v1/order"
      ? [order]
      : url.pathname.endsWith("/status")
        ? [{ id: 5, name: "Sale" }]
        : url.pathname.endsWith("/source")
          ? [{ id: 1, name: "Shop" }]
          : url.pathname.endsWith("/stocks")
            ? [keyCrmStock]
            : url.pathname.endsWith("/offers")
              ? [keyCrmOffer]
              : [keyCrmProduct];
  return Response.json(keyCrmPage(data, page, limit));
});
const runtime = async () => ({
  sourceId: "keycrm",
  revision: 1,
  timezone: "Europe/Kyiv",
  connector,
});
beforeAll(async () => {
  vi.stubEnv(
    "CONNECTOR_ENCRYPTION_KEY",
    Buffer.alloc(32, 4).toString("base64"),
  );
  f = await createScreenDb();
  await f.pg.exec(
    `INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey",timezone,"updatedAt") VALUES ('keycrm','a','KEYCRM','fixture-account','Europe/Kyiv',now());`,
  );
  await f.pg.query(
    `INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId",provider,"accountHost","encryptedConfig","lastCheck",capabilities,"updatedAt") VALUES ('keycrm','a','keycrm','keycrm','fixture-account',$1,'{"ok":true}',$2,now())`,
    [
      encryptCredentials(keyCrmConfig, "a", "keycrm"),
      JSON.stringify(connector.capabilities),
    ],
  );
  await f.pg.query(
    `INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedById","approvedAt","approvalReference") VALUES ('keycrm-mapping','a','SOURCE_MAPPING','keycrm:keycrm',1,$1,true,'owner',now(),'synthetic fixture')`,
    [JSON.stringify(keyCrmMapping(keyCrmConfig).values)],
  );
  await selectConnectorSource("a", "owner", "keycrm", 0, f.db);
}, 30000);
afterAll(async () => {
  await f?.pg.close();
  vi.unstubAllEnvs();
});
it("dispatches registered KeyCRM runtimes and rejects foreign tenant/provider credentials", async () => {
  expect(
    (await loadConnectorRuntime("a", false, f.db)).connector.provider,
  ).toBe("keycrm");
  await expect(
    loadConnectorRuntime("b", false, f.db, undefined, "keycrm"),
  ).rejects.toThrow("NOT_CONFIGURED");
  await f.pg.query(
    `UPDATE "ConnectorConnection" SET "encryptedConfig"=$1 WHERE id='keycrm'`,
    [encryptCredentials(keyCrmConfig, "a", "salesdrive")],
  );
  await expect(loadConnectorRuntime("a", false, f.db)).rejects.toThrow(
    "CONNECTOR_STORAGE_UNAVAILABLE",
  );
  await f.pg.query(
    `UPDATE "ConnectorConnection" SET "encryptedConfig"=$1 WHERE id='keycrm'`,
    [encryptCredentials(keyCrmConfig, "a", "keycrm")],
  );
});
it("imports through durable workers, resolves offer identities, preserves unknown history/receipts and uses unchanged metrics/screens", async () => {
  await enqueueOrderImport("a", "BACKFILL", {}, f.db);
  for (let i = 0; i < 3; i++) await processOrderJob("a", f.db, runtime);
  await enqueueInventoryImport("a", f.db);
  await processInventoryJob("a", f.db, runtime);
  expect(
    (
      await f.pg.query(
        `SELECT resource,state FROM "ConnectorSyncJob" WHERE "sourceId"='keycrm' ORDER BY resource`,
      )
    ).rows,
  ).toEqual([
    { resource: "inventory", state: "COMPLETE" },
    { resource: "orders", state: "COMPLETE" },
  ]);
  await f.pg.exec(
    `UPDATE "Sku" SET "productKind"='MERCHANDISE',"ownershipOverride"='OWN' WHERE "tenantId"='a' AND sku='001-A'`,
  );
  const report = await getSalesReport("a", screenSelection, f.db);
  expect(report.summary[0].current.revenue).toBe("40.25");
  expect(report.history).toEqual({ current: false, ly: false });
  expect(
    (
      await f.pg.query(
        `SELECT resource FROM "SyncCursor" WHERE "sourceId"='keycrm' ORDER BY resource`,
      )
    ).rows,
  ).toEqual([{ resource: "orders" }]);
  const snapshot = await createScreenSnapshot("a", screenSelection, f.db);
  for (const screen of SCREEN_NAMES) {
    const result = await getMerchandisingScreen(
      "a",
      screen,
      parseScreenQuery(
        new URLSearchParams({ snapshotId: snapshot.snapshotId }),
        screen,
      ),
      f.db,
      screenSelection.now,
    );
    expect(result.screen).toBe(screen);
    expect(result.context.sourceId).toBe("keycrm");
  }
});
it("replays reordered/deleted native lines idempotently, rejects stale versions and preserves current facts", async () => {
  const run = async () => {
    await enqueueOrderImport("a", "INCREMENTAL", {}, f.db);
    for (let i = 0; i < 3; i++) await processOrderJob("a", f.db, runtime);
  };
  await run();
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "OrderLine" WHERE "sourceId"='keycrm'`,
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
  order = {
    ...keyCrmOrder(),
    updated_at: "2026-10-26 08:00:00",
    products: [
      { ...keyCrmOrder().products[0], id: 102 },
      { ...keyCrmOrder().products[0], id: 101 },
    ],
  };
  await run();
  order = { ...order, products: [...order.products].reverse() };
  await run();
  expect(
    (
      await f.pg.query(
        `SELECT code FROM "ImportIssue" WHERE "tenantId"='a' AND code='ORDER_VERSION_CONFLICT'`,
      )
    ).rows,
  ).toEqual([]);
  order = {
    ...order,
    updated_at: "2026-10-27 08:00:00",
    products: [order.products.find((p) => p.id === 101)!],
  };
  await run();
  expect(
    (
      await f.pg.query(
        `SELECT "externalLineId" FROM "OrderLine" WHERE "sourceId"='keycrm'`,
      )
    ).rows,
  ).toEqual([{ externalLineId: "native:101" }]);
  order = { ...order, updated_at: "2026-10-24 08:00:00", products: [] };
  await run();
  expect(
    (
      await f.pg.query(
        `SELECT "externalLineId" FROM "OrderLine" WHERE "sourceId"='keycrm'`,
      )
    ).rows,
  ).toEqual([{ externalLineId: "native:101" }]);
});
it("shares the conservative quota by key fingerprint across account labels/tenants and honors persistent 429 feedback", async () => {
  const registration = PROVIDER_ADAPTERS.keycrm!;
  const identity = registration.budgetIdentity!(keyCrmConfig);
  expect(identity).not.toContain(keyCrmConfig.apiKey);
  expect(
    registration.budgetIdentity!({ ...keyCrmConfig, accountId: "other-label" }),
  ).toBe(identity);
  expect(
    registration.budgetIdentity!({ ...keyCrmConfig, apiKey: "another-secret" }),
  ).not.toBe(identity);
  const request = vi.fn(
    async () =>
      new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "120" },
      }),
  );
  const fetcher = budgetedFetcher(
    "keycrm:" + identity,
    f.db,
    request,
    false,
    registration.requestWindows,
  );
  const connector = new KeyCrmConnector(keyCrmConfig, fetcher);
  await expect(connector.getOrders()).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
  await expect(connector.getOrders()).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
  expect(request).toHaveBeenCalledTimes(1);
  const rows = (
    await f.pg.query<{ blockedUntil: Date }>(
      `SELECT "blockedUntil" FROM "ConnectorRequestBudget" WHERE "accountKey"=$1`,
      [accountBudgetKey("keycrm:" + identity)],
    )
  ).rows;
  expect(rows[0].blockedUntil.getTime()).toBeGreaterThan(Date.now() + 110000);
});

it("allows at most twenty requests per key/minute and leaves the existing backfill headroom", async () => {
  const registration = PROVIDER_ADAPTERS.keycrm!,
    request = vi.fn(async () => Response.json(keyCrmPage([])));
  const fetcher = budgetedFetcher(
    "keycrm:conservative-fixture",
    f.db,
    request,
    false,
    registration.requestWindows,
  );
  for (let i = 0; i < 20; i++)
    await fetcher(new URL("https://openapi.keycrm.app/v1/order"), {});
  await expect(
    fetcher(new URL("https://openapi.keycrm.app/v1/order"), {}),
  ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect(request).toHaveBeenCalledTimes(20);
});
