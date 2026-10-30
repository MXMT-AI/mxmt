import { beforeAll, afterAll, beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createMerchandisingDb } from "../helpers/merchandising-db";
import { readDriveConnection, saveDriveConnection, parseSpreadsheetId } from "@/lib/drive-connection";
let f: Awaited<ReturnType<typeof createMerchandisingDb>>;
const zavod = "1MzALTBxYTNx9zxIaQX0TEm3uAOntw6vAAzVnZx6wnGE";
const demo = "19yKafilaFoTmn22bMIvUsYvxT65cLNPR3bKT3ri7OhY";
beforeAll(async () => { f = await createMerchandisingDb(); }, 30000);
afterAll(async () => f?.pg.close());
afterEach(() => vi.unstubAllEnvs());
beforeEach(async () => {
  vi.stubEnv("GOOGLE_DRIVE_FILE_ID", zavod);
  await f.pg.exec(`TRUNCATE "Tenant" CASCADE;
    INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','Zavod','a',now()),('b','Demo','b',now());
    INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES
      ('owner','owner@drive.test','test','Owner','ADMIN','a',now()),
      ('demo','demo@drive.test','test','Demo','ADMIN','b',now()),
      ('viewer','viewer@drive.test','test','Viewer','VIEWER','b',now());`);
  // Both tenants already have Zavod raw data: reproduces the reported incident.
  await f.pg.query(`INSERT INTO "DataSource" (id,"tenantId",kind,"driveFileId","updatedAt") VALUES
    ('old-a','a','GOOGLE_SHEETS',$1,now()),('accidental-b','b','GOOGLE_SHEETS',$1,now())`, [zavod]);
});
it("does not inherit a global workbook from an accidental raw import", async () => {
  expect(await readDriveConnection("b", f.db)).toBeNull();
  expect(await readDriveConnection("a", f.db)).toBeNull();
});
it("preserves the approved original and binds the demo independently, including scheduled resolution", async () => {
  await f.pg.query(`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedById","approvedAt","approvalReference")
    VALUES ('map','a','SOURCE_MAPPING','sheets:old-a',1,$1,true,'owner',now(),'Approved real source')`,
    [JSON.stringify({ sheets: { version: 1, fileId: zavod } })]);
  expect(await readDriveConnection("a", f.db)).toMatchObject({ fileId: zavod, origin: "legacy_approved" });
  expect(await readDriveConnection("b", f.db)).toBeNull();
  await saveDriveConnection("b", "demo", `https://docs.google.com/spreadsheets/d/${demo}/edit?usp=sharing`, 0, f.db);
  expect(await readDriveConnection("b", f.db)).toEqual({ fileId: demo, revision: 1, origin: "tenant" });
  expect(await readDriveConnection("a", f.db)).toMatchObject({ fileId: zavod });
  vi.stubEnv("GOOGLE_DRIVE_FILE_ID", "different_global_workbook_1234");
  expect(await readDriveConnection("b", f.db)).toMatchObject({ fileId: demo });
});
it("enforces tenant membership, admin role and optimistic revision without changing another cabinet", async () => {
  await expect(saveDriveConnection("b", "owner", demo, 0, f.db)).rejects.toMatchObject({ status: 403 });
  await expect(saveDriveConnection("b", "viewer", demo, 0, f.db)).rejects.toMatchObject({ status: 403 });
  await saveDriveConnection("b", "demo", demo, 0, f.db);
  await expect(saveDriveConnection("b", "demo", zavod, 0, f.db)).rejects.toMatchObject({ code: "SHEETS_CONNECTION_CHANGED" });
  expect(await readDriveConnection("b", f.db)).toMatchObject({ fileId: demo, revision: 1 });
  expect(await readDriveConnection("a", f.db)).toBeNull();
});
it("records replacements without deleting imported history", async () => {
  await saveDriveConnection("b", "demo", zavod, 0, f.db);
  await saveDriveConnection("b", "demo", demo, 1, f.db);
  expect(await readDriveConnection("b", f.db)).toMatchObject({ fileId: demo, revision: 2 });
  const rows = await f.pg.query(`SELECT "isActive" FROM "MerchandisingConfig" WHERE "tenantId"='b' ORDER BY revision`);
  expect(rows.rows).toEqual([{ isActive: false }, { isActive: true }]);
  expect((await f.pg.query(`SELECT id FROM "DataSource" WHERE "tenantId"='b'`)).rows).toHaveLength(1);
});
it.each(["https://evil.test/spreadsheets/d/123456789012/edit", "https://docs.google.com.evil.test/spreadsheets/d/123456789012/edit", "https://docs.google.com@evil.test/spreadsheets/d/123456789012", "http://docs.google.com/spreadsheets/d/123456789012", "../../etc/passwd", "", "short"])("rejects unsafe or malformed file inputs: %s", value => {
  expect(() => parseSpreadsheetId(value)).toThrow();
});
