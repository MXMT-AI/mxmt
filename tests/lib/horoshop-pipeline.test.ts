import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createScreenDb, screenSelection } from "../helpers/screen-db";
import {
  horoshopConfig as config,
  horoshopOrder,
  horoshopProduct,
  horoshopFetcher,
} from "../fixtures/horoshop-connector";
import { HoroshopConnector } from "@/lib/connectors/horoshop/adapter";
import { horoshopMapping } from "@/lib/connectors/horoshop/config";
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
import { storeOrder } from "@/lib/connectors/order-storage";
import { getSalesReport } from "@/lib/sales-report";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import {
  SCREEN_NAMES,
  parseScreenQuery,
} from "@/lib/merchandising-screen-query";
import {
  createRepricingInputs,
  getRepricingPreview,
} from "@/lib/repricing-store";
import { getReorderingPreview } from "@/lib/reordering-store";
import { createScenarioExport } from "@/lib/scenario-export-store";
import { budgetedFetcher } from "@/lib/connectors/budget";
let f: Awaited<ReturnType<typeof createScreenDb>>,
  order = horoshopOrder(),
  clock = Date.now();
const connector = new HoroshopConnector(
  config,
  (u, i) => horoshopFetcher([order])(u, i),
  () => ++clock,
);
const runtime = async () => ({
  sourceId: "horoshop",
  revision: 1,
  timezone: config.timezone,
  connector,
});
const run = async () => {
  await enqueueOrderImport("a", "INCREMENTAL", {}, f.db);
  for (let i = 0; i < 3; i++) await processOrderJob("a", f.db, runtime);
};
beforeAll(async () => {
  vi.stubEnv(
    "CONNECTOR_ENCRYPTION_KEY",
    Buffer.alloc(32, 4).toString("base64"),
  );
  f = await createScreenDb();
  await f.pg.exec(
    `INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey",timezone,"updatedAt") VALUES ('horoshop','a','HOROSHOP','https://fixture-shop.example.com','Europe/Kyiv',now());`,
  );
  await f.pg.query(
    `INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId",provider,"accountHost","encryptedConfig","lastCheck",capabilities,"updatedAt") VALUES ('horoshop','a','horoshop','horoshop',$1,$2,'{"ok":true}',$3,now())`,
    [
      config.origin,
      encryptCredentials(config, "a", "horoshop"),
      JSON.stringify(connector.capabilities),
    ],
  );
  await f.pg.query(
    `INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedById","approvedAt","approvalReference") VALUES ('horoshop-mapping','a','SOURCE_MAPPING','horoshop:horoshop',1,$1,true,'owner',now(),'synthetic fixture')`,
    [JSON.stringify(horoshopMapping(config).values)],
  );
  await selectConnectorSource("a", "owner", "horoshop", 0, f.db);
}, 30000);
afterAll(async () => {
  await f?.pg.close();
  vi.unstubAllEnvs();
});
it("loads only tenant/provider-bound runtime credentials and configured account budgets", async () => {
  expect(
    (await loadConnectorRuntime("a", false, f.db)).connector.provider,
  ).toBe("horoshop");
  await expect(
    loadConnectorRuntime("b", false, f.db, undefined, "horoshop"),
  ).rejects.toThrow("NOT_CONFIGURED");
  const r = PROVIDER_ADAPTERS.horoshop!;
  expect(r.accountRequestWindows!(config)).toEqual([
    { limit: 100, milliseconds: 60000 },
  ]);
  expect(r.budgetIdentity!(config)).toBe(
    r.budgetIdentity!({ ...config, password: "rotated-password" }),
  );
});
it("durably stages a complete catalog, then reads every old order into unchanged screens with unknown payment/history/cost preserved", async () => {
  await run();
  await enqueueInventoryImport("a", f.db);
  await processInventoryJob("a", f.db, runtime);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "InventorySnapshot" WHERE "sourceId"='horoshop'`,
      )
    ).rows,
  ).toEqual([{ n: 0 }]); // Terminal probe has not run: no partial activation.
  await processInventoryJob("a", f.db, runtime);
  expect(
    (
      await f.pg.query(
        `SELECT resource,state FROM "ConnectorSyncJob" WHERE "sourceId"='horoshop' ORDER BY resource`,
      )
    ).rows,
  ).toEqual([
    { resource: "inventory", state: "COMPLETE" },
    { resource: "orders", state: "COMPLETE" },
  ]);
  const line = (
    await f.pg.query<any>(
      `SELECT "externalOrderId","sourceSku","paidAt","netAmount","signedRevenue","costAmount","sourceUpdatedAt" FROM "OrderLine" WHERE "sourceId"='horoshop'`,
    )
  ).rows[0];
  expect(line).toMatchObject({
    externalOrderId: "1",
    sourceSku: "001-A",
    paidAt: null,
    signedRevenue: null,
    costAmount: null,
    sourceUpdatedAt: null,
  });
  expect(String(line.netAmount)).toBe("40.2500");
  expect(
    (
      await f.pg.query(
        `SELECT resource FROM "SyncCursor" WHERE "sourceId"='horoshop' ORDER BY resource`,
      )
    ).rows,
  ).toEqual([{ resource: "orders" }]);
  const report = await getSalesReport("a", screenSelection, f.db);
  expect(report.history).toEqual({ current: false, ly: false });
  const snapshot = await createScreenSnapshot("a", screenSelection, f.db);
  for (const screen of SCREEN_NAMES) {
    const r = await getMerchandisingScreen(
      "a",
      screen,
      parseScreenQuery(
        new URLSearchParams({ snapshotId: snapshot.snapshotId }),
        screen,
      ),
      f.db,
      screenSelection.now,
    );
    expect(r.screen).toBe(screen);
    expect(r.context.sourceId).toBe("horoshop");
  }
});
it("passes imported facts through existing scenario calculations and blocks exports when financial evidence is missing", async () => {
  const { snapshotId } = await createScreenSnapshot("a", screenSelection, f.db);
  const { inputSetId } = await createRepricingInputs(
    "a",
    snapshotId,
    f.db,
    screenSelection.now,
  );
  const reprice = await getRepricingPreview("a", { inputSetId }, f.db);
  const reorder = await getReorderingPreview("a", { snapshotId }, f.db);
  expect(reprice.canExport).toBe(false);
  expect(reorder.canExport).toBe(false);
  await expect(
    createScenarioExport(
      "a",
      "owner",
      {
        exportId: "99999999-9999-4999-8999-999999999999",
        kind: "reprice",
        previewId: reprice.previewId,
        scenario: { inputSetId },
      },
      f.db,
      screenSelection.now,
    ),
  ).rejects.toMatchObject({ code: "EXPORT_NOT_READY" });
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "MerchandisingAction" WHERE "entityType"='SCENARIO_EXPORT' AND "tenantId"='a'`,
      )
    ).rows,
  ).toEqual([{ n: 0 }]);
});

it("imports modifications of a 2020 order on later full rescans, removes deleted lines and rejects older observations without fabricating source versions", async () => {
  const before = (await connector.getOrders()).records[0];
  order = {
    ...order,
    stat_status: 4,
    products: [{ ...order.products[0], storage_id: 102 }],
  };
  await run();
  expect(
    (
      await f.pg.query(
        `SELECT "externalLineId",kind FROM "OrderLine" WHERE "sourceId"='horoshop'`,
      )
    ).rows,
  ).toEqual([{ externalLineId: "native:102", kind: "UNKNOWN" }]);
  const [job] = (
    await f.pg.query<{ importRunId: string }>(
      `SELECT "importRunId" FROM "ConnectorSyncJob" WHERE "sourceId"='horoshop' AND resource='orders' ORDER BY "createdAt" DESC LIMIT 1`,
    )
  ).rows;
  const stale = await f.db.$transaction((tx) =>
    storeOrder(
      tx,
      {
        tenantId: "a",
        sourceId: "horoshop",
        importRunId: job.importRunId,
        timezone: config.timezone,
        observationRevisions: true,
      },
      before,
      horoshopMapping(config).values,
    ),
  );
  expect(stale.outcome).toBe("stale");
  await run();
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "OrderLine" WHERE "sourceId"='horoshop'`,
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
  expect(
    (
      await f.pg.query(
        `SELECT "sourceVersion","sourceUpdatedAt" FROM "OrderImportState" WHERE "sourceId"='horoshop'`,
      )
    ).rows,
  ).toEqual([{ sourceVersion: null, sourceUpdatedAt: null }]);
});
it("persists provider 429 backoff and shares the account budget across credential rotations", async () => {
  const fetcher = vi.fn(
      async () =>
        new Response("secret error", {
          status: 429,
          headers: { "Retry-After": "120" },
        }),
    ),
    request = budgetedFetcher(
      "horoshop:" + config.origin,
      f.db,
      fetcher,
      false,
      [{ milliseconds: 60000, limit: 100 }],
    );
  await expect(
    request(new URL(config.origin + "/api/auth/"), {}),
  ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  await expect(
    request(new URL(config.origin + "/api/auth/"), {}),
  ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("quarantines invalid orders with durable per-order diagnostics and advances to later offsets without deleting previous facts", async () => {
  const invalidCurrency = { ...horoshopOrder(1), currency: "USD" },
    invalidDate = { ...horoshopOrder(2), stat_created: "bad date" },
    invalidLine = {
      ...horoshopOrder(3),
      products: [{ ...horoshopOrder().products[0], quantity: "bad" }],
    };
  const c = new HoroshopConnector(
    config,
    horoshopFetcher([
      invalidCurrency,
      invalidDate,
      invalidLine,
      horoshopOrder(4),
    ]),
    () => ++clock,
  );
  c.capabilities.pageSize = { orders: 1, catalog: 100 };
  const rt = async () => ({ ...(await runtime()), connector: c });
  await enqueueOrderImport("a", "INCREMENTAL", {}, f.db);
  for (let i = 0; i < 7; i++) await processOrderJob("a", f.db, rt);
  const job = (
    await f.pg.query<any>(
      `SELECT state,stats,"importRunId",checkpoint FROM "ConnectorSyncJob" WHERE "sourceId"='horoshop' AND resource='orders' ORDER BY "createdAt" DESC LIMIT 1`,
    )
  ).rows[0];
  expect(job.state).toBe("COMPLETE");
  expect(job.stats).toMatchObject({ orders: 4, quarantined: 3, imported: 1 });
  expect(job.checkpoint.continuation.position).toEqual({
    kind: "offset",
    offset: 4,
  });
  const issues = (
    await f.pg.query<any>(
      `SELECT code,"entityKey",context FROM "ImportIssue" WHERE "importRunId"=$1 AND "entityKey" IS NOT NULL AND code IN ('ORDER_CURRENCY_MISMATCH','ORDER_RECORD_INVALID') ORDER BY code,"entityKey"`,
      [job.importRunId],
    )
  ).rows;
  expect(issues.map((i) => i.code).sort()).toEqual([
    "ORDER_CURRENCY_MISMATCH",
    "ORDER_RECORD_INVALID",
    "ORDER_RECORD_INVALID",
  ]);
  for (const issue of issues) {
    expect(issue.entityKey).toMatch(/^order:[a-f0-9]{64}$/);
    expect(issue.context.sourceId).toBe("horoshop");
    expect(issue.context.sourceRecordKey).toBeTruthy();
  }
  expect(
    (
      await f.pg.query(
        `SELECT "externalOrderId","externalLineId" FROM "OrderLine" WHERE "sourceId"='horoshop' ORDER BY "externalOrderId"`,
      )
    ).rows,
  ).toEqual([
    { externalOrderId: "1", externalLineId: "native:102" },
    { externalOrderId: "4", externalLineId: "native:101" },
  ]);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "OrderImportState" WHERE "sourceId"='horoshop' AND "externalOrderId" IN ('2','3')`,
      )
    ).rows,
  ).toEqual([{ n: 0 }]);
  const retained = (
    await f.pg.query<any>(
      `SELECT payload FROM "DataSourceRecord" WHERE "importRunId"=$1 AND resource='orders'`,
      [job.importRunId],
    )
  ).rows;
  expect(retained).toHaveLength(4);
});
