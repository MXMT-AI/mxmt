import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import type { SqlClient, SqlDatabase } from "@/lib/connectors/database";
import { defaultClientSettings } from "@/lib/merchandising-settings";
import {
  getEffectiveSkuSettings,
  listMerchandisingSettings,
  readClientSettings,
  saveMerchandisingSettings,
} from "@/lib/merchandising-settings-store";
import { previewMerchandisingCalculations } from "@/lib/merchandising-policy";
import { enqueueOrderImport } from "@/lib/connectors/order-jobs";
import { storeOrder } from "@/lib/connectors/order-storage";
import { getProductQuality } from "@/lib/product-quality";
import { applyClientOrderSettings } from "@/lib/merchandising-order-policy";
import type { OrderDto } from "@/lib/connectors/contract";
let pg: PGlite, db: SqlDatabase;
function bridge(client: Pick<PGlite, "query">): SqlClient {
  return {
    $queryRaw: async <T>(q: Prisma.Sql) =>
      (await client.query(q.text, q.values)).rows as T,
    $executeRaw: async (q) =>
      (await client.query(q.text, q.values)).affectedRows ?? 0,
  };
}
beforeAll(async () => {
  pg = new PGlite();
  const root = new URL("../../prisma/migrations/", import.meta.url);
  for (const name of (await readdir(root, { withFileTypes: true }))
    .filter((x) => x.isDirectory())
    .map((x) => x.name)
    .sort())
    await pg.exec(
      await readFile(new URL(`${name}/migration.sql`, root), "utf8"),
    );
  db = {
    ...bridge(pg),
    $transaction: async (cb) => pg.transaction((tx) => cb(bridge(tx))),
  };
  await pg.exec(`INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','A','a',now()),('b','B','b',now());
 INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('owner-a','a@example.test','test','Owner','ADMIN','a',now()),('owner-b','b@example.test','test','Owner','ADMIN','b',now());
 INSERT INTO "Brand" (id,"tenantId",name) VALUES ('brand-a','a','A'),('brand-b','b','B');
 INSERT INTO "Category" (id,"tenantId",key,name,"updatedAt") VALUES ('category-a','a','test','Category',now());
 INSERT INTO "Supplier" (id,"tenantId",key,name,"updatedAt") VALUES ('supplier-a','a','test','Supplier A',now()),('supplier-b','b','test','Supplier B',now());
 INSERT INTO "Sku" (id,"tenantId",sku,name,category,"brandId","categoryId") VALUES ('sku-a','a','SKU','Item','Category','brand-a','category-a'),('unbranded-a','a','UNBRANDED','Unbranded','',NULL,'category-a');`);
  await pg.exec(`INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('source-a','a','SALESDRIVE','demo.salesdrive.me',now());
 INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId","accountHost","encryptedConfig","updatedAt") VALUES ('connection-a','a','source-a','demo.salesdrive.me','test',now());
 INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES ('run-a','a','source-a','MANUAL','SUCCESS','fixture',now(),now());
 INSERT INTO "ConnectorRecalculation" ("importRunId","tenantId","sourceId","inputProvenance") VALUES ('run-a','a','source-a','{}');`);
}, 30000);
afterAll(async () => pg?.close());
describe("versioned tenant settings", () => {
  it("reads documented defaults without persisting or confirming customer mappings", async () => {
    expect(await readClientSettings("a", db)).toMatchObject({
      revision: 0,
      values: { minMarginPct: 45, saleStatusesVerified: false },
    });
    expect(
      (await pg.query('SELECT count(*)::int n FROM "MerchandisingConfig"'))
        .rows,
    ).toEqual([{ n: 0 }]);
  });
  it("persists revisions and audit, rejecting stale edits atomically", async () => {
    const v = {
      ...defaultClientSettings(),
      minMarginPct: 50,
      planCurrency: "UAH",
      monthlyPlans: { "2026-10": "2000000" },
    };
    const saved = await saveMerchandisingSettings(
      "a",
      "owner-a",
      "client",
      null,
      0,
      v,
      db,
    );
    expect(saved.revision).toBe(1);
    await expect(
      saveMerchandisingSettings("a", "owner-a", "client", null, 0, v, db),
    ).rejects.toThrow("SETTINGS_CONFLICT");
    expect(await readClientSettings("a", db)).toMatchObject({
      revision: 1,
      values: { minMarginPct: 50 },
    });
    expect(
      (await pg.query('SELECT count(*)::int n FROM "MerchandisingAction"'))
        .rows,
    ).toEqual([{ n: 1 }]);
  });
  it("resolves brand terms and explicit SKU overrides with no own-stock fallback", async () => {
    await saveMerchandisingSettings(
      "a",
      "owner-a",
      "brand",
      "brand-a",
      0,
      { ownership: "CONSIGNMENT", commissionPct: 40, supplierId: "supplier-a" },
      db,
    );
    let effective = await getEffectiveSkuSettings("a", "sku-a", db);
    expect(effective.policy).toMatchObject({
      ownership: "CONSIGNMENT",
      commissionRate: "0.40000000",
      leadDays: 30,
      coverDays: 60,
      moq: 1,
    });
    await saveMerchandisingSettings(
      "a",
      "owner-a",
      "sku",
      "sku-a",
      0,
      { ownershipOverride: "UNKNOWN", commissionPct: null, supplierId: null },
      db,
    );
    effective = await getEffectiveSkuSettings("a", "sku-a", db);
    expect(effective.policy.ownership).toBe("UNKNOWN");
    expect(
      previewMerchandisingCalculations(effective.policy, {
        revenue: "100",
        cost: "40",
        weeklyVelocity: "7",
        stock: "10",
        inTransit: "0",
        month: 1,
      }).grossProfit,
    ).toBeNull();
    await saveMerchandisingSettings(
      "a",
      "owner-a",
      "sku",
      "sku-a",
      1,
      { ownershipOverride: "OWN", commissionPct: null, supplierId: null },
      db,
    );
    expect(
      (await getEffectiveSkuSettings("a", "sku-a", db)).policy.ownership,
    ).toBe("OWN");
  });
  it("applies supplier and season settings to server calculations", async () => {
    await saveMerchandisingSettings(
      "a",
      "owner-a",
      "supplier",
      "supplier-a",
      0,
      { name: "Supplier A", leadDays: 30, coverDays: 60, moq: 6 },
      db,
    );
    let effective = await getEffectiveSkuSettings("a", "sku-a", db);
    const input = {
      revenue: "100",
      cost: "40",
      weeklyVelocity: "7",
      stock: "10",
      inTransit: "5",
      month: 1,
    };
    expect(
      previewMerchandisingCalculations(effective.policy, input).orderQuantity,
    ).toBe("78");
    await saveMerchandisingSettings(
      "a",
      "owner-a",
      "category",
      "category-a",
      0,
      { seasonMonths: [6, 7, 8] },
      db,
    );
    effective = await getEffectiveSkuSettings("a", "sku-a", db);
    expect(
      previewMerchandisingCalculations(effective.policy, input).orderQuantity,
    ).toBe("0");
    expect(effective.configIds).toMatchObject({
      "settings:supplier:supplier-a": expect.any(String),
      "settings:category:category-a": expect.any(String),
    });
  });
  it("blocks cross-tenant references and rolls metadata back if audit actor is invalid", async () => {
    await expect(
      saveMerchandisingSettings(
        "a",
        "owner-a",
        "brand",
        "brand-a",
        1,
        { ownership: "OWN", commissionPct: null, supplierId: "supplier-b" },
        db,
      ),
    ).rejects.toThrow("INVALID_SETTINGS");
    await expect(
      saveMerchandisingSettings(
        "a",
        "owner-b",
        "brand",
        "brand-a",
        1,
        { ownership: "OWN", commissionPct: null, supplierId: null },
        db,
      ),
    ).rejects.toMatchObject({ code: "23503" });
    expect(
      (await pg.query("SELECT ownership FROM \"Brand\" WHERE id='brand-a'"))
        .rows,
    ).toEqual([{ ownership: "CONSIGNMENT" }]);
    await expect(getEffectiveSkuSettings("b", "sku-a", db)).rejects.toThrow(
      "ENTITY_NOT_FOUND",
    );
  });
  it("creates suppliers idempotently with a stable client creation key", async () => {
    const v = { name: "New supplier", leadDays: 30, coverDays: 60, moq: 1 },
      key = "11111111-1111-4111-8111-111111111111";
    const one = await saveMerchandisingSettings(
        "a",
        "owner-a",
        "supplier",
        null,
        0,
        v,
        db,
        { creationKey: key },
      ),
      two = await saveMerchandisingSettings(
        "a",
        "owner-a",
        "supplier",
        null,
        0,
        v,
        db,
        { creationKey: key },
      );
    expect(two).toEqual(one);
    expect(
      (
        await pg.query(
          "SELECT count(*)::int n FROM \"Supplier\" WHERE name='New supplier'",
        )
      ).rows,
    ).toEqual([{ n: 1 }]);
  });
  it("lists bounded tenant rows and publishes confirmed statuses into the next job checkpoint", async () => {
    const client = await readClientSettings("a", db);
    await saveMerchandisingSettings(
      "a",
      "owner-a",
      "client",
      null,
      client.revision,
      {
        ...client.values,
        saleStatuses: ["5", "60"],
        saleStatusesVerified: true,
        excludedChannels: ["38"],
      },
      db,
    );
    const job = await enqueueOrderImport("a", "INCREMENTAL", {}, db);
    expect(job.checkpoint.policy).toMatchObject({
      statuses: { "5": "SALE", "60": "SALE" },
      settings: { excludedChannels: ["38"], revision: 2 },
    });
    const list = await listMerchandisingSettings("a", "sku", 1, "SKU", db);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ id: "sku-a", revision: 2 });
    expect(
      (await listMerchandisingSettings("b", "brand", 1, "", db)).items.map(
        (x) => x.id,
      ),
    ).toEqual(["brand-b"]);
    expect(
      (
        await pg.query(
          'SELECT state,"inputProvenance"->>\'settingsConfigId\' config FROM "ConnectorRecalculation"',
        )
      ).rows[0],
    ).toMatchObject({ state: "WAITING_ENGINE", config: expect.any(String) });
  });
  it("uses an explicit monobrand default for an unassigned SKU without altering tenant business model", async () => {
    const client = await readClientSettings("a", db);
    await saveMerchandisingSettings(
      "a",
      "owner-a",
      "client",
      null,
      client.revision,
      { ...client.values, profileMode: "MONOBRAND", monoBrandId: "brand-a" },
      db,
    );
    expect(
      (await getEffectiveSkuSettings("a", "unbranded-a", db)).policy.ownership,
    ).toBe("CONSIGNMENT");
  });
  it("excludes configured channels from components and requests replay only when filters change", async () => {
    const sourcePolicy = {
      statuses: { "5": "SALE" as const },
      amounts: {
        price: "gross_unit" as const,
        absoluteDiscount: "line" as const,
        currency: "UAH",
        cost: "unit" as const,
      },
    };
    const order: OrderDto = {
      externalId: "settings-order",
      observedAt: "2026-10-24T13:00:00Z",
      updatedAt: "2026-10-24T12:00:00Z",
      orderedAt: "2026-10-20",
      paidAt: "2026-10-21",
      statusId: "5",
      channelId: "38",
      raw: { id: "settings-order" },
      lines: [
        {
          externalLineId: "1",
          productId: null,
          sku: "SKU",
          quantity: "1",
          unitPrice: "100",
          discount: "0",
          discountUnit: "amount",
          costPrice: "40",
          commission: null,
          commissionUnit: "unknown",
        },
      ],
    };
    const scope = {
      tenantId: "a",
      sourceId: "source-a",
      importRunId: "run-a",
      timezone: "Europe/Kyiv",
    };
    const importCurrent = async () => {
      const c = await readClientSettings("a", db);
      await db.$transaction((tx) =>
        storeOrder(
          tx,
          scope,
          order,
          applyClientOrderSettings(sourcePolicy, c.values, {
            id: c.id!,
            revision: c.revision,
          }),
        ),
      );
    };
    await importCurrent();
    const excluded = await getProductQuality("a", {}, db);
    expect(excluded.components).toEqual([]);
    expect(excluded.normalizationReplayRequired).toBe(0);
    let c = await readClientSettings("a", db);
    await saveMerchandisingSettings(
      "a",
      "owner-a",
      "client",
      null,
      c.revision,
      { ...c.values, minMarginPct: 51 },
      db,
    );
    expect(
      (await getProductQuality("a", {}, db)).normalizationReplayRequired,
    ).toBe(0);
    c = await readClientSettings("a", db);
    await saveMerchandisingSettings(
      "a",
      "owner-a",
      "client",
      null,
      c.revision,
      { ...c.values, excludedChannels: [] },
      db,
    );
    expect(
      (await getProductQuality("a", {}, db)).normalizationReplayRequired,
    ).toBe(1);
    await importCurrent();
    const included = await getProductQuality("a", {}, db);
    expect(included.normalizationReplayRequired).toBe(0);
    expect(included.components).toContainEqual(
      expect.objectContaining({ revenue: "100.0000", lineCount: 1 }),
    );
  });
});
