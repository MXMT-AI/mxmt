import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createMonobrandDb } from "../helpers/monobrand-db";
import { screenSelection } from "../helpers/screen-db";
import {
  readSelectedSource,
  selectConnectorSource,
  listConnectorSources,
} from "@/lib/connectors/source";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import { parseScreenQuery } from "@/lib/merchandising-screen-query";
import {
  createRepricingInputs,
  getRepricingPreview,
} from "@/lib/repricing-store";
import { getReorderingPreview } from "@/lib/reordering-store";
import { getSalesReport } from "@/lib/sales-report";
import { calculateSkuDaily } from "@/lib/sku-daily-store";
import { readNavigationOptions } from "@/lib/merchandising-navigation-store";
let f: Awaited<ReturnType<typeof createMonobrandDb>>;
beforeAll(async () => {
  f = await createMonobrandDb();
}, 30000);
afterAll(async () => f?.pg.close());
it("retains SalesDrive defaults, validates tenant/actor scope and uses optimistic selection revisions", async () => {
  expect(await readSelectedSource("a", f.db)).toMatchObject({
    id: "source",
    provider: "salesdrive",
    revision: 0,
  });
  await f.pg
    .exec(`INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('csv-a','a','CSV','upload-a',now());
    INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId",provider,"accountHost","encryptedConfig","lastCheck","updatedAt") VALUES ('csv-a','a','csv-a','csv','upload-a','synthetic','{"ok":true}',now());`);
  expect((await listConnectorSources("a", f.db)).sourceId).toBe("source");
  await expect(
    selectConnectorSource("a", "owner", "bimba:source", 0, f.db),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    selectConnectorSource("a", "owner-b", "csv-a", 0, f.db),
  ).rejects.toThrow();
  expect((await listConnectorSources("a", f.db)).revision).toBe(0);
  expect(await selectConnectorSource("a", "owner", "csv-a", 0, f.db)).toEqual({
    sourceId: "csv-a",
    revision: 1,
  });
  expect(await selectConnectorSource("a", "owner", "csv-a", 1, f.db)).toEqual({
    sourceId: "csv-a",
    revision: 1,
  });
  await expect(
    selectConnectorSource("a", "owner", "source", 0, f.db),
  ).rejects.toMatchObject({ code: "SOURCE_SELECTION_CHANGED" });
  expect((await readSelectedSource("b", f.db))!.id).toBe("bimba:source");
  await f.pg.exec(
    `UPDATE "ConnectorConnection" SET "lastCheck"='{"ok":true}' WHERE id='connection'`,
  );
  await selectConnectorSource("a", "owner", "source", 1, f.db);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "MerchandisingAction" WHERE action='SOURCE_SELECTED' AND "tenantId"='a'`,
      )
    ).rows,
  ).toEqual([{ n: 2 }]);
});
it("keeps frozen history readable but fences both old scenarios after switching away and back", async () => {
  const old = await createScreenSnapshot("a", screenSelection, f.db);
  const { inputSetId } = await createRepricingInputs(
    "a",
    old.snapshotId,
    f.db,
    screenSelection.now,
  );
  const before = await getRepricingPreview("a", { inputSetId }, f.db);
  const state = await listConnectorSources("a", f.db);
  await selectConnectorSource("a", "owner", "csv-a", state.revision, f.db);
  await expect(
    getRepricingPreview("a", { inputSetId }, f.db),
  ).rejects.toMatchObject({ code: "CONNECTOR_SOURCE_CHANGED" });
  await expect(
    createRepricingInputs("a", old.snapshotId, f.db),
  ).rejects.toMatchObject({ code: "CONNECTOR_SOURCE_CHANGED" });
  await expect(
    getReorderingPreview("a", { snapshotId: old.snapshotId }, f.db),
  ).rejects.toMatchObject({ code: "CONNECTOR_SOURCE_CHANGED" });
  const historical = await getMerchandisingScreen(
    "a",
    "overview",
    parseScreenQuery(
      new URLSearchParams({ snapshotId: old.snapshotId }),
      "overview",
    ),
    f.db,
    screenSelection.now,
  );
  expect(historical.freshness.sourceChanged).toBe(true);
  await selectConnectorSource("a", "owner", "source", state.revision + 1, f.db);
  await expect(
    getRepricingPreview("a", { inputSetId }, f.db),
  ).rejects.toMatchObject({ code: "CONNECTOR_SOURCE_CHANGED" });
  const fresh = await createScreenSnapshot("a", screenSelection, f.db);
  expect(fresh.snapshotId).not.toBe(old.snapshotId);
  const input = await createRepricingInputs(
    "a",
    fresh.snapshotId,
    f.db,
    screenSelection.now,
  );
  expect(
    (await getRepricingPreview("a", { inputSetId: input.inputSetId }, f.db))
      .totals,
  ).toEqual(before.totals);
});
it("runs the same financial/daily/navigation consumers for equivalent non-SalesDrive facts", async () => {
  const baseline = await getSalesReport("b", screenSelection, f.db);
  const daily = await calculateSkuDaily("b", screenSelection, f.db);
  const navigation = await readNavigationOptions("b", f.db);
  await f.pg.exec(
    `UPDATE "DataSource" SET kind='CSV' WHERE id='bimba:source'; UPDATE "ConnectorSyncJob" SET checkpoint=checkpoint||'{"historyComplete":true}'::jsonb WHERE id='bimba:orders-job'; UPDATE "ConnectorConnection" SET provider='csv',"lastCheck"='{"ok":true}' WHERE "tenantId"='b'; UPDATE "MerchandisingConfig" SET key=replace(key,'salesdrive:','csv:') WHERE "tenantId"='b' AND "configType"='SOURCE_MAPPING';`,
  );
  expect(await readSelectedSource("b", f.db)).toBeNull();
  await selectConnectorSource("b", "owner-b", "bimba:source", 0, f.db);
  const actual = await getSalesReport("b", screenSelection, f.db);
  expect(actual.summary).toEqual(baseline.summary);
  expect((await calculateSkuDaily("b", screenSelection, f.db)).summary).toEqual(
    daily.summary,
  );
  expect(await readNavigationOptions("b", f.db)).toEqual(navigation);
  expect((await readSelectedSource("a", f.db))!.provider).toBe("salesdrive");
});

it("uses explicitly bounded partial history for current metrics without claiming prior-year coverage", async () => {
  await f.pg.exec(
    `UPDATE "ConnectorSyncJob" SET checkpoint=checkpoint||'{"historyComplete":true,"coverageFrom":"2026-08-01T00:00:00.000Z","coverageTo":"2026-10-25T09:00:00.000Z"}'::jsonb WHERE id='bimba:orders-job'`,
  );
  const report = await getSalesReport("b", screenSelection, f.db);
  expect(report.summary[0].current.revenue).toBe("110");
  expect(report.history).toEqual({ current: true, ly: false });
  expect(report.summary[0].ly.coverage).toBe("PARTIAL");
  expect(report.summary[0].revenueChangePct).toBeNull();
});

it("does not bridge unverified history with a scan watermark but accepts contiguous verified incremental history", async () => {
  const { readOrderHistory } = await import("@/lib/connectors/order-history");
  const { createOrderHistoryCoverage } = await import("@/lib/order-history");
  await f.pg
    .exec(`UPDATE "ConnectorSyncJob" SET checkpoint=checkpoint||'{"coverageFrom":"2025-01-01T00:00:00.000Z","coverageTo":"2026-08-01T00:00:00.000Z"}'::jsonb WHERE id='bimba:orders-job';
    INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","completedAt","updatedAt") VALUES ('unverified','b','bimba:source','MANUAL','WARNING','unverified',now(),now(),now());
    INSERT INTO "ConnectorSyncJob" (id,"tenantId","sourceId","importRunId",resource,mode,state,"connectionRevision",checkpoint,"updatedAt") VALUES ('unverified','b','bimba:source','unverified','orders','BACKFILL','COMPLETE',1,'{"from":"2026-08-01T00:00:00.000Z","to":"2026-10-25T09:00:00.000Z","historyComplete":false}',now());`);
  let evidence = await readOrderHistory("b", "bimba:source", f.db);
  expect(evidence.cursor?.through).toBe("2026-10-25T09:00:00Z");
  expect(evidence.cursor?.coverageThrough).toBeNull();
  expect(
    (await getSalesReport("b", screenSelection, f.db)).history.current,
  ).toBe(false);
  const daily = await calculateSkuDaily("b", screenSelection, f.db);
  const diagnostics = (
    await f.pg.query<{ diagnostics: string[] }>(
      `SELECT diagnostics FROM "SkuDaily" WHERE "tenantId"='b' AND "configId"=$1`,
      [daily.calculationId],
    )
  ).rows;
  expect(diagnostics.length).toBeGreaterThan(0);
  expect(
    diagnostics.every((r) =>
      r.diagnostics.includes("SALES_HISTORY_INCOMPLETE"),
    ),
  ).toBe(true);
  const blocked = await createScreenSnapshot("b", screenSelection, f.db);
  expect(
    (
      await createRepricingInputs(
        "b",
        blocked.snapshotId,
        f.db,
        screenSelection.now,
      )
    ).windows[1].complete,
  ).toBe(false);

  await f.pg.exec(
    `UPDATE "ConnectorSyncJob" SET mode='INCREMENTAL',checkpoint=checkpoint||'{"historyComplete":true,"coverageFrom":"2026-09-15T00:00:00.000Z","coverageTo":"2026-10-25T09:00:00.000Z"}'::jsonb WHERE id='unverified';`,
  );
  expect(
    (await getSalesReport("b", screenSelection, f.db)).history.current,
  ).toBe(false);
  await f.pg.exec(
    `UPDATE "ConnectorSyncJob" SET checkpoint=checkpoint||'{"coverageFrom":"2026-08-01T00:00:00.000Z"}'::jsonb WHERE id='unverified';`,
  );
  evidence = await readOrderHistory("b", "bimba:source", f.db);
  expect(
    createOrderHistoryCoverage(
      evidence.windows,
      evidence.cursor?.coverageThrough ?? null,
      "Europe/Kyiv",
      false,
    ).covers("2026-09-01", "2026-09-30"),
  ).toBe(true);
  expect(
    (await getSalesReport("b", screenSelection, f.db)).history.current,
  ).toBe(true);
});
