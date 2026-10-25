import { Prisma } from "@prisma/client";
import type { SqlDatabase, SqlClient } from "./connectors/database";
/** Publish a consistent calculation atomically; concurrent serialization conflicts retry once. */
export async function withCalculationSnapshot<T>(
  db: SqlDatabase,
  callback: (tx: SqlClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++)
    try {
      return await db.$transaction(
        async (tx) => {
          await tx.$executeRaw(
            Prisma.sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`,
          );
          return callback(tx);
        },
        { timeout: 45000, maxWait: 5000 },
      );
    } catch (error) {
      const e = error as { code?: string; meta?: { code?: string } };
      if (
        attempt === 0 &&
        (e?.code === "40001" ||
          e?.code === "P2034" ||
          (e?.code === "P2010" && e.meta?.code === "40001"))
      )
        continue;
      throw error;
    }
}
