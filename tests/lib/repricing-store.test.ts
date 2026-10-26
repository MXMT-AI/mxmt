import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createScreenDb, screenSelection } from "../helpers/screen-db";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import {
  createRepricingInputs,
  getRepricingPreview,
} from "@/lib/repricing-store";
let fixture: Awaited<ReturnType<typeof createScreenDb>>,
  inputs: Awaited<ReturnType<typeof createRepricingInputs>>,
  snapshotId: string,
  initialActions: unknown;
beforeAll(async () => {
  fixture = await createScreenDb();
  initialActions = (
    await fixture.pg.query(
      `SELECT count(*)::integer count FROM "MerchandisingAction"`,
    )
  ).rows;
  snapshotId = (await createScreenSnapshot("a", screenSelection, fixture.db))
    .snapshotId;
  inputs = await createRepricingInputs(
    "a",
    snapshotId,
    fixture.db,
    screenSelection.now,
  );
}, 30000);
afterAll(async () => fixture?.pg.close());
const read = (extra: Record<string, unknown> = {}) =>
  getRepricingPreview(
    "a",
    { inputSetId: inputs.inputSetId, ...extra },
    fixture.db,
  );
describe("immutable tenant-scoped repricing inputs", () => {
  it("publishes one inactive input set and completed calendar-month unit windows", async () => {
    expect(
      await createRepricingInputs(
        "a",
        snapshotId,
        fixture.db,
        screenSelection.now,
      ),
    ).toEqual(inputs);
    expect(inputs.windows).toEqual({
      1: { from: "2026-09-25", to: "2026-10-24", complete: true },
      3: { from: "2026-07-25", to: "2026-10-24", complete: true },
      7: { from: "2026-03-25", to: "2026-10-24", complete: true },
    });
    const r = await read();
    expect(r.rows.find((x) => x.skuId === "sku-a")).toMatchObject({
      sold: { 1: "0", 3: "2", 7: "2" },
      ownership: "OWN",
      quantity: "12.0000",
      unitCost: "10.0000",
      currentPrice: "20.0000",
    });
    expect(r.capabilities).toEqual({
      preview: true,
      export: false,
      execute: false,
    });
    expect(
      (
        await fixture.pg.query(
          `SELECT "isActive" FROM "MerchandisingConfig" WHERE id=$1`,
          [inputs.inputSetId],
        )
      ).rows,
    ).toEqual([{ isActive: false }]);
  });
  it("does not expose another tenant's snapshot or input set", async () => {
    await expect(
      createRepricingInputs("b", snapshotId, fixture.db, screenSelection.now),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getRepricingPreview("b", { inputSetId: inputs.inputSetId }, fixture.db),
    ).rejects.toMatchObject({
      code: "REPRICING_INPUTS_NOT_FOUND",
      status: 404,
    });
  });
  it("recalculates all totals before paging and keeps preview identity independent of pages", async () => {
    const all = await read({ filters: { status: "DEAD_OR_RISK" } }),
      page = await read({ filters: { status: "DEAD_OR_RISK" }, pageSize: 1 });
    expect(page.rows).toHaveLength(1);
    expect(page.totals).toEqual(all.totals);
    expect(page.previewId).toBe(all.previewId);
  });
  it("keeps cached prices, stock and history frozen after live source changes", async () => {
    const before = await read();
    await fixture.pg.exec(
      `UPDATE "InventorySnapshot" SET quantity=999,"retailPrice"=999; UPDATE "OrderLine" SET quantity=999; UPDATE "SyncCursor" SET checkpoint='{}'`,
    );
    expect(await read()).toEqual(before);
    expect(
      await createRepricingInputs(
        "a",
        snapshotId,
        fixture.db,
        screenSelection.now,
      ),
    ).toEqual(inputs);
    expect(
      (
        await fixture.pg.query(
          `SELECT count(*)::integer count FROM "MerchandisingAction"`,
        )
      ).rows,
    ).toEqual(initialActions);
  });
});
describe("history availability and first-publication fence", () => {
  it("marks only uncovered monthly windows unknown, never inventing zero sales", async () => {
    const f = await createScreenDb();
    try {
      const snapshot = await createScreenSnapshot("a", screenSelection, f.db);
      await f.pg.exec(
        `UPDATE "ConnectorSyncJob" SET checkpoint=jsonb_set(checkpoint,'{from}','"2026-09-24T21:00:00Z"') WHERE id='orders-job'`,
      );
      const i = await createRepricingInputs(
        "a",
        snapshot.snapshotId,
        f.db,
        screenSelection.now,
      );
      expect(i.windows[1].complete).toBe(true);
      expect(i.windows[3].complete).toBe(false);
      expect(i.windows[7].complete).toBe(false);
      expect(i.historyUnavailableReason).toBe("INCOMPLETE_HISTORY");
      const result = await getRepricingPreview(
        "a",
        { inputSetId: i.inputSetId, filters: { soldMax: "0" } },
        f.db,
      );
      expect(result.rows).toEqual([]);
      const short = await getRepricingPreview(
        "a",
        { inputSetId: i.inputSetId, filters: { soldMonths: 1, soldMax: "0" } },
        f.db,
      );
      expect(short.rows.find((x) => x.skuId === "sku-a")!.sold).toEqual({
        1: "0",
        3: null,
        7: null,
      });
    } finally {
      await f.pg.close();
    }
  }, 30000);
  it("requires a fresh snapshot if source state changed before first publication", async () => {
    const f = await createScreenDb();
    try {
      const snapshot = await createScreenSnapshot("a", screenSelection, f.db);
      await f.pg.exec(`UPDATE "SyncCursor" SET checkpoint='{}'`);
      await expect(
        createRepricingInputs(
          "a",
          snapshot.snapshotId,
          f.db,
          screenSelection.now,
        ),
      ).rejects.toMatchObject({
        code: "REPRICING_SOURCE_CHANGED",
        status: 409,
      });
    } finally {
      await f.pg.close();
    }
  }, 30000);
});
