import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createMerchandisingDb } from "../helpers/merchandising-db";
import { input, mapping } from "../helpers/sheets-mapping";
import {
  previewSheetsMapping,
  approveSheetsMapping,
  readSheetsMappingMetadata,
  SHEETS_MAPPING_PREVIEW_TTL_MS,
} from "@/lib/connectors/sheets-mapping-store";
import { listConnectorSources } from "@/lib/connectors/source";
let f: Awaited<ReturnType<typeof createMerchandisingDb>>;
const p = { tenantId: "a", userId: "owner" },
  now = new Date("2026-10-29T10:00:00Z");
const request = () => ({
  expectedRevision: 0,
  importRunId: "run",
  mapping: mapping(),
});
const preview = () => previewSheetsMapping(p, "sheet", request(), f.db, now);
const approve = (op: { configId: string; previewHash: string }, at = now) =>
  approveSheetsMapping(
    p,
    "sheet",
    {
      configId: op.configId,
      previewHash: op.previewHash,
      reference: "Synthetic owner approval",
    },
    f.db,
    at,
  );
beforeAll(async () => {
  f = await createMerchandisingDb();
  await f.pg.exec(
    `INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','A','a',now()),('b','B','b',now());INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('owner','owner@mapping.test','test','Owner','ADMIN','a',now()),('analyst','analyst@mapping.test','test','Analyst','ANALYST','a',now()),('foreign','foreign@mapping.test','test','Foreign','ADMIN','b',now());INSERT INTO "DataSource" (id,"tenantId",kind,"driveFileId","updatedAt") VALUES ('sheet','a','GOOGLE_SHEETS','file',now());INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","sourceChecksum","updatedAt") VALUES ('run','a','sheet','MANUAL','WARNING','fixture',current_date,'checksum',now());UPDATE "DataSource" SET "activeImportRunId"='run' WHERE id='sheet';`,
  );
  for (const s of input.sheets)
    await f.pg.query(
      `INSERT INTO "DataSheetSnapshot" (id,"tenantId","importRunId","sheetKey","sourceName","headerRow",columns,"rowCount",checksum) VALUES ($1,'a','run',$2,$3,1,$4,1,$5)`,
      [s.id, s.sheetKey, s.sourceName, JSON.stringify(s.columns), s.checksum],
    );
  await f.pg.query(
    `INSERT INTO "DataSheetRow" (id,"tenantId","snapshotId","rowNumber",data,"rowHash") VALUES ('p-row','a','products',2,$1,'p')`,
    [
      JSON.stringify({
        col_a: "p",
        col_b: "sku",
        col_c: "Product",
        col_e: "Watches",
        col_g: 20,
        col_h: 10,
        col_i: 1,
        col_j: 0,
      }),
    ],
  );
  await f.pg.query(
    `INSERT INTO "DataSheetRow" (id,"tenantId","snapshotId","rowNumber",data,"rowHash") VALUES ('o-row','a','orders',2,$1,'o')`,
    [
      JSON.stringify({
        col_a: "o",
        col_b: "l",
        col_c: "p",
        col_d: "sku",
        col_e: 5,
        col_f: 1,
        col_h: "2026-10-20",
        col_k: 1,
        col_l: 20,
        col_m: 10,
      }),
    ],
  );
}, 30000);
afterAll(async () => f?.pg.close());
beforeEach(async () => {
  await f.pg.exec(
    `DELETE FROM "MerchandisingAction";DELETE FROM "MerchandisingConfig";DELETE FROM "ConnectorSelection";UPDATE "DataSource" SET "driveFileId"='file',"activeImportRunId"='run' WHERE id='sheet';UPDATE "DataImportRun" SET "sourceChecksum"='checksum' WHERE id='run';DELETE FROM "DataSheetRow" WHERE id='duplicate';UPDATE "DataSheetSnapshot" SET "rowCount"=1 WHERE id='products';`,
  );
});
it("stages bounded preview and mapping without changing reporting source, import or financial facts", async () => {
  const op = await preview();
  expect(op.summary.counts).toEqual({ products: 1, orders: 1 });
  expect(op.summary.blockingErrors).toEqual([]);
  expect(
    (
      await f.pg.query(
        `SELECT "isActive","approvedAt" FROM "MerchandisingConfig"`,
      )
    ).rows,
  ).toEqual([{ isActive: false, approvedAt: null }]);
  expect(
    (await f.pg.query(`SELECT count(*)::int n FROM "ConnectorSelection"`)).rows,
  ).toEqual([{ n: 0 }]);
  expect(
    (await f.pg.query(`SELECT count(*)::int n FROM "OrderLine"`)).rows,
  ).toEqual([{ n: 0 }]);
  expect((await listConnectorSources("a", f.db)).connections[0]).toMatchObject({
    readiness: "MAPPING_REQUIRED",
    selectable: false,
  });
});
it("requires separate approval of the exact preview and makes the source import-required, not ready", async () => {
  const op = await preview();
  expect(await approve(op)).toMatchObject({ state: "APPROVED", revision: 1 });
  expect(await approve(op)).toMatchObject({ state: "APPROVED" });
  expect((await listConnectorSources("a", f.db)).connections[0]).toMatchObject({
    readiness: "IMPORT_REQUIRED",
    selectable: true,
  });
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "MerchandisingAction" WHERE action='SHEETS_MAPPING_APPROVED'`,
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
  await expect(
    approveSheetsMapping(
      p,
      "sheet",
      {
        configId: op.configId,
        previewHash: op.previewHash,
        reference: "different",
      },
      f.db,
      now,
    ),
  ).rejects.toMatchObject({ code: "SHEETS_MAPPING_APPROVAL_CONFLICT" });
});
it("rejects cross-tenant/non-admin access, foreign fields and forged hashes", async () => {
  await expect(
    readSheetsMappingMetadata(
      { tenantId: "b", userId: "foreign" },
      "sheet",
      f.db,
    ),
  ).rejects.toMatchObject({ code: "SHEETS_RAW_IMPORT_REQUIRED" });
  await expect(
    previewSheetsMapping(
      { tenantId: "a", userId: "analyst" },
      "sheet",
      request(),
      f.db,
      now,
    ),
  ).rejects.toMatchObject({ code: "AI_FORBIDDEN" });
  await expect(
    previewSheetsMapping(
      p,
      "sheet",
      { ...request(), fileId: "forged" },
      f.db,
      now,
    ),
  ).rejects.toMatchObject({ code: "INVALID_SHEETS_MAPPING_PREVIEW" });
  const op = await preview();
  await expect(approve({ ...op, previewHash: "forged" })).rejects.toMatchObject(
    { code: "SHEETS_MAPPING_PREVIEW_CHANGED" },
  );
});
it("expires previews and invalidates file/checksum changes instead of approving stale data", async () => {
  const op = await preview();
  await expect(
    approve(op, new Date(now.getTime() + SHEETS_MAPPING_PREVIEW_TTL_MS)),
  ).rejects.toMatchObject({ code: "SHEETS_MAPPING_PREVIEW_EXPIRED" });
  await f.pg.exec(
    `UPDATE "DataImportRun" SET "sourceChecksum"='changed' WHERE id='run'`,
  );
  await expect(approve(op)).rejects.toMatchObject({
    code: "SHEETS_RAW_IMPORT_CHANGED",
  });
});
it("enforces optimistic revision and prevents approving an older draft after a new preview", async () => {
  const op = await preview();
  await expect(preview()).rejects.toMatchObject({
    code: "SHEETS_MAPPING_REVISION_CONFLICT",
  });
  await previewSheetsMapping(
    p,
    "sheet",
    { ...request(), expectedRevision: 1 },
    f.db,
    now,
  );
  await expect(approve(op)).rejects.toMatchObject({
    code: "SHEETS_MAPPING_REVISION_CONFLICT",
  });
});
it("does not approve duplicate product identities or malformed source row counts", async () => {
  await f.pg.exec(
    `INSERT INTO "DataSheetRow" (id,"tenantId","snapshotId","rowNumber",data,"rowHash") SELECT 'duplicate',"tenantId","snapshotId",3,data,"rowHash" FROM "DataSheetRow" WHERE id='p-row';UPDATE "DataSheetSnapshot" SET "rowCount"=2 WHERE id='products'`,
  );
  const op = await preview();
  expect(op.summary.blockingErrors).toContain("DUPLICATE_PRODUCT_IDENTITIES");
  await expect(approve(op)).rejects.toMatchObject({
    code: "SHEETS_MAPPING_HAS_BLOCKING_ERRORS",
  });
  await f.pg.exec(
    `UPDATE "DataSheetSnapshot" SET "rowCount"=1 WHERE id='products'`,
  );
  await expect(
    previewSheetsMapping(
      p,
      "sheet",
      { ...request(), expectedRevision: 1 },
      f.db,
      now,
    ),
  ).rejects.toMatchObject({ code: "SHEETS_RAW_SNAPSHOT_CHANGED" });
});
it("pins stored mapping values as well as the request hash and does not reactivate a disabled approval", async () => {
  const op = await preview();
  await f.pg.exec(
    `UPDATE "MerchandisingConfig" SET values=jsonb_set(values,'{sheets,mapping,policy,currency}','"USD"')`,
  );
  await expect(approve(op)).rejects.toMatchObject({
    code: "SHEETS_MAPPING_PREVIEW_CHANGED",
  });
  await f.pg.exec(
    `UPDATE "MerchandisingConfig" SET values=jsonb_set(values,'{sheets,mapping,policy,currency}','"UAH"')`,
  );
  await approve(op);
  await f.pg.exec(`UPDATE "MerchandisingConfig" SET "isActive"=false`);
  await expect(approve(op)).rejects.toMatchObject({
    code: "SHEETS_MAPPING_INACTIVE",
  });
});

it("returns observed business dictionaries from the saved draft without approving inferred classifications", async () => {
  await preview();
  const meta = await readSheetsMappingMetadata(p, "sheet", f.db);
  expect(meta.revision).toBe(1);
  expect(meta.activeRevision).toBeNull();
  expect(meta.observed).toEqual({
    statuses: [{ id: "5", count: 1 }],
    channels: [{ id: "1", count: 1 }],
    categories: [{ name: "Watches", count: 1 }],
  });
  expect(meta.suggestion.policy.currency).toBe("UAH");
});
it("invalidates a preview when its workbook or column schema changes", async () => {
  const op = await preview();
  await f.pg.exec(
    `UPDATE "DataSource" SET "driveFileId"='other-file' WHERE id='sheet'`,
  );
  await expect(approve(op)).rejects.toMatchObject({
    code: "SHEETS_RAW_IMPORT_CHANGED",
  });
  await f.pg.exec(
    `UPDATE "DataSource" SET "driveFileId"='file' WHERE id='sheet';UPDATE "DataSheetSnapshot" SET columns=jsonb_set(columns,'{0,label}','"Changed column"') WHERE id='products'`,
  );
  try {
    await expect(approve(op)).rejects.toMatchObject({
      code: "SHEETS_RAW_IMPORT_CHANGED",
    });
  } finally {
    await f.pg.query(
      `UPDATE "DataSheetSnapshot" SET columns=$1 WHERE id='products'`,
      [JSON.stringify(input.sheets[0].columns)],
    );
  }
});
