import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createScreenDb, screenSelection } from "../helpers/screen-db";
import {
  shopifyConfig as config,
  shopifyFetcher,
  order,
  line,
  refundTransaction,
  money,
  id,
  connection,
} from "../fixtures/shopify-connector";
import { ShopifyConnector } from "@/lib/connectors/shopify/adapter";
import { shopifyJournal } from "@/lib/connectors/shopify/journal";
import { shopifyMapping } from "@/lib/connectors/shopify/config";
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
import {
  createRepricingInputs,
  getRepricingPreview,
} from "@/lib/repricing-store";
import { getReorderingPreview } from "@/lib/reordering-store";
import { createScenarioExport } from "@/lib/scenario-export-store";
import { graphqlBudgetedFetcher } from "@/lib/connectors/query-cost";
import { accountBudgetKey } from "@/lib/connectors/budget";
let f: Awaited<ReturnType<typeof createScreenDb>>,
  version = order().updatedAt;
const selection = {
  ...screenSelection,
  dateTo: "2026-10-27",
  asOf: "2026-10-27",
  now: new Date("2026-10-27T16:00:00Z"),
};
const calls = vi.fn(
  shopifyFetcher({
    Orders: () => ({
      orders: connection([{ ...order(), updatedAt: version }]),
    }),
    OrderLines: (v) => ({
      order: { id: v.id, updatedAt: version, lineItems: connection([line()]) },
    }),
    OrderFence: (v) => ({ order: { id: v.id, updatedAt: version } }),
  }),
);
const runtime = async (
  _t: string,
  _b?: boolean,
  _source?: string,
  runId?: string,
) => ({
  sourceId: "shopify",
  revision: 1,
  timezone: config.timezone,
  connector: new ShopifyConnector(
    config,
    calls,
    shopifyJournal({
      tenantId: "a",
      sourceId: "shopify",
      revision: 1,
      importRunId: runId!,
      db: f.db,
    }),
  ),
});
const run = async () => {
  await enqueueOrderImport("a", "INCREMENTAL", {}, f.db);
  for (let i = 0; i < 6; i++) await processOrderJob("a", f.db, runtime);
};
beforeAll(async () => {
  vi.stubEnv(
    "CONNECTOR_ENCRYPTION_KEY",
    Buffer.alloc(32, 4).toString("base64"),
  );
  f = await createScreenDb();
  await f.pg.exec(
    `INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey",timezone,"updatedAt") VALUES ('shopify','a','SHOPIFY','fixture-store.myshopify.com','Europe/Kyiv',now());UPDATE "MerchandisingConfig" SET values=jsonb_set(values,'{saleStatusesVerified}','false') WHERE "tenantId"='a' AND key='settings:client' AND "isActive";`,
  );
  const c = new ShopifyConnector(config, calls);
  await f.pg.query(
    `INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId",provider,"accountHost","encryptedConfig","lastCheck",capabilities,"updatedAt") VALUES ('shopify','a','shopify','shopify',$1,$2,'{"ok":true}',$3,now())`,
    [
      config.shop,
      encryptCredentials(config, "a", "shopify"),
      JSON.stringify(c.capabilities),
    ],
  );
  await f.pg.query(
    `INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedById","approvedAt","approvalReference") VALUES ('shopify-mapping','a','SOURCE_MAPPING','shopify:shopify',1,$1,true,'owner',now(),'synthetic fixture')`,
    [JSON.stringify(shopifyMapping(config).values)],
  );
  await selectConnectorSource("a", "owner", "shopify", 0, f.db);
}, 30000);
afterAll(async () => {
  await f?.pg.close();
  vi.unstubAllEnvs();
});
it("registers tenant/provider bound runtime credentials and app/shop budgets", async () => {
  expect(
    (await loadConnectorRuntime("a", false, f.db)).connector.provider,
  ).toBe("shopify");
  await expect(
    loadConnectorRuntime("b", false, f.db, undefined, "shopify"),
  ).rejects.toThrow("NOT_CONFIGURED");
  const r = PROVIDER_ADAPTERS.shopify!;
  expect(r.budgetIdentity!(config)).toBe(
    r.budgetIdentity!({ ...config, accessToken: "rotated-token" }),
  );
  expect(r.budgetIdentity!(config)).not.toBe(
    r.budgetIdentity!({ ...config, appId: id("App", 2) }),
  );
  expect(r.budgetIdentity!(config)).not.toBe(
    r.budgetIdentity!({ ...config, shop: "other.myshopify.com" }),
  );
});
it("persists nested checkpoints in the existing import, never publishes partial orders and resumes after runtime reconstruction", async () => {
  await enqueueOrderImport("a", "BACKFILL", {}, f.db);
  for (let i = 0; i < 3; i++) await processOrderJob("a", f.db, runtime);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "OrderLine" WHERE "sourceId"='shopify'`,
      )
    ).rows,
  ).toEqual([{ n: 0 }]);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "DataSourceRecord" WHERE "sourceId"='shopify' AND resource='shopify-query'`,
      )
    ).rows,
  ).toEqual([{ n: 3 }]);
  for (let i = 0; i < 3; i++) await processOrderJob("a", f.db, runtime);
  expect(
    (
      await f.pg.query(
        `SELECT "externalOrderId",kind,"signedRevenue","costAmount" FROM "OrderLine" WHERE "sourceId"='shopify' ORDER BY "externalOrderId"`,
      )
    ).rows,
  ).toEqual([
    {
      externalOrderId: id("Order"),
      kind: "SALE",
      signedRevenue: "40.0000",
      costAmount: null,
    },
    {
      externalOrderId: id("Refund"),
      kind: "RETURN",
      signedRevenue: "-20.0000",
      costAmount: null,
    },
  ]);
});
it("activates current physical stock, resolves variant aliases, and feeds unchanged five-screen/scenario calculations", async () => {
  await enqueueInventoryImport("a", f.db);
  for (let i = 0; i < 3; i++) await processInventoryJob("a", f.db, runtime);
  await f.pg.exec(
    `UPDATE "Sku" SET "productKind"='MERCHANDISE',"ownershipOverride"='OWN' WHERE "tenantId"='a' AND sku='001-A'`,
  );
  const report = await getSalesReport("a", selection, f.db);
  expect(report.summary[0].current.revenue).toBe("20");
  expect(report.history).toEqual({ current: false, ly: false });
  expect(
    (
      await f.pg.query(
        `SELECT "costPrice",quantity FROM "InventorySnapshot" WHERE "sourceId"='shopify'`,
      )
    ).rows,
  ).toEqual([{ costPrice: null, quantity: "12.0000" }]);
  const snapshot = await createScreenSnapshot("a", selection, f.db);
  for (const screen of SCREEN_NAMES) {
    const r = await getMerchandisingScreen(
      "a",
      screen,
      parseScreenQuery(
        new URLSearchParams({ snapshotId: snapshot.snapshotId }),
        screen,
      ),
      f.db,
      selection.now,
    );
    expect(r.context.sourceId).toBe("shopify");
    expect(r.screen).toBe(screen);
  }
  const { inputSetId } = await createRepricingInputs(
      "a",
      snapshot.snapshotId,
      f.db,
      selection.now,
    ),
    reprice = await getRepricingPreview("a", { inputSetId }, f.db),
    reorder = await getReorderingPreview(
      "a",
      { snapshotId: snapshot.snapshotId },
      f.db,
    );
  expect(reprice.canExport).toBe(false);
  expect(reorder.canExport).toBe(false);
  await expect(
    createScenarioExport(
      "a",
      "owner",
      {
        exportId: "99999999-9999-4999-8999-999999999998",
        kind: "reprice",
        previewId: reprice.previewId,
        scenario: { inputSetId },
      },
      f.db,
      selection.now,
    ),
  ).rejects.toMatchObject({ code: "EXPORT_NOT_READY" });
});
it("replays sale/refund events without duplicating them, accepts newer edits and retains stale source versions", async () => {
  await run();
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "OrderLine" WHERE "sourceId"='shopify'`,
      )
    ).rows,
  ).toEqual([{ n: 2 }]);
  version = "2026-10-27T09:00:00Z";
  await run();
  version = "2026-10-26T09:00:00Z";
  await run();
  expect(
    (
      await f.pg.query(
        `SELECT "sourceUpdatedAt" FROM "OrderImportState" WHERE "sourceId"='shopify' AND "externalOrderId"=$1`,
        [id("Order")],
      )
    ).rows[0],
  ).toMatchObject({ sourceUpdatedAt: new Date("2026-10-27T09:00:00Z") });
});
it("keeps journal pages tenant/source/revision/run scoped and rejects credential rotation during staging", async () => {
  const row = (
      await f.pg.query<{ importRunId: string }>(
        `SELECT "importRunId" FROM "ConnectorSyncJob" WHERE "sourceId"='shopify' ORDER BY "createdAt" DESC LIMIT 1`,
      )
    ).rows[0],
    scope = {
      tenantId: "a",
      sourceId: "shopify",
      revision: 1,
      importRunId: row.importRunId,
      db: f.db,
    };
  const a = shopifyJournal(scope);
  await a.put("test-page", { data: { secret: "synthetic fact" } });
  expect(await a.get("test-page")).not.toBeNull();
  expect(
    await shopifyJournal({ ...scope, tenantId: "b" }).get("test-page"),
  ).toBeNull();
  expect(
    await shopifyJournal({ ...scope, revision: 2 }).get("test-page"),
  ).toBeNull();
  await expect(
    shopifyJournal({ ...scope, revision: 2 }).put("foreign", {}),
  ).rejects.toThrow("CONNECTOR_CONFIG_CHANGED");
});
it("reconciles unused query cost without stranding onboarding and persists HTTP-200 throttled Retry-After", async () => {
  const p = PROVIDER_ADAPTERS.shopify!.queryCost!,
    fetch = graphqlBudgetedFetcher(
      "shopify:fixture-cost",
      f.db,
      shopifyFetcher(),
      p,
    );
  for (let i = 0; i < 7; i++)
    await fetch(new URL("https://fixture-store.myshopify.com/graphql"), {
      body: JSON.stringify({ query: "query Identity {}", variables: {} }),
    });
  const blocked = graphqlBudgetedFetcher(
    "shopify:fixture-throttle",
    f.db,
    async () =>
      Response.json(
        { errors: [{ extensions: { code: "THROTTLED" } }] },
        { headers: { "Retry-After": "120" } },
      ),
    p,
  );
  await expect(
    blocked(new URL("https://fixture-store.myshopify.com/graphql"), {}),
  ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect(
    (
      await f.pg.query<any>(
        `SELECT "blockedUntil" FROM "ConnectorRequestBudget" WHERE "accountKey"=$1`,
        [accountBudgetKey("shopify:fixture-throttle")],
      )
    ).rows[0].blockedUntil.getTime(),
  ).toBeGreaterThan(Date.now() + 110000);
});
