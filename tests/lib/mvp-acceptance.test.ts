import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createMonobrandDb } from "../helpers/monobrand-db";
import { screenSelection } from "../helpers/screen-db";
import { SalesDriveConnector } from "@/lib/connectors/salesdrive";
import {
  requestSyncCycle,
  getSyncProgress,
} from "@/lib/connectors/sync-cycles";
import { processSalesDriveSync } from "@/lib/connectors/sync-worker";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import {
  parseScreenQuery,
  type ScreenName,
} from "@/lib/merchandising-screen-query";
import {
  createRepricingInputs,
  getRepricingPreview,
} from "@/lib/repricing-store";
import { getReorderingPreview } from "@/lib/reordering-store";
import {
  createScenarioExport,
  readScenarioExportFile,
  readScenarioExportHistory,
} from "@/lib/scenario-export-store";

let f: Awaited<ReturnType<typeof createMonobrandDb>>;
beforeAll(async () => {
  f = await createMonobrandDb();
}, 30000);
afterAll(async () => f?.pg.close());

/** Synthetic baseline and provider responses exercise production orchestration; no live customer acceptance is asserted. */
it("connect check → incremental sync → pinned KPIs/details → both audited CSV scenarios", async () => {
  const original = (await createScreenSnapshot("b", screenSelection, f.db))
    .snapshotId;
  const read = (
    snapshotId: string,
    screen: ScreenName,
    filters: Record<string, string> = {},
  ) =>
    getMerchandisingScreen(
      "b",
      screen,
      parseScreenQuery(
        new URLSearchParams({ snapshotId, currency: "UAH", ...filters }),
        screen,
      ),
      f.db,
      screenSelection.now,
    );
  const before = await read(original, "overview");
  const connector = new SalesDriveConnector(
    {
      accountHost: "demo.salesdrive.me",
      ordersApiKey: "synthetic-orders",
      receiptsApiKey: "synthetic-receipts",
      ymlUrl:
        "https://demo.salesdrive.me/export/yml/export.yml?publicKey=synthetic",
    },
    async (url) => {
      if (url.pathname.includes("export.yml"))
        return new Response(
          '<yml_catalog><shop><offers><offer id="sku-b"><vendorCode>B</vendorCode><name>Beta</name><price>30</price><currencyId>UAH</currencyId><quantity_in_stock>0</quantity_in_stock></offer></offers></shop></yml_catalog>',
        );
      if (url.pathname === "/api/statuses/")
        return Response.json({ data: [{ id: 5, name: "Sale" }] });
      if (url.pathname === "/api/arrival-product/list/")
        return Response.json({ data: [], pagination: { pageCount: 1 } });
      expect(url.pathname).toBe("/api/order/list/");
      return Response.json({
        data: [
          {
            id: 5101,
            version: 1,
            statusId: 5,
            sajt: 1,
            orderTime: "2026-09-20",
            paymentDate: "2026-09-20",
            updateAt: "2026-10-25 12:00:00",
            products: [
              {
                id: 1,
                productId: "sku-b",
                sku: "B",
                amount: 3,
                price: 30,
                costPrice: 10,
                discount: 0,
                percentDiscount: 0,
              },
            ],
          },
        ],
        pagination: { pageCount: 1 },
      });
    },
  );
  expect((await connector.checkConnection()).ok).toBe(true);
  const runtime = async () => ({
    sourceId: "bimba:source",
    revision: 1,
    timezone: "Europe/Kyiv",
    connector,
  });
  const cycleId = await requestSyncCycle("b", "orders", f.db);
  expect(await requestSyncCycle("b", "orders", f.db)).toBe(cycleId);
  for (let tick = 0; tick < 4; tick++)
    await processSalesDriveSync("b", f.db, runtime);
  expect((await getSyncProgress("b", f.db)).cycle).toMatchObject({
    id: cycleId,
    state: "COMPLETE",
  });
  for (let tick = 0; tick < 8; tick++) {
    const result = await processSalesDriveSync("b", f.db, runtime);
    if (!result.processed) break;
  }
  expect((await getSyncProgress("b", f.db)).calculation?.state).toBe(
    "COMPLETE",
  );
  expect((await getSyncProgress("a", f.db)).cycle).toBeNull();
  const snapshotId = (await createScreenSnapshot("b", screenSelection, f.db))
    .snapshotId;
  expect(snapshotId).not.toBe(original);
  const overview = await read(snapshotId, "overview"),
    sales = await read(snapshotId, "sales"),
    stock = await read(snapshotId, "stock"),
    repricing = await read(snapshotId, "repricing"),
    reordering = await read(snapshotId, "reordering");
  for (const model of [sales, stock, repricing, reordering])
    expect(model.context).toEqual(overview.context);
  expect(overview.sales!.summary).toEqual(sales.sales!.summary);
  expect(stock.stock!.summary).toEqual(overview.stock!.summary);
  // Action screens have narrower candidate populations; compare identical scopes.
  const deadStock = await read(snapshotId, "stock", { classification: "DEAD" });
  expect(repricing.stock!.summary).toEqual(deadStock.stock!.summary);
  const shortageDetail = await read(snapshotId, "stock", {
    skuId: "bimba:sku-b",
  });
  expect(reordering.stock!.summary).toEqual(shortageDetail.stock!.summary);
  expect(overview.sales!.summary[0].current.revenue).toBe("200");
  expect(before.sales!.summary[0].current.revenue).toBe("110");
  expect((await read(original, "overview")).sales!.summary).toEqual(
    before.sales!.summary,
  );
  expect((await read(original, "overview")).freshness.sourceChanged).toBe(true);
  for (const row of sales.table!.rows) {
    const parent = row as Record<string, unknown>;
    const q = parseScreenQuery(
      new URL(String(parent.drillDown), "https://app.test").searchParams,
      "sales",
    );
    const child = await getMerchandisingScreen(
      "b",
      "sales",
      q,
      f.db,
      screenSelection.now,
    );
    expect(child.context).toEqual(overview.context);
    expect(child.sales!.summary[0].current.revenue).toBe(parent.revenue);
  }
  for (const row of stock.table!.rows) {
    const parent = row as Record<string, unknown>;
    const q = parseScreenQuery(
      new URL(String(parent.drillDown), "https://app.test").searchParams,
      "stock",
    );
    const child = await getMerchandisingScreen(
      "b",
      "stock",
      q,
      f.db,
      screenSelection.now,
    );
    expect(child.context).toEqual(overview.context);
    expect(child.stock!.summary.byCurrency[0].stockCost).toBe(parent.stockCost);
    expect(child.stock!.summary.byCurrency[0].quantity).toBe(parent.quantity);
  }
  const { inputSetId } = await createRepricingInputs(
    "b",
    snapshotId,
    f.db,
    screenSelection.now,
  );
  const repriceScenario = { inputSetId, filters: { currency: "UAH" } };
  const reprice = await getRepricingPreview("b", repriceScenario, f.db);
  const reorderScenario = {
    snapshotId,
    mode: "all",
    filters: { currency: "UAH" },
  };
  const reorder = await getReorderingPreview("b", reorderScenario, f.db);
  expect(reprice.canExport).toBe(true);
  expect(reorder.canExport).toBe(true);
  for (const command of [
    {
      exportId: "51515151-5151-4151-8151-515151515151",
      kind: "reprice",
      previewId: reprice.previewId,
      scenario: repriceScenario,
    },
    {
      exportId: "51515151-5151-4151-8151-515151515152",
      kind: "reorder",
      previewId: reorder.previewId,
      scenario: reorderScenario,
    },
  ] as const) {
    const receipt = await createScenarioExport("b", "owner-b", command, f.db);
    expect(receipt.files.length).toBeGreaterThan(0);
    expect(await createScenarioExport("b", "owner-b", command, f.db)).toEqual(
      receipt,
    );
    for (const file of receipt.files) {
      const saved = await readScenarioExportFile(
        "b",
        receipt.exportId,
        file.id,
        f.db,
      );
      expect(saved.content.startsWith("\uFEFF")).toBe(true);
      expect(saved.rowCount).toBeGreaterThan(0);
      expect(saved.content.split("\n")[0].trim()).toBe(
        (command.kind === "reprice"
          ? "sku;barcode;brand;category;name;old_price;new_price;discount_pct;promo_days;reason"
          : "supplier;sku;barcode;name;qty;unit_cost;sum"
        )
          .split(";")
          .map((column) => `"${column}"`)
          .join(";"),
      );
      await expect(
        readScenarioExportFile("a", receipt.exportId, file.id, f.db),
      ).rejects.toMatchObject({ status: 404 });
    }
    const action = (
      await f.pg.query<{ context: { dataVersion: { snapshotId: string } } }>(
        `SELECT context FROM "MerchandisingAction" WHERE id=$1`,
        [receipt.actionId],
      )
    ).rows[0];
    expect(action.context.dataVersion.snapshotId).toBe(snapshotId);
    expect(
      (await readScenarioExportHistory("b", command.kind, f.db)).rows,
    ).toHaveLength(1);
    expect(
      (await readScenarioExportHistory("a", command.kind, f.db)).rows,
    ).toEqual([]);
  }
}, 30000);

it("does not turn successful empty imports into proven history or exportable scenarios", async () => {
  const { createMerchandisingDb } = await import("../helpers/merchandising-db");
  const empty = await createMerchandisingDb();
  try {
    await empty.pg
      .exec(`INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('empty','Empty fixture','empty',now());
      INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('empty-source','empty','SALESDRIVE','demo.salesdrive.me',now());
      INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId","accountHost","encryptedConfig","hasYmlUrl","hasReceiptsKey","updatedAt") VALUES ('empty-connection','empty','empty-source','demo.salesdrive.me','synthetic',true,true,now());`);
    const connector = new SalesDriveConnector(
      {
        accountHost: "demo.salesdrive.me",
        ordersApiKey: "synthetic",
        receiptsApiKey: "synthetic",
        ymlUrl:
          "https://demo.salesdrive.me/export/yml/export.yml?publicKey=synthetic",
      },
      async (url) =>
        url.pathname.includes("export.yml")
          ? new Response(
              "<yml_catalog><shop><offers></offers></shop></yml_catalog>",
            )
          : Response.json({ data: [], pagination: { pageCount: 0 } }),
    );
    expect((await connector.checkConnection()).ok).toBe(true);
    const runtime = async () => ({
      sourceId: "empty-source",
      revision: 1,
      timezone: "Europe/Kyiv",
      connector,
    });
    const cycleId = await requestSyncCycle("empty", "both", empty.db);
    await processSalesDriveSync("empty", empty.db, runtime);
    expect(
      (
        await empty.pg.query(
          `SELECT r.status FROM "DataImportRun" r JOIN "ConnectorSyncJob" j ON j."importRunId"=r.id WHERE j."tenantId"='empty' AND j.resource='orders'`,
        )
      ).rows,
    ).toEqual([{ status: "PENDING" }]);
    // Reproduce a yielded run retained by the pre-#51 worker during an upgrade.
    await empty.pg.exec(
      `UPDATE "DataImportRun" r SET status='RUNNING' FROM "ConnectorSyncJob" j WHERE j."importRunId"=r.id AND j."tenantId"='empty' AND j.resource='orders'`,
    );
    for (let tick = 0; tick < 12; tick++) {
      const result = await processSalesDriveSync("empty", empty.db, runtime);
      if (!result.processed) break;
    }
    expect((await getSyncProgress("empty", empty.db)).cycle).toMatchObject({
      id: cycleId,
      state: "COMPLETE",
    });
    expect((await getSyncProgress("empty", empty.db)).calculation?.state).toBe(
      "COMPLETE",
    );
    expect(
      (
        await empty.pg.query(
          `SELECT state,attempts,"errorCode" FROM "ConnectorSyncJob" WHERE "tenantId"='empty'`,
        )
      ).rows,
    ).toEqual([
      { state: "COMPLETE", attempts: 0, errorCode: null },
      { state: "COMPLETE", attempts: 0, errorCode: null },
    ]);
    const { snapshotId } = await createScreenSnapshot(
      "empty",
      screenSelection,
      empty.db,
    );
    const overview = await getMerchandisingScreen(
      "empty",
      "overview",
      parseScreenQuery(new URLSearchParams({ snapshotId }), "overview"),
      empty.db,
      screenSelection.now,
    );
    expect(overview.dataState).toBe("EMPTY");
    expect(overview.overview!.history.current).toBe(false);
    expect(overview.overview!.history.ly).toBe(false);
    expect(overview.stock!.summary.availability.ratio).toBeNull();
    const { inputSetId } = await createRepricingInputs(
      "empty",
      snapshotId,
      empty.db,
      screenSelection.now,
    );
    expect(
      (await getRepricingPreview("empty", { inputSetId }, empty.db)).canExport,
    ).toBe(false);
    expect(
      (await getReorderingPreview("empty", { snapshotId }, empty.db)).canExport,
    ).toBe(false);
  } finally {
    await empty.pg.close();
  }
}, 30000);
