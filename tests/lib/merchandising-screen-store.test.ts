import type { Prisma } from "@prisma/client";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createScreenDb, screenSelection } from "../helpers/screen-db";
import type { PGlite } from "@electric-sql/pglite";
import type { SqlDatabase } from "@/lib/connectors/database";
import {
  createScreenSnapshot,
  readScreenSnapshot,
  type ScreenSnapshot,
} from "@/lib/merchandising-snapshot";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import {
  parseScreenQuery,
  type ScreenName,
} from "@/lib/merchandising-screen-query";
import { getSalesReport } from "@/lib/sales-report";
import {
  readClientSettings,
  saveMerchandisingSettings,
} from "@/lib/merchandising-settings-store";
import { financialDecimal as D } from "@/lib/merchandising-policy";
let pg: PGlite, db: SqlDatabase, snapshot: ScreenSnapshot;
beforeAll(async () => {
  ({ pg, db } = await createScreenDb());
  snapshot = await createScreenSnapshot("a", screenSelection, db);
}, 30000);
afterAll(async () => pg?.close());
const query = (screen: ScreenName, filters: Record<string, string> = {}) =>
  parseScreenQuery(
    new URLSearchParams({ snapshotId: snapshot.snapshotId, ...filters }),
    screen,
  );
const read = (screen: ScreenName, filters: Record<string, string> = {}) =>
  getMerchandisingScreen(
    "a",
    screen,
    query(screen, filters),
    db,
    screenSelection.now,
  );
describe("five screens pinned to a single atomic snapshot", () => {
  it("publishes and reuses a context without activating settings or mixing component IDs", async () => {
    expect(await createScreenSnapshot("a", screenSelection, db)).toEqual(
      snapshot,
    );
    expect(snapshot.sales.calculationVersion).toBe(1);
    expect(snapshot.stock.calculationVersion).toBe(2);
    expect(
      (
        await pg.query(
          `SELECT "isActive",values->>'kind' kind FROM "MerchandisingConfig" WHERE id=$1`,
          [snapshot.snapshotId],
        )
      ).rows,
    ).toEqual([{ isActive: false, kind: "SCREEN_SNAPSHOT_V1" }]);
  });
  it("uses the production financial formulas and distinct source orders", async () => {
    const screen = await read("sales"),
      original = await getSalesReport("a", screenSelection, db);
    expect(screen.sales!.summary[0].current).toEqual(
      original.summary[0].current,
    );
    expect(screen.sales!.summary[0].current).toMatchObject({
      revenue: "110",
      units: "5.5",
      orderCount: 3,
      returnOrderCount: 1,
      coveredGrossProfit: "32",
      coverage: "PARTIAL",
    });
    expect(screen.sales!.preorders).toEqual([
      expect.objectContaining({ lineCount: 1 }),
    ]);
  });
  it("changes sales for a channel while retaining all-channel stock exactly", async () => {
    const shop = await read("overview", { channelId: "1" }),
      online = await read("overview", { channelId: "2" });
    expect(shop.sales!.summary[0].current.revenue).toBe("80");
    expect(online.sales!.summary[0].current.revenue).toBe("20");
    expect(shop.stock).toEqual(online.stock);
    expect(shop.stock!.channelScope).toBe("ALL_CHANNELS");
  });
  it("ties brand drill-down revenue and distinct orders to the parent KPI", async () => {
    const brands = await read("sales", { groupBy: "brand" });
    for (const row of brands.table!.rows) {
      const parent = row as Record<string, unknown>;
      const url = new URL(String(parent.drillDown), "https://app.test");
      const detail = await getMerchandisingScreen(
        "a",
        "sales",
        parseScreenQuery(url.searchParams, "sales"),
        db,
        screenSelection.now,
      );
      expect(detail.sales!.summary[0].current.revenue).toBe(parent.revenue);
      expect(detail.sales!.summary[0].current.orderCount).toBe(
        parent.orderCount,
      );
      expect(detail.context).toEqual(brands.context);
    }
  });
  it("ties category stock drill-downs to the same filtered quantity and money", async () => {
    const categories = await read("stock", { groupBy: "category" });
    for (const row of categories.table!.rows) {
      const parent = row as Record<string, unknown>,
        url = new URL(String(parent.drillDown), "https://app.test");
      const detail = await getMerchandisingScreen(
        "a",
        "stock",
        parseScreenQuery(url.searchParams, "stock"),
        db,
        screenSelection.now,
      );
      const values = detail.stock!.summary.byCurrency[0];
      expect(values.quantity).toBe(parent.quantity);
      expect(values.stockCost).toBe(parent.stockCost);
    }
  });
  it("keeps currencies separate, counts shortage union once and exposes decimal/null metadata", async () => {
    const stock = await read("stock");
    expect(
      stock.stock!.summary.byCurrency.map((r) => [r.currency, r.stockCost]),
    ).toEqual([
      ["UAH", "141"],
      ["USD", "16"],
    ]);
    expect(stock.stock!.summary.shortageSkuCount).toBe(1);
    expect(
      stock.table!.columns.find((c) => c.key === "stockCost"),
    ).toMatchObject({
      unit: "ROW_CURRENCY",
      encoding: "DECIMAL_STRING",
      nullable: true,
    });
    expect(stock.context.calculationIds.stock).toBe(
      snapshot.stock.calculationId,
    );
  });
  it("provides action candidates and advertises the available repricing preview", async () => {
    const repricing = await read("repricing"),
      reordering = await read("reordering");
    expect(repricing.table!.rows.length).toBeGreaterThan(0);
    expect(repricing.capabilities).toMatchObject({
      readOnly: true,
      preview: true,
      export: true,
    });
    expect(reordering.table!.rows).toEqual([
      expect.objectContaining({ id: "sku-b", classification: "OOS" }),
    ]);
  });
  it("supports literal search and numeric null-last sorting while keeping pagination summaries global", async () => {
    const search = await read("sales", { search: "%" });
    expect(search.table!.rows).toEqual([
      expect.objectContaining({ id: "sku-a" }),
    ]);
    const a = await read("sales", {
        sort: "coveredGrossProfit",
        direction: "asc",
        pageSize: "1",
      }),
      b = await read("sales", {
        sort: "coveredGrossProfit",
        direction: "desc",
        page: "100",
        pageSize: "1",
      });
    expect(a.table!.pagination.totalRows).toBe(3);
    expect(b.table!.pagination.totalRows).toBe(3);
    expect(b.table!.rows).toEqual([]);
    expect(a.sales!.summary).toEqual(b.sales!.summary);
  });
  it("returns explicit empty filtered populations and denies cross-tenant snapshot access", async () => {
    const empty = await read("stock", { brandId: "no-such-brand" });
    expect(empty.dataState).toBe("EMPTY");
    expect(empty.stock!.summary.availability.ratio).toBeNull();
    await expect(
      getMerchandisingScreen(
        "b",
        "stock",
        query("stock"),
        db,
        screenSelection.now,
      ),
    ).rejects.toMatchObject({ code: "SCREEN_SNAPSHOT_NOT_FOUND", status: 404 });
    await expect(
      readScreenSnapshot("b", snapshot.snapshotId, db),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("uses one transaction for context creation and a constant query count for one versus many detail rows", async () => {
    let txCalls = 0;
    await createScreenSnapshot("a", screenSelection, {
      ...db,
      $transaction: (callback, options) => {
        txCalls++;
        return db.$transaction(callback, options);
      },
    });
    expect(txCalls).toBe(1);
    async function count(pageSize: string) {
      const statements: string[] = [];
      const counted: SqlDatabase = {
        ...db,
        $transaction: (callback) =>
          db.$transaction((tx) =>
            callback({
              ...tx,
              $queryRaw: async <T>(q: Prisma.Sql) => {
                statements.push(q.text);
                return tx.$queryRaw<T>(q);
              },
            }),
          ),
      };
      await getMerchandisingScreen(
        "a",
        "stock",
        query("stock", { pageSize }),
        counted,
        screenSelection.now,
      );
      expect(
        statements.every(
          (sql) =>
            !sql.includes('FROM "OrderLine"') && !sql.includes('JOIN "Sku" '),
        ),
      ).toBe(true);
      return statements.length;
    }
    expect(await count("1")).toBe(await count("200"));
  });
  it("rejects unsupported component versions without substituting current caches", async () => {
    const bad = {
      ...snapshot,
      snapshotId: "bad-version",
      stock: { ...snapshot.stock, calculationVersion: 99 },
    };
    await pg.query(
      `INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive") VALUES ('bad-version','a','GENERAL','test-bad-version',1,$1,false)`,
      [JSON.stringify({ kind: "SCREEN_SNAPSHOT_V1", snapshot: bad })],
    );
    await expect(
      readScreenSnapshot("a", "bad-version", db),
    ).rejects.toMatchObject({ code: "SCREEN_VERSION_UNSUPPORTED" });
    await expect(
      getMerchandisingScreen(
        "a",
        "stock",
        query("stock", { snapshotId: "bad-version" }),
        db,
        screenSelection.now,
      ),
    ).rejects.toMatchObject({ code: "SCREEN_VERSION_UNSUPPORTED" });
  });
  it("rejects cross-tenant facts and SKU-to-daily mismatches at the database boundary", async () => {
    await expect(
      pg.query(
        `INSERT INTO "MerchandisingScreenFact" ("snapshotId","tenantId","lineId","sourceId","orderId","productKind",kind,"inCurrent","inPriorYear") VALUES ($1,'b','foreign','source','order','MERCHANDISE','SALE',true,false)`,
        [snapshot.snapshotId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    const daily = (
      await pg.query<{ id: string }>(
        `SELECT "dailyId" id FROM "MerchandisingScreenSku" WHERE "snapshotId"=$1 AND "skuId"='sku-a'`,
        [snapshot.snapshotId],
      )
    ).rows[0];
    await expect(
      pg.query(
        `UPDATE "MerchandisingScreenSku" SET "dailyId"=$1 WHERE "snapshotId"=$2 AND "skuId"='sku-b'`,
        [daily.id, snapshot.snapshotId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
  it("labels historical and stale sources without mutating the saved selection", async () => {
    const historical = await getMerchandisingScreen(
      "a",
      "stock",
      query("stock"),
      db,
      new Date("2026-10-26T10:00:00Z"),
    );
    expect(historical.freshness).toMatchObject({
      status: "HISTORICAL",
      historical: true,
      sourceStale: true,
    });
    expect(historical.context.asOf).toBe("2026-10-25");
    const stale = await getMerchandisingScreen(
      "a",
      "stock",
      query("stock"),
      db,
      new Date("2026-10-25T15:00:00Z"),
    );
    expect(stale.freshness.status).toBe("STALE");
  });
  it("retains frozen data after source or settings change, changing only freshness", async () => {
    const before = await read("overview");
    await pg.exec(
      `UPDATE "Sku" SET name='Changed later' WHERE id='sku-a'; UPDATE "SyncCursor" SET checkpoint='{"through":"2026-10-25T10:00:00Z"}' WHERE id='orders-cursor'`,
    );
    const settings = await readClientSettings("a", db);
    await saveMerchandisingSettings(
      "a", "owner", "client", null, settings.revision,
      { ...settings.values, turnoverMonths: settings.values.turnoverMonths + 1 },
      db,
    );
    const after = await read("overview");
    expect(after.stock).toEqual(before.stock);
    expect(after.sales).toEqual(before.sales);
    expect(after.overview).toEqual(before.overview);
    expect(after.freshness).toMatchObject({
      status: "SOURCE_CHANGED",
      sourceChanged: true,
    });
    const refreshed = await createScreenSnapshot("a", screenSelection, db);
    expect(refreshed.snapshotId).not.toBe(snapshot.snapshotId);
    expect(refreshed.settings.clientConfigId).not.toBe(
      snapshot.settings.clientConfigId,
    );
    expect(refreshed.sales.context.settings.turnoverMonths).toBe(
      settings.values.turnoverMonths + 1,
    );
    expect(
      (await readScreenSnapshot("a", snapshot.snapshotId, db)).settings,
    ).toEqual(snapshot.settings);
  });
  it("rolls back all new publications if screen materialization fails", async () => {
    const before = (
      await pg.query(
        `SELECT (SELECT count(*) FROM "MerchandisingConfig")::int configs,(SELECT count(*) FROM "SkuDaily")::int daily,(SELECT count(*) FROM "ReportCalculationRun")::int sales`,
      )
    ).rows;
    await pg.exec(
      `UPDATE "InventorySnapshot" SET quantity=13 WHERE id='sku-a:2026-10-25'`,
    );
    const broken: SqlDatabase = {
      ...db,
      $transaction: (callback) =>
        db.$transaction((tx) =>
          callback({
            ...tx,
            $executeRaw: async (q) => {
              if (q.text.includes('INSERT INTO "MerchandisingScreenFact"'))
                throw new Error("test failure");
              return tx.$executeRaw(q);
            },
          }),
        ),
    };
    await expect(
      createScreenSnapshot("a", screenSelection, broken),
    ).rejects.toThrow("test failure");
    expect(
      (
        await pg.query(
          `SELECT (SELECT count(*) FROM "MerchandisingConfig")::int configs,(SELECT count(*) FROM "SkuDaily")::int daily,(SELECT count(*) FROM "ReportCalculationRun")::int sales`,
        )
      ).rows,
    ).toEqual(before);
  });
});
