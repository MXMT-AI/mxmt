import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { Prisma } from "@prisma/client";
import { createMerchandisingDb } from "../helpers/merchandising-db";
import { linkRetainedCatalogFacts } from "@/lib/connectors/catalog-linking";

let f: Awaited<ReturnType<typeof createMerchandisingDb>>;
beforeAll(async () => {
  f = await createMerchandisingDb();
  await f.pg.exec(`
    INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','A','a',now()),('b','B','b',now());
    INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('a1','a','SALESDRIVE','a1',now()),('a2','a','SALESDRIVE','a2',now()),('b1','b','SALESDRIVE','b1',now());
    INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt")
      SELECT id,"tenantId",id,'MANUAL','SUCCESS',id,current_date,now() FROM "DataSource";
    INSERT INTO "Sku" (id,"tenantId",sku,name,category) VALUES ('s1','a','one','One','Test'),('s2','a','two','Two','Test');
    CREATE TEMP TABLE mxmt_catalog_stage ("externalId" text,article text,"skuId" text);
    INSERT INTO mxmt_catalog_stage VALUES ('p1','one','s1'),('p2','two','s2'),('p3','shared','s1'),('p4','shared','s2');
    INSERT INTO "Receipt" (id,"tenantId","sourceId","importRunId","externalId","sourceRecordKey","observedAt","updatedAt")
      SELECT id,"tenantId",id,id,id,'fixture',now(),now() FROM "DataSource";
  `);
  const cases = [
    ["id-only", "p1", null, null],
    ["sku-only", null, "one", null],
    ["same", "p1", "one", null],
    ["conflict", "p1", "two", null],
    ["ambiguous", null, "shared", null],
    ["missing", "absent", "absent", null],
    ["already", "p1", "one", "s2"],
  ];
  for (const [source, tenant] of [["a1", "a"], ["a2", "a"], ["b1", "b"]]) {
    for (const [key, product, sku, linked] of cases) {
      if (tenant === "b" && linked) continue;
      const id = `${source}-${key}`;
      await f.pg.query(`INSERT INTO "OrderLine" (id,"tenantId","sourceId","importRunId","externalOrderId","externalLineId","externalProductId","sourceSku","skuId",quantity,"sourceRecordKey","observedAt","updatedAt") VALUES ($1,$2,$3,$3,$1,'line',$4,$5,$6,1,'fixture',now(),now())`, [id, tenant, source, product, sku, linked]);
      await f.pg.query(`INSERT INTO "ReceiptLine" (id,"tenantId","receiptId","externalLineId","externalProductId","sourceSku","skuId",quantity) VALUES ($1,$2,$3,$1,$4,$5,$6,1)`, [id, tenant, source, product, sku, linked]);
    }
  }
}, 30000);
afterAll(async () => f?.pg.close());

it("links only unique candidates, preserves conflicts and existing links, and isolates both kinds of facts by tenant/source", async () => {
  const link = () => f.db.$transaction(tx => linkRetainedCatalogFacts(tx, { tenantId: "a", sourceId: "a1", importRunId: "a1", timezone: "Europe/Kyiv" }));
  await link();
  for (const relation of ["OrderLine", "ReceiptLine"]) {
    const rows = (await f.pg.query<{ id: string; skuId: string | null }>(`SELECT id,"skuId" FROM "${relation}" ORDER BY id`)).rows;
    for (const row of rows) {
      const expected = row.id.endsWith("-already") ? "s2"
        : ["a1-id-only", "a1-sku-only", "a1-same"].includes(row.id) ? "s1" : null;
      expect(row.skuId, `${relation}/${row.id}`).toBe(expected);
    }
  }
  const before = await f.db.$queryRaw(Prisma.sql`SELECT id,"skuId" FROM "OrderLine" ORDER BY id`);
  await link();
  expect(await f.db.$queryRaw(Prisma.sql`SELECT id,"skuId" FROM "OrderLine" ORDER BY id`)).toEqual(before);
});
