import "server-only";
import { Prisma } from "@prisma/client";
import { payloadHash } from "../order-storage";
import { randomUUID } from "node:crypto";
import type { SqlDatabase } from "../database";
import { ConnectorReadError } from "../read-error";
export interface ReadJournal {
  readonly binding: string;
  get(key: string): Promise<unknown | null>;
  put(key: string, value: unknown): Promise<void>;
}
export interface JournalScope {
  tenantId: string;
  sourceId: string;
  revision: number;
  importRunId: string;
  db: SqlDatabase;
}
/** Immutable nested-query pages share the import's tenant/source/revision boundary and retention lifecycle. */
export function shopifyJournal(scope: JournalScope): ReadJournal {
  const { tenantId, sourceId, revision, importRunId, db } = scope;
  return {
    binding: `${tenantId}:${sourceId}:${revision}:${importRunId}`,
    async get(key) {
      const [r] = await db.$queryRaw<Array<{ payload: unknown }>>(
        Prisma.sql`SELECT payload FROM "DataSourceRecord" WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND "importRunId"=${importRunId} AND resource='shopify-query' AND "externalId"=${`${revision}:${key}`}`,
      );
      return r?.payload ?? null;
    },
    async put(key, value) {
      const payload = JSON.stringify(value);
      if (Buffer.byteLength(payload) > 4 * 1024 * 1024)
        throw new ConnectorReadError("RESPONSE_TOO_LARGE");
      await db.$transaction(async (tx) => {
        const [connection] = await tx.$queryRaw<Array<{ revision: number }>>(
          Prisma.sql`SELECT revision FROM "ConnectorConnection" WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} FOR SHARE`,
        );
        if (connection?.revision !== revision)
          throw new Error("CONNECTOR_CONFIG_CHANGED");
        const [size] = await tx.$queryRaw<Array<{ bytes: number; n: number }>>(
          Prisma.sql`SELECT COALESCE(sum(octet_length(payload::text)),0)::int bytes,count(*)::int n FROM "DataSourceRecord" WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND "importRunId"=${importRunId} AND resource='shopify-query'`,
        );
        if (
          size.bytes + Buffer.byteLength(payload) > 128 * 1024 * 1024 ||
          size.n >= 10000
        )
          throw new ConnectorReadError("RESPONSE_TOO_LARGE");
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO "DataSourceRecord" (id,"tenantId","sourceId","importRunId",resource,"externalId",payload,"payloadHash","observedAt") VALUES (${randomUUID()},${tenantId},${sourceId},${importRunId},'shopify-query',${`${revision}:${key}`},${payload}::jsonb,${payloadHash(value)},now()) ON CONFLICT ("importRunId",resource,"externalId") DO NOTHING`,
        );
      });
    },
  };
}
