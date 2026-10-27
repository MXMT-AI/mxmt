import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createScreenDb } from "../helpers/screen-db";
import {
  fixtureConnector,
  fixtureOrder,
  fixtureCatalogRow,
  observedAt,
  capabilities,
} from "../fixtures/foundation-connector";
import { selectConnectorSource } from "@/lib/connectors/source";
import {
  enqueueOrderImport,
  processOrderJob,
  getOrderImportProgress,
} from "@/lib/connectors/order-jobs";
import {
  enqueueInventoryImport,
  processInventoryJob,
} from "@/lib/connectors/inventory-jobs";
import {
  loadConnectorRuntime,
  type ProviderRegistration,
} from "@/lib/connectors/runtime";
import { encryptCredentials } from "@/lib/connectors/secrets";
let f: Awaited<ReturnType<typeof createScreenDb>>;
beforeAll(async () => {
  vi.stubEnv(
    "CONNECTOR_ENCRYPTION_KEY",
    Buffer.alloc(32, 9).toString("base64"),
  );
  f = await createScreenDb();
  await f.pg
    .exec(`INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('csv','a','CSV','upload',now());
    INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId",provider,"accountHost","encryptedConfig","lastCheck",capabilities,"updatedAt") VALUES ('csv','a','csv','csv','upload','synthetic','{"ok":true}', '${JSON.stringify(capabilities)}',now());`);
  await selectConnectorSource("a", "owner", "csv", 0, f.db);
}, 30000);
afterAll(async () => {
  await f?.pg.close();
  vi.unstubAllEnvs();
});
it("drains opaque order cursors without false completion or invented historical coverage", async () => {
  const seen: Array<string | null | undefined> = [];
  const connector = fixtureConnector({
    capabilities: {
      ...capabilities,
      pagination: { orders: "cursor" },
      pageSize: { orders: 2 },
    },
    getOrders: async (r) => {
      seen.push(r?.cursor);
      return {
        observedAt,
        records: [fixtureOrder(r?.cursor ? "2" : "1")],
        nextPage: null,
        next: r?.cursor ? null : { kind: "cursor", cursor: "next/opaque==" },
      };
    },
  });
  const job = await enqueueOrderImport("a", "BACKFILL", {}, f.db);
  const load = async () => ({
    sourceId: "csv",
    revision: 1,
    timezone: "Europe/Kyiv",
    connector,
  });
  for (let i = 0; i < 3; i++) await processOrderJob("a", f.db, load);
  expect((await getOrderImportProgress("a", f.db))?.state).toBe("PENDING");
  expect(
    (
      await f.pg.query(
        `SELECT checkpoint FROM "SyncCursor" WHERE "sourceId"='csv'`,
      )
    ).rows,
  ).toEqual([]);
  await processOrderJob("a", f.db, load);
  expect(seen).toEqual([null, "next/opaque=="]);
  expect((await getOrderImportProgress("a", f.db))?.state).toBe("COMPLETE");
  const record = (
    await f.pg.query<{ checkpoint: { historyComplete: boolean } }>(
      `SELECT checkpoint FROM "ConnectorSyncJob" WHERE id=$1`,
      [job.id],
    )
  ).rows[0];
  expect(record.checkpoint.historyComplete).toBe(false);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "OrderLine" WHERE "sourceId"='csv'`,
      )
    ).rows,
  ).toEqual([{ n: 2 }]);
});
it("keeps staged catalog pages inactive until a complete stable observation validates atomically", async () => {
  let malformed = true;
  const connector = fixtureConnector({
    capabilities: { ...capabilities, pagination: { catalog: "offset" } },
    getCatalogPage: async (r) => ({
      observedAt: r?.offset ? "2026-10-27T09:00:00.000Z" : observedAt,
      observationId: "observation-1",
      completePopulation: true,
      nextPage: null,
      records: [
        (() => {
          const row = fixtureCatalogRow(
            r?.offset ? (malformed ? "NEW-A" : "NEW-B") : "NEW-A",
          );
          if (r?.offset) {
            row.product.observedAt = "2026-10-27T09:00:00.000Z";
            row.stock.observedAt = "2026-10-27T09:00:00.000Z";
          }
          return row;
        })(),
      ],
      next: r?.offset ? null : { kind: "offset", offset: 1 },
    }),
  });
  const id = await enqueueInventoryImport("a", f.db);
  const load = async () => ({
    sourceId: "csv",
    revision: 1,
    timezone: "Europe/Kyiv",
    connector,
  });
  await processInventoryJob("a", f.db, load);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "Sku" WHERE sku LIKE 'NEW-%'`,
      )
    ).rows,
  ).toEqual([{ n: 0 }]);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "ConnectorCatalogPage" WHERE "jobId"=$1`,
        [id],
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
  await processInventoryJob("a", f.db, load); // duplicate product ID rejects the whole observation
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "Sku" WHERE sku LIKE 'NEW-%'`,
      )
    ).rows,
  ).toEqual([{ n: 0 }]);
  expect(
    (
      await f.pg.query(
        `SELECT "activeImportRunId" FROM "DataSource" WHERE id='csv'`,
      )
    ).rows,
  ).toEqual([{ activeImportRunId: null }]);
  malformed = false;
  await f.pg.query(
    `UPDATE "ConnectorSyncJob" SET "availableAt"=now() WHERE id=$1`,
    [id],
  );
  await processInventoryJob("a", f.db, load);
  expect(
    (await f.pg.query(`SELECT state FROM "ConnectorSyncJob" WHERE id=$1`, [id]))
      .rows,
  ).toEqual([{ state: "COMPLETE" }]);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "Sku" WHERE sku LIKE 'NEW-%'`,
      )
    ).rows,
  ).toEqual([{ n: 2 }]);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "ConnectorCatalogPage" WHERE "jobId"=$1`,
        [id],
      )
    ).rows,
  ).toEqual([{ n: 0 }]);
  expect(
    (
      await f.pg.query(
        `SELECT s.sku,i."observedAt" FROM "InventorySnapshot" i JOIN "Sku" s ON s.id=i."skuId" WHERE i."sourceId"='csv' ORDER BY s.sku`,
      )
    ).rows,
  ).toEqual([
    { sku: "NEW-A", observedAt: new Date(observedAt) },
    { sku: "NEW-B", observedAt: new Date("2026-10-27T09:00:00.000Z") },
  ]);
  expect(
    (
      await f.pg.query(
        `SELECT resource FROM "SyncCursor" WHERE "sourceId"='csv' ORDER BY resource`,
      )
    ).rows,
  ).toEqual([{ resource: "orders" }]);
});
it("dispatches registered runtimes from the selected tenant/source and authenticates provider-bound secrets", async () => {
  await f.pg.query(
    `UPDATE "ConnectorConnection" SET "encryptedConfig"=$1 WHERE id='csv'`,
    [encryptCredentials({ account: "upload", token: "synthetic" }, "a", "csv")],
  );
  const registration: ProviderRegistration = {
    requestWindows: [{ milliseconds: 60000, limit: 20 }],
    parse: (value) => ({ credentials: value, issues: [] }),
    identity: () => ({
      accountHost: "upload",
      sourceKey: "upload",
      timezone: "Europe/Kyiv",
      hasReceiptsKey: false,
      hasYmlUrl: false,
    }),
    create: () => fixtureConnector(),
  };
  expect(
    (await loadConnectorRuntime("a", false, f.db, { csv: registration }))
      .connector.provider,
  ).toBe("csv");
  await expect(
    loadConnectorRuntime("b", false, f.db, { csv: registration }, "csv"),
  ).rejects.toThrow("NOT_CONFIGURED");
  await f.pg.query(
    `UPDATE "ConnectorConnection" SET "encryptedConfig"=$1 WHERE id='csv'`,
    [encryptCredentials({ token: "synthetic" }, "a", "shopify")],
  );
  await expect(
    loadConnectorRuntime("a", false, f.db, { csv: registration }),
  ).rejects.toThrow("CONNECTOR_STORAGE_UNAVAILABLE");
});

it("discards an opaque cursor after credential rotation and replays the fixed window without duplicating facts", async () => {
  const { resumeOrderImport } = await import("@/lib/connectors/order-jobs");
  const cursors: Array<string | null | undefined> = [];
  const connector = fixtureConnector({
    capabilities: { ...capabilities, pagination: { orders: "cursor" } },
    getOrders: async (r) => {
      cursors.push(r?.cursor);
      return {
        observedAt,
        records: [fixtureOrder(r?.cursor ? "2" : "1")],
        nextPage: null,
        next: r?.cursor
          ? null
          : { kind: "cursor", cursor: "cursor-before-rotation" },
      };
    },
  });
  const job = await enqueueOrderImport("a", "BACKFILL", {}, f.db);
  let revision = 1;
  const load = async () => ({
    sourceId: "csv",
    revision,
    timezone: "Europe/Kyiv",
    connector,
  });
  for (let i = 0; i < 3; i++) await processOrderJob("a", f.db, load);
  await f.pg.exec(`UPDATE "ConnectorConnection" SET revision=2 WHERE id='csv'`);
  revision = 2;
  await processOrderJob("a", f.db, load);
  expect((await getOrderImportProgress("a", f.db))?.state).toBe("PAUSED");
  expect(await resumeOrderImport("a", f.db)).toBe(1);
  for (let i = 0; i < 4; i++) await processOrderJob("a", f.db, load);
  expect(cursors).toEqual([null, null, "cursor-before-rotation"]);
  expect((await getOrderImportProgress("a", f.db))?.state).toBe("COMPLETE");
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "OrderLine" WHERE "sourceId"='csv'`,
      )
    ).rows,
  ).toEqual([{ n: 2 }]);
  expect(
    (
      await f.pg.query(
        `SELECT "connectionRevision" FROM "ConnectorSyncJob" WHERE id=$1`,
        [job.id],
      )
    ).rows,
  ).toEqual([{ connectionRevision: 2 }]);
});

it("fences an old source page when the administrator switches source during its remote read", async () => {
  const { listConnectorSources } = await import("@/lib/connectors/source");
  await f.pg.exec(
    `UPDATE "ConnectorConnection" SET "lastCheck"='{"ok":true}' WHERE id='connection'`,
  );
  const job = await enqueueOrderImport("a", "INCREMENTAL", {}, f.db);
  const connector = fixtureConnector({
    getOrders: async () => {
      const state = await listConnectorSources("a", f.db);
      await selectConnectorSource("a", "owner", "source", state.revision, f.db);
      return { records: [fixtureOrder("3")], nextPage: null, observedAt };
    },
  });
  const load = async () => ({
    sourceId: "csv",
    revision: 2,
    timezone: "Europe/Kyiv",
    connector,
  });
  for (let i = 0; i < 3; i++) await processOrderJob("a", f.db, load);
  expect(
    (
      await f.pg.query(
        `SELECT state,"errorCode" FROM "ConnectorSyncJob" WHERE id=$1`,
        [job.id],
      )
    ).rows,
  ).toEqual([{ state: "PAUSED", errorCode: "CONNECTOR_CONFIG_CHANGED" }]);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "OrderLine" WHERE "sourceId"='csv' AND "externalOrderId"='3'`,
      )
    ).rows,
  ).toEqual([{ n: 0 }]);
});
