import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createScreenDb, screenSelection } from "../helpers/screen-db";
import {
  csvOptions,
  csvPacket,
  csvOrders,
  csvFile,
} from "../fixtures/csv-connector";
import {
  previewCsv,
  csvImportAction,
  readCsvImport,
  readCsvFiles,
  expireCsvPreviews,
} from "@/lib/connectors/csv/store";
import { processCsvJob } from "@/lib/connectors/csv/worker";
import {
  selectConnectorSource,
  listConnectorSources,
} from "@/lib/connectors/source";
import { getSalesReport } from "@/lib/sales-report";
let f: Awaited<ReturnType<typeof createScreenDb>>,
  upload: Awaited<ReturnType<typeof previewCsv>>;
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
it("freezes exact bytes and mapping in a tenant-owned dry-run without changing active facts or silently selecting CSV", async () => {
  upload = await previewCsv("a", "owner", null, csvOptions, csvPacket(), f.db);
  expect(upload.state).toBe("READY");
  expect(upload.preview.errors).toEqual([]);
  expect((await listConnectorSources("a", f.db)).sourceId).toBe("source");
  expect(
    (await readCsvFiles(upload, f.db)).find((f) => f.resource === "orders")
      ?.bytes,
  ).toBe(csvPacket()[2].bytes);
  const repeat = await previewCsv(
    "a",
    "owner",
    upload.sourceId,
    csvOptions,
    csvPacket(),
    f.db,
  );
  expect(repeat.id).toBe(upload.id);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "OrderLine" WHERE "sourceId"=$1`,
        [upload.sourceId],
      )
    ).rows,
  ).toEqual([{ n: 0 }]);
  await expect(readCsvImport("b", upload.id, f.db)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    csvImportAction(
      "b",
      "owner",
      upload.id,
      upload.contentHash,
      "activate",
      f.db,
    ),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    previewCsv("b", "owner", upload.sourceId, csvOptions, csvPacket(), f.db),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    csvImportAction("a", "owner", upload.id, "0".repeat(64), "activate", f.db),
  ).rejects.toMatchObject({ code: "CSV_HASH_CHANGED" });
  await expect(
    csvImportAction(
      "a",
      "owner",
      upload.id,
      upload.contentHash,
      "activate",
      f.db,
    ),
  ).rejects.toMatchObject({ code: "CSV_SELECT_SOURCE_FIRST" });
});
it("activates the reviewed packet through the durable worker and keeps the old source stock for the same SKU/day", async () => {
  await selectConnectorSource("a", "owner", upload.sourceId, 0, f.db);
  const intent = await csvImportAction(
    "a",
    "owner",
    upload.id,
    upload.contentHash,
    "activate",
    f.db,
  );
  expect(intent.state).toBe("QUEUED");
  await processCsvJob("a", f.db);
  const active = await readCsvImport("a", upload.id, f.db);
  expect(active.state).toBe("ACTIVE");
  expect(
    (
      await f.pg.query(
        `SELECT state,"errorCode" FROM "ConnectorSyncJob" WHERE "importRunId"=$1`,
        [upload.importRunId],
      )
    ).rows,
  ).toEqual([{ state: "COMPLETE", errorCode: null }]);
  expect(
    (
      await f.pg.query(
        `SELECT "sourceId",quantity::text quantity FROM "InventorySnapshot" WHERE "tenantId"='a' AND "skuId"='sku-a' AND "snapshotDate"='2026-10-25' ORDER BY "sourceId"`,
      )
    ).rows,
  ).toHaveLength(2);
  expect(
    (await getSalesReport("a", screenSelection, f.db)).summary[0].current
      .revenue,
  ).toBe("40");
  expect(
    (
      await csvImportAction(
        "a",
        "owner",
        upload.id,
        upload.contentHash,
        "activate",
        f.db,
      )
    ).state,
  ).toBe("ACTIVE");
  expect(await processCsvJob("a", f.db)).toEqual({ processed: false });
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "OrderLine" WHERE "sourceId"=$1`,
        [upload.sourceId],
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "ConnectorRecalculation" WHERE "importRunId"=$1`,
        [upload.importRunId],
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
});
it("rejects malformed previews and rolls back all projections for a conflicting corrected version", async () => {
  const invalid = await previewCsv(
    "a",
    "owner",
    upload.sourceId,
    { ...csvOptions, mappingRevision: 2 },
    [
      {
        ...csvPacket()[2],
        bytes: Buffer.from("id,id\n1,2").toString("base64"),
      },
    ],
    f.db,
  );
  expect(invalid.state).toBe("INVALID");
  await expect(
    csvImportAction(
      "a",
      "owner",
      invalid.id,
      invalid.contentHash,
      "activate",
      f.db,
    ),
  ).rejects.toMatchObject({ code: "CSV_NOT_READY" });
  const conflict = await previewCsv(
    "a",
    "owner",
    upload.sourceId,
    csvOptions,
    [
      ...csvPacket().slice(0, 2),
      csvFile("orders", [{ ...csvOrders[0], quantity: "3" }]),
    ],
    f.db,
  );
  await csvImportAction(
    "a",
    "owner",
    conflict.id,
    conflict.contentHash,
    "activate",
    f.db,
  );
  await processCsvJob("a", f.db);
  expect((await readCsvImport("a", conflict.id, f.db)).state).toBe("QUEUED");
  expect(
    (
      await f.pg.query(
        `SELECT quantity::text quantity FROM "OrderLine" WHERE "sourceId"=$1`,
        [upload.sourceId],
      )
    ).rows,
  ).toEqual([{ quantity: "2.0000" }]);
  await csvImportAction(
    "a",
    "owner",
    conflict.id,
    conflict.contentHash,
    "cancel",
    f.db,
  );
});
it("applies a newer corrected document once and never zeroes stock omitted from a partial packet", async () => {
  const corrected = await previewCsv(
    "a",
    "owner",
    upload.sourceId,
    { ...csvOptions, catalog: "partial", stock: "partial", history: null },
    [
      csvFile("orders", [
        {
          ...csvOrders[0],
          updatedAt: "2026-10-26T08:00:00.000Z",
          quantity: "3",
        },
      ]),
    ],
    f.db,
  );
  await csvImportAction(
    "a",
    "owner",
    corrected.id,
    corrected.contentHash,
    "activate",
    f.db,
  );
  await processCsvJob("a", f.db);
  expect((await readCsvImport("a", corrected.id, f.db)).state).toBe("ACTIVE");
  expect(
    (
      await f.pg.query(
        `SELECT quantity::text quantity FROM "OrderLine" WHERE "sourceId"=$1`,
        [upload.sourceId],
      )
    ).rows,
  ).toEqual([{ quantity: "3.0000" }]);
  expect(
    (
      await f.pg.query(
        `SELECT quantity::text quantity FROM "InventorySnapshot" WHERE "sourceId"=$1 AND "skuId"='sku-a'`,
        [upload.sourceId],
      )
    ).rows,
  ).toEqual([{ quantity: "12.0000" }]);
});
it("cancels before projection and expires unactivated bytes while retaining hashes and audit metadata", async () => {
  const draft = await previewCsv(
    "a",
    "owner",
    upload.sourceId,
    { ...csvOptions, mappingRevision: 3 },
    csvPacket(),
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
  await csvImportAction(
    "a",
    "owner",
    draft.id,
    draft.contentHash,
    "cancel",
    f.db,
  );
  expect((await readCsvImport("a", draft.id, f.db)).state).toBe("CANCELLED");
  await f.pg.query(
    `UPDATE "CsvImport" SET "expiresAt"=now()-interval '1 day' WHERE id=$1`,
    [draft.id],
  );
  await f.db.$transaction((tx) => expireCsvPreviews("a", tx));
  expect(await readCsvFiles(draft, f.db)).toEqual([]);
  expect((await readCsvImport("a", draft.id, f.db)).state).toBe("EXPIRED");
  expect(
    (
      await f.pg.query(`SELECT "contentHash" FROM "CsvImport" WHERE id=$1`, [
        draft.id,
      ])
    ).rows,
  ).toEqual([{ contentHash: draft.contentHash }]);
});

it("allows a new reviewed upload after expiration and cancellation without reviving the old job", async () => {
  const options = { ...csvOptions, mappingRevision: 4 };
  const first = await previewCsv(
    "a",
    "owner",
    upload.sourceId,
    options,
    csvPacket(),
    f.db,
  );
  await csvImportAction(
    "a",
    "owner",
    first.id,
    first.contentHash,
    "cancel",
    f.db,
  );
  const replacement = await previewCsv(
    "a",
    "owner",
    upload.sourceId,
    options,
    csvPacket(),
    f.db,
  );
  expect(replacement.id).not.toBe(first.id);
  expect(replacement.state).toBe("READY");
  expect((await readCsvFiles(replacement, f.db)).length).toBe(3);
  await csvImportAction(
    "a",
    "owner",
    replacement.id,
    replacement.contentHash,
    "cancel",
    f.db,
  );
});
it("requires a fresh preview after business settings change and preserves explicit cancellation", async () => {
  const { readClientSettings, saveMerchandisingSettings } = await import(
    "@/lib/merchandising-settings-store"
  );
  const options = { ...csvOptions, mappingRevision: 5 };
  const ready = await previewCsv(
    "a",
    "owner",
    upload.sourceId,
    options,
    csvPacket(),
    f.db,
  );
  const client = await readClientSettings("a", f.db);
  await saveMerchandisingSettings(
    "a",
    "owner",
    "client",
    null,
    client.revision,
    client.values,
    f.db,
  );
  await expect(
    csvImportAction(
      "a",
      "owner",
      ready.id,
      ready.contentHash,
      "activate",
      f.db,
    ),
  ).rejects.toMatchObject({ code: "CSV_SETTINGS_CHANGED" });
  const refreshed = await previewCsv(
    "a",
    "owner",
    upload.sourceId,
    options,
    csvPacket(),
    f.db,
  );
  expect(refreshed.id).toBe(ready.id);
  expect(refreshed.context.settingsHash).not.toBe(ready.context.settingsHash);
  await csvImportAction(
    "a",
    "owner",
    refreshed.id,
    refreshed.contentHash,
    "cancel",
    f.db,
  );
});
it("replaces a corrected full document line set and rolls back a packet that omits existing documents while claiming complete history", async () => {
  const options = {
    ...csvOptions,
    catalog: "partial" as const,
    stock: "partial" as const,
    history: null,
  };
  const lines = [
    {
      ...csvOrders[0],
      orderId: "multi",
      lineId: "line-1",
      updatedAt: "2026-10-26T09:00:00.000Z",
    },
    {
      ...csvOrders[0],
      orderId: "multi",
      lineId: "line-2",
      updatedAt: "2026-10-26T09:00:00.000Z",
    },
  ];
  const first = await previewCsv(
    "a",
    "owner",
    upload.sourceId,
    options,
    [csvFile("orders", lines)],
    f.db,
  );
  await csvImportAction(
    "a",
    "owner",
    first.id,
    first.contentHash,
    "activate",
    f.db,
  );
  await processCsvJob("a", f.db);
  const corrected = await previewCsv(
    "a",
    "owner",
    upload.sourceId,
    options,
    [
      csvFile("orders", [
        { ...lines[0], updatedAt: "2026-10-27T09:00:00.000Z" },
      ]),
    ],
    f.db,
  );
  await csvImportAction(
    "a",
    "owner",
    corrected.id,
    corrected.contentHash,
    "activate",
    f.db,
  );
  await processCsvJob("a", f.db);
  expect((await readCsvImport("a", corrected.id, f.db)).state).toBe("ACTIVE");
  expect(
    (
      await f.pg.query(
        `SELECT "externalLineId" FROM "OrderLine" WHERE "sourceId"=$1 AND "externalOrderId"='["multi","sale"]'`,
        [upload.sourceId],
      )
    ).rows,
  ).toEqual([{ externalLineId: "native:line-1" }]);
  const incomplete = await previewCsv(
    "a",
    "owner",
    upload.sourceId,
    { ...csvOptions, mappingRevision: 6 },
    [
      csvFile("orders", [
        { ...csvOrders[0], updatedAt: "2026-10-27T09:00:00.000Z" },
      ]),
    ],
    f.db,
  );
  await csvImportAction(
    "a",
    "owner",
    incomplete.id,
    incomplete.contentHash,
    "activate",
    f.db,
  );
  await processCsvJob("a", f.db);
  expect(
    (
      await f.pg.query(
        `SELECT "errorCode" FROM "ConnectorSyncJob" WHERE "importRunId"=$1`,
        [incomplete.importRunId],
      )
    ).rows,
  ).toEqual([{ errorCode: "CSV_HISTORY_OMITS_DOCUMENTS" }]);
  await csvImportAction(
    "a",
    "owner",
    incomplete.id,
    incomplete.contentHash,
    "cancel",
    f.db,
  );
});

it("fences a claimed CSV job after source selection changes and refuses tampered frozen bytes", async () => {
  const { claimConnectorJob } = await import("@/lib/connectors/jobs");
  const draft = await previewCsv(
    "a",
    "owner",
    upload.sourceId,
    { ...csvOptions, mappingRevision: 7, history: null },
    [csvFile("orders", [{ ...csvOrders[0], orderId: "fenced" }])],
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
  const claimed = await claimConnectorJob<
    import("@/lib/connectors/csv/worker").CsvJob
  >("csv", f.db, "a");
  expect(claimed).not.toBeNull();
  await f.pg.exec(
    `UPDATE "ConnectorConnection" SET "lastCheck"='{"ok":true}' WHERE id='connection'`,
  );
  const state = await listConnectorSources("a", f.db);
  await selectConnectorSource("a", "owner", "source", state.revision, f.db);
  await processCsvJob("a", f.db, claimed!);
  expect(
    (
      await f.pg.query(
        `SELECT state,"errorCode" FROM "ConnectorSyncJob" WHERE "importRunId"=$1`,
        [draft.importRunId],
      )
    ).rows,
  ).toEqual([{ state: "PAUSED", errorCode: "CONNECTOR_CONFIG_CHANGED" }]);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "OrderLine" WHERE "externalOrderId"='["fenced","sale"]'`,
      )
    ).rows,
  ).toEqual([{ n: 0 }]);
  await csvImportAction(
    "a",
    "owner",
    draft.id,
    draft.contentHash,
    "cancel",
    f.db,
  );
  const switched = await listConnectorSources("a", f.db);
  await selectConnectorSource(
    "a",
    "owner",
    upload.sourceId,
    switched.revision,
    f.db,
  );
  const tampered = await previewCsv(
    "a",
    "owner",
    upload.sourceId,
    { ...csvOptions, mappingRevision: 8, history: null },
    [csvFile("orders", [{ ...csvOrders[0], orderId: "tampered" }])],
    f.db,
  );
  await f.pg.query(
    `UPDATE "DataSourceRecord" SET payload=jsonb_set(payload,'{file,bytes}','"eA=="') WHERE "importRunId"=$1 AND resource='csv-file'`,
    [tampered.importRunId],
  );
  await csvImportAction(
    "a",
    "owner",
    tampered.id,
    tampered.contentHash,
    "activate",
    f.db,
  );
  await processCsvJob("a", f.db);
  expect(
    (
      await f.pg.query(
        `SELECT "errorCode" FROM "ConnectorSyncJob" WHERE "importRunId"=$1`,
        [tampered.importRunId],
      )
    ).rows,
  ).toEqual([{ errorCode: "CSV_HASH_CHANGED" }]);
  await csvImportAction(
    "a",
    "owner",
    tampered.id,
    tampered.contentHash,
    "cancel",
    f.db,
  );
});
