import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
import type { SqlClient, SqlDatabase } from "@/lib/connectors/database";
/** Isolated production migrations and the shared SQL boundary; never connects to configured databases. */
export async function createMerchandisingDb() {
  const pg = new PGlite(),
    root = new URL("../../prisma/migrations/", import.meta.url);
  for (const name of (await readdir(root, { withFileTypes: true }))
    .filter((x) => x.isDirectory())
    .map((x) => x.name)
    .sort())
    await pg.exec(
      await readFile(new URL(`${name}/migration.sql`, root), "utf8"),
    );
  const bridge = (client: Pick<PGlite, "query">): SqlClient => ({
    $queryRaw: async <T>(q: Prisma.Sql) =>
      (await client.query(q.text, q.values)).rows as T,
    $executeRaw: async (q) =>
      (await client.query(q.text, q.values)).affectedRows ?? 0,
  });
  const db: SqlDatabase = {
    ...bridge(pg),
    $transaction: async (cb) => pg.transaction((tx) => cb(bridge(tx))),
  };
  return { pg, db };
}
