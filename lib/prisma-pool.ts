import { PrismaPg } from "@prisma/adapter-pg";
import { Client, Pool, escapeIdentifier, type ClientConfig } from "pg";
import { databaseSchemaPolicy } from "./database-schema-policy.mjs";

export function prismaPoolOptions(connectionString?: string) {
  const url = new URL(connectionString ?? "postgresql://unconfigured.invalid/mxmt");
  const integer = (name: string, fallback: number, minimum: number) => {
    const raw = url.searchParams.get(name);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!raw.trim() || !Number.isSafeInteger(value) || value < minimum)
      throw new Error(`Invalid database option: ${name}`);
    return value;
  };
  const milliseconds = (name: string, fallback: number) => {
    const value = integer(name, fallback, 0) * 1000;
    if (value > 2_147_483_647) throw new Error(`Invalid database option: ${name}`);
    return value;
  };
  const max = integer("connection_limit", 10, 1);
  const connectionTimeoutMillis = milliseconds("connect_timeout", 5);
  const acquisitionTimeoutMillis = milliseconds("pool_timeout", 10);
  const { schema, useSessionSearchPath } = databaseSchemaPolicy(url);
  for (const key of ["connection_limit", "connect_timeout", "pool_timeout", "pgbouncer", "schema"])
    url.searchParams.delete(key);
  return { connectionString: url.toString(), max, connectionTimeoutMillis,
    acquisitionTimeoutMillis, schema, useSessionSearchPath, idleTimeoutMillis: 300_000 };
}

export function createPrismaPool(options: ReturnType<typeof prismaPoolOptions>) {
  const { connectionTimeoutMillis, acquisitionTimeoutMillis, schema, useSessionSearchPath, ...config } = options;
  class ConnectionClient extends Client {
    constructor(clientConfig?: ClientConfig) {
      super({ ...clientConfig, connectionTimeoutMillis });
    }
  }
  return new Pool({
    ...config,
    Client: ConnectionClient,
    connectionTimeoutMillis: acquisitionTimeoutMillis,
    onConnect: useSessionSearchPath ? async client => {
      await client.query("SELECT set_config('search_path', $1, false)", [escapeIdentifier(schema)]);
    } : undefined,
  });
}

export function prismaPgAdapter(connectionString?: string) {
  const options = prismaPoolOptions(connectionString);
  return new PrismaPg(createPrismaPool(options), { schema: options.schema, disposeExternalPool: true });
}
