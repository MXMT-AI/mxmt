import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createScreenDb } from "../helpers/screen-db";
import {
  shopifyJournal,
  type JournalScope,
} from "@/lib/connectors/shopify/journal";
import type { SqlDatabase } from "@/lib/connectors/database";
let f: Awaited<ReturnType<typeof createScreenDb>>;
const limit = 128 * 1024 * 1024;
async function run(id: string): Promise<JournalScope> {
  await f.pg.query(
    `INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES ($1,'a','journal-source','MANUAL','PENDING',$1,now(),now())`,
    [id],
  );
  return {
    tenantId: "a",
    sourceId: "journal-source",
    revision: 1,
    importRunId: id,
    db: f.db,
  };
}
const totals = async (runId: string) =>
  (
    await f.pg.query<{ bytes: number; pages: number }>(
      `SELECT "connectorJournalBytes" bytes,"connectorJournalPages" pages FROM "DataImportRun" WHERE id=$1`,
      [runId],
    )
  ).rows[0];
const bytes = async (value: unknown) =>
  (
    await f.pg.query<{ bytes: number }>(
      `SELECT octet_length($1::jsonb::text)::int bytes`,
      [JSON.stringify(value)],
    )
  ).rows[0].bytes;
beforeAll(async () => {
  f = await createScreenDb();
  await f.pg.exec(
    `INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('journal-source','a','SHOPIFY','journal.myshopify.com',now());INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId",provider,"accountHost","encryptedConfig","updatedAt") VALUES ('journal-connection','a','journal-source','shopify','journal.myshopify.com','unused-test-credentials',now());`,
  );
  await run("legacy-pages");
  await run("legacy-empty");
  await f.pg.query(
    `INSERT INTO "DataSourceRecord" (id,"tenantId","sourceId","importRunId",resource,"externalId",payload,"payloadHash","observedAt") VALUES ('legacy1','a','journal-source','legacy-pages','shopify-query','1:a',$1::jsonb,'test',now()),('legacy2','a','journal-source','legacy-pages','shopify-query','1:b',$2::jsonb,'test',now()),('legacy-other','a','journal-source','legacy-pages','orders','other',$1::jsonb,'test',now())`,
    [
      JSON.stringify({
        title: "Український запис",
        nested: { values: [1, 2, 3] },
      }),
      JSON.stringify({ empty: true }),
    ],
  );
  // Recreate the pre-change schema to execute the real migration against existing pages.
  await f.pg.exec(
    `ALTER TABLE "DataImportRun" DROP COLUMN "connectorJournalBytes", DROP COLUMN "connectorJournalPages";`,
  );
  await f.pg.exec(
    await readFile(
      new URL(
        "../../prisma/migrations/20261027020000_connector_journal_counters/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => await f?.pg.close());
it("backfills exact JSONB text bytes once and leaves unrelated or empty runs at zero", async () => {
  const expected = (
    await f.pg.query<{ bytes: number; n: number }>(
      `SELECT SUM(octet_length(payload::text))::int bytes,count(*)::int n FROM "DataSourceRecord" WHERE "importRunId"='legacy-pages' AND resource='shopify-query'`,
    )
  ).rows[0];
  expect(await totals("legacy-pages")).toEqual({
    bytes: expected.bytes,
    pages: expected.n,
  });
  expect(await totals("legacy-empty")).toEqual({ bytes: 0, pages: 0 });
  expect(
    (
      await f.pg.query(
        `SELECT "connectorJournalBytes","connectorJournalPages" FROM "DataImportRun" WHERE id='inventory-run'`,
      )
    ).rows,
  ).toEqual([{ connectorJournalBytes: 0, connectorJournalPages: 0 }]);
});
it("counts only inserted pages using database serialized bytes and keeps immutable retries free", async () => {
  const scope = await run("counted"),
    journal = shopifyJournal(scope),
    value = { name: "Склад", numbers: [1, 2, 3], nested: { enabled: true } },
    size = await bytes(value);
  expect(size).toBeGreaterThan(Buffer.byteLength(JSON.stringify(value)));
  await journal.put("page", value);
  expect(await totals("counted")).toEqual({ bytes: size, pages: 1 });
  await journal.put("page", { changed: true });
  expect(await journal.get("page")).toEqual(value);
  expect(await totals("counted")).toEqual({ bytes: size, pages: 1 });
  await journal.put("page2", value);
  expect(await totals("counted")).toEqual({ bytes: size * 2, pages: 2 });
});
it("preserves the 128 MiB serialized-text boundary and allows replay at the limit", async () => {
  const scope = await run("byte-limit"),
    journal = shopifyJournal(scope),
    value = { unicode: "Ї", nested: { values: [1, 2] } },
    size = await bytes(value);
  await f.pg.query(
    `UPDATE "DataImportRun" SET "connectorJournalBytes"=$1 WHERE id='byte-limit'`,
    [limit - size],
  );
  await journal.put("last", value);
  expect(await totals("byte-limit")).toEqual({ bytes: limit, pages: 1 });
  await journal.put("last", value);
  await expect(journal.put("overflow", {})).rejects.toMatchObject({
    code: "RESPONSE_TOO_LARGE",
  });
  expect(await journal.get("overflow")).toBeNull();
  expect(await totals("byte-limit")).toEqual({ bytes: limit, pages: 1 });
});
it("rejects page 10001, keeps duplicate replay valid, and isolates other runs and tenants", async () => {
  const scope = await run("page-limit"),
    journal = shopifyJournal(scope);
  await f.pg.query(
    `UPDATE "DataImportRun" SET "connectorJournalPages"=9999 WHERE id='page-limit'`,
  );
  await journal.put("last", {});
  expect((await totals("page-limit")).pages).toBe(10000);
  await journal.put("last", {});
  await expect(journal.put("overflow", {})).rejects.toMatchObject({
    code: "RESPONSE_TOO_LARGE",
  });
  expect(
    await shopifyJournal({ ...scope, tenantId: "b" }).get("last"),
  ).toBeNull();
  await expect(
    shopifyJournal({ ...scope, tenantId: "b" }).put("foreign", {}),
  ).rejects.toThrow("CONNECTOR_CONFIG_CHANGED");
  const other = shopifyJournal(await run("separate-run"));
  await other.put("page", {});
  expect((await totals("separate-run")).pages).toBe(1);
});
it("rolls back both the inserted page and counters if the atomic counter update fails", async () => {
  const scope = await run("rollback");
  const db: SqlDatabase = {
    ...f.db,
    $transaction: (cb) =>
      f.db.$transaction((tx) =>
        cb({
          ...tx,
          $executeRaw: async (q: Prisma.Sql) => {
            if (q.text.startsWith('UPDATE "DataImportRun"'))
              throw new Error("synthetic counter write failure");
            return tx.$executeRaw(q);
          },
        }),
      ),
  };
  await expect(
    shopifyJournal({ ...scope, db }).put("page", {}),
  ).rejects.toThrow("synthetic counter write failure");
  expect(await shopifyJournal(scope).get("page")).toBeNull();
  expect(await totals("rollback")).toEqual({ bytes: 0, pages: 0 });
});
it("serializes competing writes at the run limit and does not double charge concurrent duplicate puts", async () => {
  const scope = await run("competing"),
    journal = shopifyJournal(scope),
    size = await bytes({});
  await f.pg.query(
    `UPDATE "DataImportRun" SET "connectorJournalBytes"=$1 WHERE id='competing'`,
    [limit - size],
  );
  const result = await Promise.allSettled([
    journal.put("a", {}),
    journal.put("b", {}),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(await totals("competing")).toEqual({ bytes: limit, pages: 1 });
  const duplicateScope = await run("duplicates"),
    duplicates = shopifyJournal(duplicateScope);
  await Promise.all([duplicates.put("same", {}), duplicates.put("same", {})]);
  expect(await totals("duplicates")).toEqual({ bytes: size, pages: 1 });
});
