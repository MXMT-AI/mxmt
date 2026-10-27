import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createScreenDb } from "../helpers/screen-db";
import { csvOptions, csvFile, csvOrders } from "../fixtures/csv-connector";
import {
  previewCsv,
  csvImportAction,
  readCsvImport,
} from "@/lib/connectors/csv/store";
import { processCsvJob, type CsvJob } from "@/lib/connectors/csv/worker";
import { claimConnectorJob } from "@/lib/connectors/jobs";
import {
  selectConnectorSource,
  listConnectorSources,
} from "@/lib/connectors/source";
let f: Awaited<ReturnType<typeof createScreenDb>>;
beforeAll(async () => {
  vi.stubEnv(
    "CONNECTOR_ENCRYPTION_KEY",
    Buffer.alloc(32, 8).toString("base64"),
  );
  f = await createScreenDb();
}, 30000);
afterAll(async () => {
  await f?.pg.close();
  vi.unstubAllEnvs();
});
it("resolves first-import order lines by external product identity with blank or different source SKU, retaining ambiguous matches", async () => {
  const products = [
    {
      productId: "new-product",
      sku: "NEW",
      name: "New product",
      observedAt: "2026-08-01T00:00:00Z",
    },
    {
      productId: "other-product",
      sku: "OTHER",
      name: "Other product",
      observedAt: "2026-08-01T00:00:00Z",
    },
  ];
  const options = { ...csvOptions, history: null };
  const draft = await previewCsv(
    "a",
    "owner",
    null,
    options,
    [
      csvFile("products", products),
      csvFile(
        "stock",
        products.map((p) => ({
          productId: p.productId,
          observedAt: "2026-10-25T06:00:00Z",
          quantity: "5",
        })),
      ),
      csvFile("orders", [
        {
          ...csvOrders[0],
          orderId: "blank",
          productId: "new-product",
          sku: "",
        },
        {
          ...csvOrders[0],
          orderId: "different",
          productId: "new-product",
          sku: "old-code",
        },
        {
          ...csvOrders[0],
          orderId: "ambiguous",
          productId: "new-product",
          sku: "OTHER",
        },
      ]),
    ],
    f.db,
  );
  expect(draft.preview.errors).toEqual([]);
  await selectConnectorSource("a", "owner", draft.sourceId, 0, f.db);
  await csvImportAction(
    "a",
    "owner",
    draft.id,
    draft.contentHash,
    "activate",
    f.db,
  );
  await processCsvJob("a", f.db);
  expect((await readCsvImport("a", draft.id, f.db)).state).toBe("ACTIVE");
  expect(
    (
      await f.pg.query(
        `SELECT l."externalOrderId",s.sku FROM "OrderLine" l LEFT JOIN "Sku" s ON s.id=l."skuId" AND s."tenantId"=l."tenantId" WHERE l."sourceId"=$1 ORDER BY l."externalOrderId"`,
        [draft.sourceId],
      )
    ).rows,
  ).toEqual([
    { externalOrderId: '["ambiguous","sale"]', sku: null },
    { externalOrderId: '["blank","sale"]', sku: "NEW" },
    { externalOrderId: '["different","sale"]', sku: "NEW" },
  ]);
});
it("revalidates selection on explicit retry after switching away and back, then completes without rotating connection revision", async () => {
  const state = await listConnectorSources("a", f.db),
    sourceId = state.sourceId!;
  const draft = await previewCsv(
    "a",
    "owner",
    sourceId,
    { ...csvOptions, history: null },
    [
      csvFile("orders", [
        {
          ...csvOrders[0],
          orderId: "retry",
          productId: "new-product",
          sku: "NEW",
        },
      ]),
    ],
    f.db,
  );
  await csvImportAction(
    "a",
    "owner",
    draft.id,
    draft.contentHash,
    "activate",
    f.db,
  );
  const held = await claimConnectorJob<CsvJob>("csv", f.db, "a");
  expect(held).not.toBeNull();
  await f.pg.exec(
    `UPDATE "ConnectorConnection" SET "lastCheck"='{"ok":true}' WHERE id='connection'`,
  );
  await selectConnectorSource("a", "owner", "source", state.revision, f.db);
  await processCsvJob("a", f.db, held!);
  const away = await listConnectorSources("a", f.db);
  await selectConnectorSource("a", "owner", sourceId, away.revision, f.db);
  const back = await listConnectorSources("a", f.db);
  await csvImportAction(
    "a",
    "owner",
    draft.id,
    draft.contentHash,
    "retry",
    f.db,
  );
  const queued = (
    await f.pg.query<{
      connectionRevision: number;
      checkpoint: { selectionRevision: number };
    }>(
      `SELECT "connectionRevision",checkpoint FROM "ConnectorSyncJob" WHERE "importRunId"=$1`,
      [draft.importRunId],
    )
  ).rows[0];
  expect(queued.connectionRevision).toBe(held!.connectionRevision);
  expect(queued.checkpoint.selectionRevision).toBe(back.revision);
  await processCsvJob("a", f.db);
  expect((await readCsvImport("a", draft.id, f.db)).state).toBe("ACTIVE");
});
it("activates mixed-precision stock observations chronologically instead of pausing as stale", async () => {
  const state = await listConnectorSources("a", f.db);
  const draft = await previewCsv(
    "a",
    "owner",
    state.sourceId!,
    { ...csvOptions, history: null },
    [
      csvFile("products", [
        {
          productId: "new-product",
          sku: "NEW",
          name: "New product",
          observedAt: "2026-08-01T00:00:00Z",
        },
      ]),
      csvFile("stock", [
        {
          productId: "new-product",
          observedAt: "2026-10-26T06:00:00.500Z",
          quantity: "2",
        },
        {
          productId: "new-product",
          observedAt: "2026-10-26T06:00:00Z",
          quantity: "1",
        },
      ]),
    ],
    f.db,
  );
  await csvImportAction(
    "a",
    "owner",
    draft.id,
    draft.contentHash,
    "activate",
    f.db,
  );
  await processCsvJob("a", f.db);
  expect((await readCsvImport("a", draft.id, f.db)).state).toBe("ACTIVE");
  expect(
    (
      await f.pg.query(
        `SELECT quantity::text quantity,"observedAt" FROM "InventorySnapshot" WHERE "sourceId"=$1 AND "snapshotDate"='2026-10-26'`,
        [draft.sourceId],
      )
    ).rows,
  ).toEqual([
    { quantity: "2.0000", observedAt: new Date("2026-10-26T06:00:00.500Z") },
  ]);
});
it("cascades preview/raw cleanup when an unprojected run, source, or tenant is deleted", async () => {
  for (const target of ["run", "source", "tenant"]) {
    const tenant = "cleanup-" + target,
      owner = "owner-" + target;
    await f.pg.query(
      `INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ($1,$1,$1,now())`,
      [tenant],
    );
    await f.pg.query(
      `INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ($1,$1||'@example.test','test','Owner','ADMIN',$2,now())`,
      [owner, tenant],
    );
    const draft = await previewCsv(
      tenant,
      owner,
      null,
      { ...csvOptions, history: null },
      [csvFile("orders", csvOrders)],
      f.db,
    );
    if (target === "run")
      await f.pg.query(`DELETE FROM "DataImportRun" WHERE id=$1`, [
        draft.importRunId,
      ]);
    else if (target === "source")
      await f.pg.query(`DELETE FROM "DataSource" WHERE id=$1`, [
        draft.sourceId,
      ]);
    else await f.pg.query(`DELETE FROM "Tenant" WHERE id=$1`, [tenant]);
    expect(
      (await f.pg.query(`SELECT id FROM "CsvImport" WHERE id=$1`, [draft.id]))
        .rows,
    ).toEqual([]);
    expect(
      (
        await f.pg.query(
          `SELECT id FROM "DataSourceRecord" WHERE "importRunId"=$1`,
          [draft.importRunId],
        )
      ).rows,
    ).toEqual([]);
  }
});
