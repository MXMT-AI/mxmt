import { beforeAll, afterAll, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createDataQualityDb } from "../helpers/data-quality-db";
import { getProductQuality } from "@/lib/product-quality";
import { getSalesDriveIssues } from "@/lib/salesdrive-issues";
let f: Awaited<ReturnType<typeof createDataQualityDb>>;
beforeAll(async () => {
  f = await createDataQualityDb();
}, 30000);
afterAll(async () => f?.pg.close());
it("reconciles the specified stock examples and deduplicates overlapping issue totals", async () => {
  const d = await getProductQuality("a", {}, f.db);
  expect(d.summary).toContainEqual(
    expect.objectContaining({
      code: "MISSING_BRAND",
      currency: "UAH",
      quantity: "330.0000",
      costValue: "433000.0000",
      skuCount: 1,
    }),
  );
  expect(d.summary).toContainEqual(
    expect.objectContaining({
      code: "ZERO_PRICE_WITH_STOCK",
      quantity: "52.0000",
      costValue: "416000.0000",
      skuCount: 1,
    }),
  );
  expect(d.affectedStock).toEqual([
    expect.objectContaining({
      currency: "UAH",
      skuCount: 2,
      quantity: "382.0000",
      costValue: "849000.0000",
    }),
  ]);
  expect(d.summary.reduce((n, s) => n + s.skuCount, 0)).toBeGreaterThan(2);
  const selected = await getProductQuality(
    "a",
    { code: "MISSING_BRAND" },
    f.db,
  );
  expect(selected.rows.some((r) => r.id === "unbranded")).toBe(true);
  expect(selected.rows.some((r) => r.id === "zero-price")).toBe(false);
  expect(selected.rows.find((r) => r.id === "unbranded")).toMatchObject({
    sourceId: "source",
    sourceRecordKey: "raw:unbranded",
    importRunId: "inventory-run",
    issues: expect.arrayContaining([
      "MISSING_CATEGORY",
      "OWNERSHIP_UNKNOWN",
      "SUPPLIER_UNKNOWN",
    ]),
  });
  expect((await getProductQuality("b", {}, f.db)).affectedStock).toEqual([]);
});
it("keeps unknown value explicit and diagnoses effective ownership/commission/supplier defaults", async () => {
  await f.pg.exec(
    `UPDATE "Sku" SET "ownershipOverride"='CONSIGNMENT',"commissionRateOverride"=NULL WHERE id='unbranded'; UPDATE "InventorySnapshot" SET "costPrice"=0,"costValue"=0 WHERE id='unbranded-stock'; UPDATE "Supplier" SET "termsVerifiedAt"=NULL,"leadTimeDays"=NULL WHERE id='supplier'`,
  );
  const d = await getProductQuality("a", {}, f.db);
  expect(d.rows.find((r) => r.id === "unbranded")?.issues).toContain(
    "COMMISSION_UNKNOWN",
  );
  expect(d.rows.find((r) => r.id === "zero-price")?.issues).toEqual(
    expect.arrayContaining([
      "SUPPLIER_TERMS_UNVERIFIED",
      "SUPPLIER_LEAD_TIME_MISSING",
      "IN_TRANSIT_UNKNOWN",
    ]),
  );
  expect(d.affectedStock[0]).toMatchObject({
    costValue: "416000.0000",
    unknownValueCount: 1,
  });
});
it("bounds and isolates ImportIssue lineage without disclosing raw payloads or messages", async () => {
  const a = await getSalesDriveIssues(
    "a",
    { page: 1, pageSize: 25, skuId: "unbranded" },
    f.db,
  );
  expect(a.rows).toHaveLength(1);
  expect(a.rows[0]).toMatchObject({
    sourceId: "source",
    context: { skuId: "unbranded", sourceRecordKey: "raw:unbranded" },
  });
  expect(JSON.stringify(a)).not.toMatch(/secret|private|customerPhone|apiKey/);
  expect(
    (await getSalesDriveIssues("b", { page: 1, pageSize: 25 }, f.db)).rows,
  ).toEqual([]);
  expect(
    (await getSalesDriveIssues("a", { page: 2, pageSize: 25 }, f.db)).rows,
  ).toEqual([]);
});
it("clears live diagnostics after source correction without altering historical evidence", async () => {
  await f.pg.exec(
    `UPDATE "Sku" SET "brandId"='brand-a',"categoryId"='cat-a',"ownershipOverride"='OWN' WHERE id='unbranded'; UPDATE "InventorySnapshot" SET "retailPrice"=10000,"costPrice"=8000,"costValue"=416000 WHERE id='zero-stock'`,
  );
  const d = await getProductQuality("a", {}, f.db);
  expect(d.rows.find((r) => r.id === "unbranded")?.issues).not.toContain(
    "MISSING_BRAND",
  );
  expect(d.summary.some((s) => s.code === "ZERO_PRICE_WITH_STOCK")).toBe(false);
  expect(
    (await getSalesDriveIssues("a", { page: 1, pageSize: 25 }, f.db)).pagination
      .totalRows,
  ).toBe(1);
});
it("omits resolved unmatched sales while retaining current unlinked source identifiers", async () => {
  const line = (
    await f.pg.query<{
      externalOrderId: string;
      externalLineId: string;
      id: string;
    }>(
      `SELECT id,"externalOrderId","externalLineId" FROM "OrderLine" WHERE "tenantId"='a' AND "eventKey"='current' LIMIT 1`,
    )
  ).rows[0];
  await f.pg.query(`UPDATE "OrderLine" SET "skuId"=NULL WHERE id=$1`, [
    line.id,
  ]);
  await f.pg.query(
    `INSERT INTO "ImportIssue" (id,"tenantId","importRunId",code,severity,message,context,"entityKey") SELECT 'unmatched','a',"importRunId",'SKU_ALIAS_UNRESOLVED','WARNING','warning',jsonb_build_object('sourceSku',"sourceSku",'orderId',"externalOrderId",'sourceRecordKey',"sourceRecordKey"),'order:'||"externalOrderId"||':'||"externalLineId" FROM "OrderLine" WHERE id=$1`,
    [line.id],
  );
  expect(
    (
      await getSalesDriveIssues(
        "a",
        { page: 1, pageSize: 25, code: "SKU_ALIAS_UNRESOLVED" },
        f.db,
      )
    ).rows,
  ).toHaveLength(1);
  await f.pg.query(`UPDATE "OrderLine" SET "skuId"='sku-a' WHERE id=$1`, [
    line.id,
  ]);
  expect(
    (
      await getSalesDriveIssues(
        "a",
        { page: 1, pageSize: 25, code: "SKU_ALIAS_UNRESOLVED" },
        f.db,
      )
    ).rows,
  ).toHaveLength(0);
});
it("keeps invalid ages/negative stock visible while excluding unavailable quantities and separating currencies", async () => {
  await f.pg.exec(
    `UPDATE "Sku" SET "firstReceiptAt"='2030-01-01' WHERE id='unbranded'; UPDATE "InventorySnapshot" SET quantity=-1 WHERE id='unbranded-stock'; UPDATE "InventorySnapshot" SET currency='USD' WHERE id='zero-stock'`,
  );
  const d = await getProductQuality("a", {}, f.db);
  expect(d.rows.find((r) => r.id === "unbranded")?.issues).toEqual(
    expect.arrayContaining(["NEGATIVE_STOCK", "NEGATIVE_PRODUCT_AGE"]),
  );
  expect(d.affectedStock).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        currency: "UAH",
        quantity: null,
        unknownQuantityCount: 1,
      }),
      expect.objectContaining({
        currency: "USD",
        quantity: "52.0000",
        costValue: "416000.0000",
      }),
    ]),
  );
});
