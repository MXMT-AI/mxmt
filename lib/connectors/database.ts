import type { Prisma } from "@prisma/client";
/** Minimal SQL boundary, also exercised against isolated PostgreSQL in tests. */
export interface SqlClient {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
  $executeRaw(query: Prisma.Sql): Promise<number>;
}
export interface SqlDatabase extends SqlClient {
  $transaction<T>(callback: (tx: SqlClient) => Promise<T>, options?: { timeout?: number; maxWait?: number }): Promise<T>;
}
