import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("connector configuration migration", () => {
  it("replays the full history, enforces tenant/source identity and preserves old sources", async () => {
    const db = new PGlite();
    try {
      const root = new URL("../../prisma/migrations/", import.meta.url);
      const directories = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
      for (const name of directories) await db.exec(await readFile(new URL(`${name}/migration.sql`, root), "utf8"));
      await db.exec(`INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','A','a',now()), ('b','B','b',now());
        INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('source-a','a','SALESDRIVE','account',now()), ('source-b','b','SALESDRIVE','account',now());
        INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId","accountHost","encryptedConfig","updatedAt") VALUES ('connection-a','a','source-a','demo.salesdrive.me','v1.encrypted',now());`);
      await expect(db.exec(`UPDATE "ConnectorConnection" SET "sourceId"='source-b' WHERE id='connection-a'`)).rejects.toMatchObject({ code: "23503" });
      await expect(db.exec(`INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId","accountHost","encryptedConfig","updatedAt") VALUES ('duplicate','a','source-a','demo.salesdrive.me','v1.encrypted',now())`)).rejects.toMatchObject({ code: "23505" });
      expect((await db.query('SELECT id FROM "DataSource" ORDER BY id')).rows).toEqual([{ id: "source-a" }, { id: "source-b" }]);
      await db.exec('DELETE FROM "Tenant" WHERE id=\'a\'');
      expect((await db.query('SELECT count(*)::int AS n FROM "ConnectorConnection"')).rows).toEqual([{ n: 0 }]);
      expect((await db.query('SELECT id FROM "DataSource"')).rows).toEqual([{ id: "source-b" }]);
    } finally { await db.close(); }
  }, 30_000);
});
