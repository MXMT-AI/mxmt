import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createStockWorkspaceDb } from "../helpers/stock-workspace-db";
import { screenSelection } from "../helpers/screen-db";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
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
let f: Awaited<ReturnType<typeof createStockWorkspaceDb>>,
  snapshotId: string,
  inputsId: string;
const exportId = "11111111-1111-4111-8111-111111111111",
  reorderId = "22222222-2222-4222-8222-222222222222";
let command: Record<string, unknown>;
beforeAll(async () => {
  f = await createStockWorkspaceDb();
  await f.pg.exec(
    `UPDATE "Brand" SET "supplierId"='supplier' WHERE id='brand-active';UPDATE "InventorySnapshot" SET "qtyInTransit"=0,"inTransitVerifiedAt"='2026-10-25T05:00:00Z';INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('other','other@example.test','test','Other','ANALYST','a',now())`,
  );
  snapshotId = (await createScreenSnapshot("a", screenSelection, f.db))
    .snapshotId;
  inputsId = (
    await createRepricingInputs("a", snapshotId, f.db, screenSelection.now)
  ).inputSetId;
  const scenario = { inputSetId: inputsId, pageSize: 1 };
  const preview = await getRepricingPreview("a", scenario, f.db);
  command = {
    exportId,
    kind: "reprice",
    previewId: preview.previewId,
    scenario,
  };
}, 30000);
afterAll(async () => f?.pg.close());
describe("atomic snapshot exports and action history", () => {
  it("records final selected rows, actor, time, data version and exact downloadable bytes", async () => {
    const receipt = await createScenarioExport(
      "a",
      "owner",
      command,
      f.db,
      screenSelection.now,
    );
    expect(receipt).toMatchObject({
      exportId,
      actorId: "owner",
      createdAt: screenSelection.now.toISOString(),
      kind: "reprice",
    });
    const file = await readScenarioExportFile(
      "a",
      exportId,
      receipt.files[0].id,
      f.db,
    );
    expect(file.content.startsWith("\uFEFF")).toBe(true);
    const [action] = (
      await f.pg.query<{ action: string; context: any; after: any }>(
        `SELECT action,context,after FROM "MerchandisingAction" WHERE id=$1`,
        [receipt.actionId],
      )
    ).rows;
    expect(action.action).toBe("reprice");
    expect(action.context.dataVersion).toMatchObject({
      snapshotId,
      inputSetId: inputsId,
      calculationVersion: 1,
    });
    expect(action.after.rows).toHaveLength(file.rowCount);
    expect(action.after.files[0].content).toBe(file.content);
    expect(action.after.receipt.files[0]).not.toHaveProperty("content");
  });
  it("replays retries including changed pagination without a duplicate record, even after live source changes", async () => {
    const first = await createScenarioExport("a", "owner", command, f.db);
    await f.pg.exec(
      `UPDATE "InventorySnapshot" SET "retailPrice"=999,"costPrice"=999,quantity=999`,
    );
    const repeated = await createScenarioExport(
      "a",
      "owner",
      {
        ...command,
        scenario: { inputSetId: inputsId, page: 2, pageSize: 100 },
      },
      f.db,
    );
    expect(repeated).toEqual(first);
    expect(
      (
        await f.pg.query(
          `SELECT count(*)::int count FROM "MerchandisingAction" WHERE "idempotencyKey"=$1`,
          [`export:${exportId}`],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });
  it("rejects conflicting intent/actor, stale previews and cross-tenant access without leaking an artifact", async () => {
    await expect(
      createScenarioExport("a", "other", command, f.db),
    ).rejects.toMatchObject({ code: "EXPORT_ID_CONFLICT" });
    await expect(
      createScenarioExport(
        "a",
        "owner",
        { ...command, previewId: "0".repeat(64) },
        f.db,
      ),
    ).rejects.toMatchObject({ code: "EXPORT_ID_CONFLICT" });
    await expect(
      createScenarioExport(
        "a",
        "owner",
        {
          ...command,
          exportId: "33333333-3333-4333-8333-333333333333",
          previewId: "0".repeat(64),
        },
        f.db,
      ),
    ).rejects.toMatchObject({ code: "EXPORT_PREVIEW_MISMATCH" });
    const receipt = await createScenarioExport("a", "owner", command, f.db);
    await expect(
      readScenarioExportFile("b", exportId, receipt.files[0].id, f.db),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createScenarioExport(
        "b",
        "owner",
        { ...command, exportId: "44444444-4444-4444-8444-444444444444" },
        f.db,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("exports the whole eligible supplier set across pages and omits off-season/zero recommendations", async () => {
    const scenario = {
      snapshotId,
      mode: "brand",
      filters: { brandId: "brand-active" },
      pageSize: 1,
    };
    const preview = await getReorderingPreview("a", scenario, f.db);
    expect(preview.rows).toHaveLength(1);
    const receipt = await createScenarioExport(
      "a",
      "owner",
      {
        exportId: reorderId,
        kind: "reorder",
        previewId: preview.previewId,
        scenario,
      },
      f.db,
    );
    expect(receipt.files).toHaveLength(1);
    expect(receipt.files[0].rowCount).toBe(2);
    const file = await readScenarioExportFile(
      "a",
      reorderId,
      receipt.files[0].id,
      f.db,
    );
    expect(file.content).toContain('"39";"10";"390"');
    expect(file.content).not.toContain('"sku-risk"');
    const [action] = (
      await f.pg.query<{ after: any }>(
        `SELECT after FROM "MerchandisingAction" WHERE id=$1`,
        [receipt.actionId],
      )
    ).rows;
    expect(action.after.totals[0]).toMatchObject({
      quantity: preview.totals.quantity,
      purchaseAmount: preview.suppliers[0].purchaseAmount,
    });
  });
  it("rolls back a not-ready export and returns only bounded tenant-scoped history metadata", async () => {
    const scenario = {
      snapshotId,
      mode: "brand",
      filters: { brandId: "brand-active" },
      overrides: [{ skuId: "sku-oos", inTransitQuantity: "0" }],
    };
    const p = await getReorderingPreview("a", scenario, f.db);
    const before = (await readScenarioExportHistory("a", "reorder", f.db)).rows
      .length;
    await expect(
      createScenarioExport(
        "a",
        "owner",
        {
          exportId: "55555555-5555-4555-8555-555555555555",
          kind: "reorder",
          previewId: p.previewId,
          scenario,
          target: { supplierId: "missing", currency: "UAH" },
        },
        f.db,
      ),
    ).rejects.toMatchObject({ code: "EXPORT_NOT_READY" });
    const history = await readScenarioExportHistory("a", "reorder", f.db);
    expect(history.rows).toHaveLength(before);
    expect(history.rows[0].files[0]).not.toHaveProperty("content");
    expect(
      (await readScenarioExportHistory("b", "reorder", f.db)).rows,
    ).toEqual([]);
  });
});

it("publishes one audit record for concurrent retries of the same new ID", async () => {
  const fresh = {
    ...command,
    exportId: "88888888-8888-4888-8888-888888888888",
  };
  const [one, two] = await Promise.all([
    createScenarioExport("a", "owner", fresh, f.db),
    createScenarioExport("a", "owner", fresh, f.db),
  ]);
  expect(one).toEqual(two);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int count FROM "MerchandisingAction" WHERE "idempotencyKey"='export:88888888-8888-4888-8888-888888888888'`,
      )
    ).rows,
  ).toEqual([{ count: 1 }]);
});
