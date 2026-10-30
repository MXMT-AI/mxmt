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
        const [run] = await tx.$queryRaw<Array<{ bytes: number; n: number }>>(
          Prisma.sql`SELECT "connectorJournalBytes" bytes,"connectorJournalPages" n FROM "DataImportRun"
            WHERE id=${importRunId} AND "tenantId"=${tenantId} AND "sourceId"=${sourceId} FOR UPDATE`,
        );
        if (!run) throw new Error("CONNECTOR_CONFIG_CHANGED");
        const [existing] = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT id FROM "DataSourceRecord" WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId}
            AND "importRunId"=${importRunId} AND resource='shopify-query' AND "externalId"=${`${revision}:${key}`}`,
        );
        if (existing) return;
        const [incoming] = await tx.$queryRaw<Array<{ bytes: number }>>(
          Prisma.sql`SELECT octet_length(${payload}::jsonb::text)::int bytes`,
        );
        if (run.bytes + incoming.bytes > 128 * 1024 * 1024 || run.n >= 10000)
          throw new ConnectorReadError("RESPONSE_TOO_LARGE");
        const inserted = await tx.$executeRaw(
          Prisma.sql`INSERT INTO "DataSourceRecord" (id,"tenantId","sourceId","importRunId",resource,"externalId",payload,"payloadHash","observedAt") VALUES (${randomUUID()},${tenantId},${sourceId},${importRunId},'shopify-query',${`${revision}:${key}`},${payload}::jsonb,${payloadHash(value)},now()) ON CONFLICT ("importRunId",resource,"externalId") DO NOTHING`,
        );
        if (inserted)
          await tx.$executeRaw(
            Prisma.sql`UPDATE "DataImportRun" SET "connectorJournalBytes"="connectorJournalBytes"+${incoming.bytes},
            "connectorJournalPages"="connectorJournalPages"+1 WHERE id=${importRunId} AND "tenantId"=${tenantId} AND "sourceId"=${sourceId}`,
          );
      });
    },
  };
}
