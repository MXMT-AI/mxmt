import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createScreenDb } from "../helpers/screen-db";
import {
  capabilities,
  fixtureCatalogRow,
  fixtureConnector,
  fixtureOrder,
} from "../fixtures/foundation-connector";
import { selectConnectorSource } from "@/lib/connectors/source";
import {
  enqueueInventoryImport,
  processInventoryJob,
} from "@/lib/connectors/inventory-jobs";
import { storeCatalog } from "@/lib/connectors/catalog-storage";
import { storeOrder } from "@/lib/connectors/order-storage";
import { parseOrderPolicy } from "@/lib/connectors/order-policy";
let f: Awaited<ReturnType<typeof createScreenDb>>;
beforeAll(async () => {
  f = await createScreenDb();
}, 30000);
afterAll(async () => f?.pg.close());

it("uses the stock row observation cutoff for sale-derived cost in a paginated catalog", async () => {
  const scope = {
    tenantId: "a",
    sourceId: "source",
    importRunId: "inventory-run",
    timezone: "Europe/Kyiv",
  };
  const policy = parseOrderPolicy({
    statuses: { "5": "SALE" },
    amounts: {
      price: "gross_unit",
      absoluteDiscount: "line",
      currency: "UAH",
      cost: "unit",
    },
  });
  for (const [id, paidAt, cost] of [
    ["before", "2026-10-27T07:00:00.000Z", "10"],
    ["after", "2026-10-27T08:30:00.000Z", "99"],
  ]) {
    const order = fixtureOrder(id);
    order.paidAt = paidAt;
    order.orderedAt = paidAt;
    order.observedAt = "2026-10-27T10:00:00.000Z";
    order.updatedAt = order.observedAt;
    order.lines[0].costPrice = cost;
    await f.db.$transaction((tx) => storeOrder(tx, scope, order, policy));
  }
  const early = fixtureCatalogRow("sku-a"),
    late = fixtureCatalogRow("sku-b");
  late.product.observedAt = late.stock.observedAt = "2026-10-27T09:00:00.000Z";
  await f.db.$transaction((tx) =>
    storeCatalog(tx, scope, {
      products: [early.product, late.product],
      stock: [early.stock, late.stock],
      observedAt: late.stock.observedAt,
      rawResponse: "synthetic",
      perRowObservations: true,
    }),
  );
  expect(
    (
      await f.pg.query(
        `SELECT "costPrice"::text cost,("costProvenance"->>'paidAt')::timestamptz "paidAt" FROM "InventorySnapshot" WHERE "sourceId"='source' AND "skuId"='sku-a' ORDER BY "observedAt" DESC LIMIT 1`,
      )
    ).rows,
  ).toEqual([
    { cost: "10.0000", paidAt: new Date("2026-10-27T07:00:00.000Z") },
  ]);
});

it("advances incremental receipts only when every page verifies the requested interval", async () => {
  const caps = { ...capabilities, receipts: true, incrementalReceipts: true };
  await f.pg.query(`UPDATE "DataSource" SET kind='CSV' WHERE id='source'`);
  await f.pg.query(
    `UPDATE "ConnectorConnection" SET provider='csv',"lastCheck"='{"ok":true}',capabilities=$1 WHERE id='connection'`,
    [JSON.stringify(caps)],
  );
  await f.pg.exec(
    `UPDATE "MerchandisingConfig" SET key=replace(key,'salesdrive:','csv:') WHERE "configType"='SOURCE_MAPPING';`,
  );
  await selectConnectorSource("a", "owner", "source", 0, f.db);
  let valid = true,
    calls = 0;
  const catalog = fixtureCatalogRow("sku-a");
  const connector = fixtureConnector({
    capabilities: caps,
    getReceipts: async (r) => {
      calls++;
      return {
        observedAt: "2026-10-28T12:00:00.000Z",
        records: [],
        nextPage: r?.page === 1 ? 2 : null,
        historyCoverage: {
          complete: true,
          from: valid || r?.page === 1 ? r!.updatedFrom! : r!.updatedTo!,
          to: r!.updatedTo!,
        },
      };
    },
    getCatalogSnapshot: async () => ({
      completePopulation: true,
      observationId: "receipts-catalog",
      observedAt: catalog.stock.observedAt,
      products: [catalog.product],
      stock: [catalog.stock],
      rawResponse: "synthetic",
    }),
  });
  const load = async () => ({
    sourceId: "source",
    revision: 1,
    timezone: "Europe/Kyiv",
    connector,
  });
  for (const key of ["covered", "gap"]) {
    const previous = (
      await f.pg.query<{ checkpoint: { through: string } }>(
        `SELECT checkpoint FROM "SyncCursor" WHERE "sourceId"='source' AND resource='receipts'`,
      )
    ).rows[0].checkpoint.through;
    const id = await enqueueInventoryImport("a", f.db, { requestKey: key });
    for (let i = 0; i < 3; i++) await processInventoryJob("a", f.db, load);
    const job = (
      await f.pg.query<{
        state: string;
        checkpoint: {
          from: string;
          to: string;
          receiptHistoryComplete: boolean;
        };
      }>(`SELECT state,checkpoint FROM "ConnectorSyncJob" WHERE id=$1`, [id])
    ).rows[0];
    expect(job.state).toBe("COMPLETE");
    expect(job.checkpoint.from).toBeTruthy();
    expect(job.checkpoint.receiptHistoryComplete).toBe(valid);
    const through = (
      await f.pg.query<{ through: string }>(
        `SELECT checkpoint->>'through' through FROM "SyncCursor" WHERE "sourceId"='source' AND resource='receipts'`,
      )
    ).rows[0].through;
    expect(through).toBe(valid ? job.checkpoint.to : previous);
    valid = false;
  }
  expect(calls).toBe(4);
});
