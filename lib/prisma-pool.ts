/** Translate the previous Prisma URL pool options for the native pg adapter. */
export function prismaPoolOptions(connectionString?: string) {
  // Builds can generate/prerender public pages without a DB. Never use pg's ambient localhost defaults.
  const url = new URL(connectionString ?? "postgresql://unconfigured.invalid/mxmt");
  const positive = (name: string, fallback: number) => {
    const raw = url.searchParams.get(name);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid database option: ${name}`);
    return value;
  };
  const max = positive("connection_limit", 10);
  const connectionTimeoutMillis = positive("connect_timeout", 5) * 1000;
  for (const key of ["connection_limit", "connect_timeout", "pool_timeout", "pgbouncer"]) url.searchParams.delete(key);
  return { connectionString: url.toString(), max, connectionTimeoutMillis, idleTimeoutMillis: 300_000 };
}
