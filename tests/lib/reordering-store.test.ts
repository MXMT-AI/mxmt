import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createStockWorkspaceDb } from "../helpers/stock-workspace-db";
import { screenSelection } from "../helpers/screen-db";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import { getReorderingPreview } from "@/lib/reordering-store";
let fixture: Awaited<ReturnType<typeof createStockWorkspaceDb>>,
  snapshotId: string,
  actions: unknown;
beforeAll(async () => {
  fixture = await createStockWorkspaceDb();
  await fixture.pg.exec(
    `UPDATE "Brand" SET "supplierId"='supplier' WHERE id='brand-active'`,
  );
  await fixture.pg.exec(
    `UPDATE "InventorySnapshot" SET "qtyInTransit"=2,"inTransitVerifiedAt"='2026-10-25T05:00:00Z' WHERE "skuId"='sku-healthy' AND "snapshotDate"='2026-10-25';UPDATE "InventorySnapshot" SET "qtyInTransit"=100,"inTransitVerifiedAt"='2026-10-26T05:00:00Z' WHERE "skuId"='sku-risk' AND "snapshotDate"='2026-10-25'`,
  );
  snapshotId = (await createScreenSnapshot("a", screenSelection, fixture.db))
    .snapshotId;
  actions = (
    await fixture.pg.query(
      `SELECT count(*)::integer count FROM "MerchandisingAction"`,
    )
  ).rows;
}, 30000);
afterAll(async () => fixture?.pg.close());
const read = (extra: Record<string, unknown> = {}) =>
  getReorderingPreview("a", { snapshotId, ...extra }, fixture.db);
const confirm = ["sku-healthy", "sku-risk", "sku-oos"].map((skuId) => ({
  skuId,
  inTransitQuantity: "0",
}));
describe("frozen server-side reordering scenarios", () => {
  it("keeps unknown transit explicit and exposes off-season rows outside headline shortages", async () => {
    const r = await read();
    expect(r.rows.find((r) => r.skuId === "sku-oos")).toMatchObject({
      classification: "OOS",
      recommendedQuantity: null,
      inTransitSource: "UNKNOWN",
      state: "REVIEW",
      exportEligible: false,
    });
    expect(r.rows.find((r) => r.skuId === "sku-c")).toMatchObject({
      classification: "OFF_SEASON",
      recommendedQuantity: "0",
      state: "EXCLUDED",
    });
    expect(r.counts.shortageSkuCount).toBe(1);
    expect(r.counts.offSeasonSkuCount).toBe(1);
    expect(r.canExport).toBe(false);
    expect(r.capabilities).toEqual({
      preview: true,
      export: false,
      execute: false,
    });
  });
  it("uses production velocity's minimum-four-week exposure and an explicit scenario transit zero", async () => {
    const stored = await read({
      mode: "brand",
      filters: { brandId: "brand-active" },
    });
    expect(stored.rows.find((r) => r.skuId === "sku-healthy")).toMatchObject({
      inTransitQuantity: "2",
      inTransitSource: "VERIFIED_SNAPSHOT",
      recommendedQuantity: "3",
      purchaseAmount: "30",
    });
    expect(
      stored.rows.find((r) => r.skuId === "sku-risk")!.inTransitQuantity,
    ).toBeNull();
    const r = await read({
      filters: { brandId: "brand-active" },
      overrides: [{ skuId: "sku-oos", inTransitQuantity: "0" }],
    });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      skuId: "sku-oos",
      velocityPerWeek: "3",
      denominatorWeeks: "4",
      recommendedQuantity: "39",
      purchaseAmount: "390",
      inTransitSource: "SCENARIO_CONFIRMATION",
      exportEligible: true,
    });
    expect(r.canExport).toBe(true);
    expect(r.suppliers[0]).toMatchObject({
      supplierId: "supplier",
      quantity: "39",
      purchaseAmount: "390",
    });
  });
  it("supports brand mode, MOQ/global leads and totals before pagination", async () => {
    const options = {
      mode: "brand",
      filters: { brandId: "brand-active" },
      parameters: { moq: 6 },
      overrides: confirm,
    };
    const all = await read(options),
      page = await read({ ...options, pageSize: 1, page: 2 });
    expect(all.rows).toHaveLength(3);
    expect(
      all.rows.find((r) => r.skuId === "sku-risk")!.recommendedQuantity,
    ).toBe("0");
    expect(all.totals.quantity).toBe("48");
    expect(all.suppliers[0].purchaseAmount).toBe("480");
    expect(page.rows).toHaveLength(1);
    expect(page.totals).toEqual(all.totals);
    expect(page.currencies).toEqual(all.currencies);
    expect(page.suppliers).toEqual(all.suppliers);
    expect(page.previewId).toBe(all.previewId);
    const lead = await read({
      parameters: { leadDays: 60 },
      filters: { brandId: "brand-active" },
      overrides: confirm,
    });
    expect(lead.counts.shortageSkuCount).toBe(2);
    expect(lead.rows.find((r) => r.skuId === "sku-healthy")).toMatchObject({
      urgency: "RED",
      leadDays: 60,
      parameterSources: { leadDays: "SCENARIO" },
    });
  });
  it("cannot read foreign snapshots or override a SKU outside the selected brand", async () => {
    await expect(
      getReorderingPreview("b", { snapshotId }, fixture.db),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      read({
        mode: "brand",
        filters: { brandId: "brand-active" },
        overrides: [{ skuId: "sku-a", inTransitQuantity: "0" }],
      }),
    ).rejects.toMatchObject({ code: "REORDERING_OVERRIDE_INELIGIBLE" });
  });
  it("keeps original stock, costs, terms, names and transit after live changes, without actions or publication writes", async () => {
    const options = {
        mode: "brand",
        filters: { brandId: "brand-active" },
        overrides: confirm,
      },
      before = await read(options),
      configCount = (
        await fixture.pg.query(
          `SELECT count(*)::integer count FROM "MerchandisingConfig"`,
        )
      ).rows;
    await fixture.pg.exec(
      `UPDATE "InventorySnapshot" SET quantity=999,"costPrice"=999,"qtyInTransit"=999,"inTransitVerifiedAt"='2026-10-25T05:00:00Z';UPDATE "Supplier" SET name='Changed',"leadTimeDays"=999,moq=99;UPDATE "Brand" SET name='Changed' WHERE id='brand-active';UPDATE "OrderLine" SET "signedQuantity"=999`,
    );
    expect(await read(options)).toEqual(before);
    expect(
      (
        await fixture.pg.query(
          `SELECT count(*)::integer count FROM "MerchandisingConfig"`,
        )
      ).rows,
    ).toEqual(configCount);
    expect(
      (
        await fixture.pg.query(
          `SELECT count(*)::integer count FROM "MerchandisingAction"`,
        )
      ).rows,
    ).toEqual(actions);
  });
  it("rejects incomplete materialized inputs instead of issuing a partial order list", async () => {
    await fixture.pg.query(
      `DELETE FROM "MerchandisingScreenSku" WHERE "snapshotId"=$1 AND "skuId"='sku-oos'`,
      [snapshotId],
    );
    await expect(read()).rejects.toMatchObject({
      code: "INCOMPLETE_REORDERING_INPUTS",
      status: 409,
    });
  });
});
