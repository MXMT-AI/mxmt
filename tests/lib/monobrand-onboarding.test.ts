import {
  enqueueOrderImport,
  claimOrderJob,
  resumeOrderImport,
  getOrderImportProgress,
} from "@/lib/connectors/order-jobs";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createMonobrandDb } from "../helpers/monobrand-db";
import { screenSelection } from "../helpers/screen-db";
import { createMerchandisingBrand } from "@/lib/merchandising-brand";
import {
  readClientSettings,
  saveMerchandisingSettings,
} from "@/lib/merchandising-settings-store";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import { parseScreenQuery } from "@/lib/merchandising-screen-query";
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
import {
  requestSyncCycle,
  getSyncProgress,
} from "@/lib/connectors/sync-cycles";
let f: Awaited<ReturnType<typeof createMonobrandDb>>,
  a: string,
  b: string,
  inputs: string;
beforeAll(async () => {
  f = await createMonobrandDb();
  a = (await createScreenSnapshot("a", screenSelection, f.db)).snapshotId;
  b = (await createScreenSnapshot("b", screenSelection, f.db)).snapshotId;
  inputs = (await createRepricingInputs("b", b, f.db, screenSelection.now))
    .inputSetId;
}, 30000);
afterAll(async () => f?.pg.close());
it("bootstraps primary brand identity idempotently without inheriting another client terms", async () => {
  expect(
    await createMerchandisingBrand("b", "owner-b", " bImBa ", f.db),
  ).toEqual(f.brand);
  const brandA = await createMerchandisingBrand("a", "owner", "Bimba", f.db);
  expect(brandA.id).not.toBe(f.brand.id);
  expect(
    (await f.pg.query(`SELECT ownership FROM "Brand" WHERE id=$1`, [brandA.id]))
      .rows,
  ).toEqual([{ ownership: "UNKNOWN" }]);
  await expect(
    createMerchandisingBrand("b", "owner-b", "\ninvalid", f.db),
  ).rejects.toThrow();
  const before = (
    await f.pg.query(`SELECT count(*)::int n FROM "Brand" WHERE "tenantId"='b'`)
  ).rows;
  await expect(
    createMerchandisingBrand("b", "owner", "Foreign actor", f.db),
  ).rejects.toThrow();
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "Brand" WHERE "tenantId"='b'`,
      )
    ).rows,
  ).toEqual(before);
});
it("uses independent profile, ownership and plan settings while preserving the multibrand client", async () => {
  const aa = await readClientSettings("a", f.db),
    bb = await readClientSettings("b", f.db);
  expect(aa.values).toMatchObject({
    profileMode: "MULTIBRAND",
    deadDays: 90,
    monthlyPlans: {},
  });
  expect(bb.values).toMatchObject({
    profileMode: "MONOBRAND",
    monoBrandId: f.brand.id,
    deadDays: 60,
    monthlyPlans: { "2026-09": "1200" },
  });
});
it.each(["overview", "sales", "stock", "repricing", "reordering"] as const)(
  "serves the %s screen without a brand-level drill-down even for an old link",
  async (screen) => {
    const q = parseScreenQuery(
      new URLSearchParams({
        snapshotId: b,
        groupBy: "brand",
        brandId: "foreign-brand",
      }),
      screen,
    );
    const d = await getMerchandisingScreen(
      "b",
      screen,
      q,
      f.db,
      screenSelection.now,
    );
    expect(d.context.profileMode).toBe("MONOBRAND");
    expect(d.table?.columns.some((c) => c.key === "brandId")).not.toBe(true);
    expect(
      d.sales?.filters.brandId ?? d.stock?.filters.brandId ?? null,
    ).toBeNull();
    if (screen === "sales") expect(d.workspace?.monobrand).toBe(true);
    if (screen === "stock") {
      expect(d.stockWorkspace?.monobrand).toBe(true);
      expect(
        d.stockWorkspace?.byCurrency.every((c) => !c.brands.rows.length),
      ).toBe(true);
    }
    if (screen === "overview") {
      expect(
        d.overview?.byCurrency
          .flatMap((c) => c.contributors)
          .some((c) => c.name === "Bimba"),
      ).toBe(false);
    }
    await expect(
      getMerchandisingScreen("a", screen, q, f.db, screenSelection.now),
    ).rejects.toThrow();
  },
);
it("validates monobrand actions and exports complete selected rows with isolated audit/files", async () => {
  const scenario = { inputSetId: inputs },
    p = await getRepricingPreview("b", scenario, f.db);
  expect(p.canExport).toBe(true);
  const receipt = await createScenarioExport(
    "b",
    "owner-b",
    {
      exportId: "50505050-5050-4050-8050-505050505050",
      kind: "reprice",
      previewId: p.previewId,
      scenario,
    },
    f.db,
  );
  expect(receipt.files[0].rowCount).toBe(p.totals.skuCount);
  expect(
    (
      await readScenarioExportFile(
        "b",
        receipt.exportId,
        receipt.files[0].id,
        f.db,
      )
    ).content,
  ).toContain("Bimba");
  await expect(
    readScenarioExportFile("a", receipt.exportId, receipt.files[0].id, f.db),
  ).rejects.toMatchObject({ status: 404 });
  expect((await readScenarioExportHistory("a", "reprice", f.db)).rows).toEqual(
    [],
  );
  await expect(getRepricingPreview("a", scenario, f.db)).rejects.toThrow();
  const reorder = await getReorderingPreview(
    "b",
    { snapshotId: b, mode: "all" },
    f.db,
  );
  expect(reorder.canExport).toBe(true);
  const reorderReceipt = await createScenarioExport(
    "b",
    "owner-b",
    {
      exportId: "50505050-5050-4050-8050-505050505051",
      kind: "reorder",
      previewId: reorder.previewId,
      scenario: { snapshotId: b, mode: "all" },
    },
    f.db,
  );
  expect(reorderReceipt.files.length).toBeGreaterThan(0);
  await expect(
    readScenarioExportFile(
      "a",
      reorderReceipt.exportId,
      reorderReceipt.files[0].id,
      f.db,
    ),
  ).rejects.toMatchObject({ status: 404 });
  expect((await readScenarioExportHistory("a", "reorder", f.db)).rows).toEqual(
    [],
  );
  expect(reorder.mode).toBe("all");
  expect(reorder.pagination.totalRows).toBe(4);
  expect(
    (
      await getReorderingPreview(
        "b",
        { snapshotId: b, mode: "brand", filters: { brandId: "foreign" } },
        f.db,
      )
    ).previewId,
  ).toBe(reorder.previewId);
  await expect(
    getReorderingPreview("a", { snapshotId: b, mode: "all" }, f.db),
  ).rejects.toThrow();
});
it("isolates sync intent/progress and does not resume another tenant jobs", async () => {
  const id = await requestSyncCycle("b", "orders", f.db);
  expect((await getSyncProgress("b", f.db)).cycle?.id).toBe(id);
  expect((await getSyncProgress("a", f.db)).cycle).toBeNull();
  expect(
    (
      await f.pg.query(
        `SELECT "tenantId","sourceId" FROM "ConnectorSyncCycle" WHERE id=$1`,
        [id],
      )
    ).rows,
  ).toEqual([{ tenantId: "b", sourceId: "bimba:source" }]);
  await f.pg.exec(
    `UPDATE "ConnectorSyncJob" SET state='PAUSED' WHERE id='orders-job'`,
  );
  expect(await resumeOrderImport("b", f.db)).toBe(0);
  expect(await claimOrderJob(f.db, "b")).toBeNull();
  const job = await enqueueOrderImport(
    "b",
    "INCREMENTAL",
    { requestKey: "bimba-isolation" },
    f.db,
    screenSelection.now,
  );
  expect((await claimOrderJob(f.db, "b"))?.id).toBe(job.id);
  expect((await getOrderImportProgress("b", f.db))?.id).toBe(job.id);
  expect((await getOrderImportProgress("a", f.db))?.state).toBe("PAUSED");
  const aa = await readClientSettings("a", f.db),
    bb = await readClientSettings("b", f.db);
  await saveMerchandisingSettings(
    "b",
    "owner-b",
    "client",
    null,
    bb.revision,
    { ...bb.values, excludedChannels: ["2"], saleStatuses: ["10"] },
    f.db,
  );
  await saveMerchandisingSettings(
    "b",
    "owner-b",
    "category",
    "bimba:cat-a",
    0,
    { seasonMonths: [6, 7, 8] },
    f.db,
  );
  expect(
    (await f.pg.query(`SELECT "seasonMonths" FROM "Category" WHERE id='cat-a'`))
      .rows,
  ).toEqual([{ seasonMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }]);
  expect(await readClientSettings("a", f.db)).toEqual(aa);
});
