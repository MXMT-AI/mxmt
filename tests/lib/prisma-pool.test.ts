import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { createServer, type Socket } from "node:net";
import { once } from "node:events";
import { createPrismaPool, prismaPoolOptions } from "@/lib/prisma-pool";

describe("Prisma native pg pool compatibility", () => {
  it("keeps the pooled endpoint/TLS and translates supported Prisma limits", () => {
    const options = prismaPoolOptions("postgresql://user:synthetic@project-pooler.region.neon.tech/db?sslmode=require&connection_limit=3&connect_timeout=7&pgbouncer=true");
    const url = new URL(options.connectionString);
    expect(url.hostname).toBe("project-pooler.region.neon.tech");
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.has("connection_limit")).toBe(false);
    expect(url.searchParams.has("pgbouncer")).toBe(false);
    expect(options).toMatchObject({ max: 3, connectionTimeoutMillis: 7000, idleTimeoutMillis: 300000 });
  });
  it("bounds defaults and fails closed without an ambient localhost connection", () => {
    expect(prismaPoolOptions()).toMatchObject({ max: 10, connectionTimeoutMillis: 5000 });
    expect(new URL(prismaPoolOptions().connectionString).hostname).toBe("unconfigured.invalid");
  });
  it.each(["0", "-1", "1.5", "NaN"])("rejects invalid limits: %s", value => {
    expect(() => prismaPoolOptions(`postgresql://synthetic/db?connection_limit=${value}`)).toThrow("Invalid database option");
  });
});


function mockWireConnections() {
  vi.spyOn(Client.prototype, "connect").mockImplementation(function (callback) {
    queueMicrotask(() => (callback as (error: null) => void)(null));
    return undefined as never;
  });
  const query = vi.spyOn(Client.prototype, "query").mockResolvedValue({ rows: [] } as never);
  vi.spyOn(Client.prototype, "end").mockImplementation(function (callback) {
    queueMicrotask(() => (callback as (() => void) | undefined)?.());
    return undefined as never;
  });
  return query;
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it.each(["connect_timeout", "pool_timeout"])("keeps zero as disabled for %s", name => {
  const options = prismaPoolOptions(`postgresql://synthetic/db?${name}=0`);
  expect(options[name === "connect_timeout" ? "connectionTimeoutMillis" : "acquisitionTimeoutMillis"]).toBe(0);
});
it.each(["connect_timeout", "pool_timeout"])("rejects invalid or overflowing %s", name => {
  for (const value of ["", "-1", "1.5", "NaN", "2147484"])
    expect(() => prismaPoolOptions(`postgresql://synthetic/db?${name}=${value}`)).toThrow("Invalid database option");
});
it("separates the default deadlines and retains custom schema outside the driver URL", () => {
  const options = prismaPoolOptions("postgresql://synthetic/db?schema=custom&pool_timeout=60");
  expect(options).toMatchObject({ schema: "custom", connectionTimeoutMillis: 5000, acquisitionTimeoutMillis: 60000 });
  expect(new URL(options.connectionString).searchParams.has("schema")).toBe(false);
  expect(prismaPoolOptions().acquisitionTimeoutMillis).toBe(10000);
});
it.each([undefined, "60"])("does not time out a saturated pool at the connection deadline (%s)", async seconds => {
  vi.useFakeTimers(); mockWireConnections();
  const pool = createPrismaPool(prismaPoolOptions(`postgresql://synthetic/db?connection_limit=1${seconds ? `&pool_timeout=${seconds}` : ""}`));
  const held = await pool.connect();
  try {
    const result = pool.connect().then(client => { client.release(); return "acquired"; }, error => error.message);
    await vi.advanceTimersByTimeAsync(5001);
    expect(pool.waitingCount).toBe(1);
    await vi.advanceTimersByTimeAsync((seconds ? 60000 : 10000) - 5001);
    expect(await result).toContain("timeout exceeded");
    expect(pool.waitingCount).toBe(0);
  } finally { held.release(); await pool.end(); }
});
it("disables only the pool deadline and releases a waiting checkout normally", async () => {
  vi.useFakeTimers(); mockWireConnections();
  const pool = createPrismaPool(prismaPoolOptions("postgresql://synthetic/db?connection_limit=1&pool_timeout=0"));
  const held = await pool.connect();
  const waiting = pool.connect();
  await vi.advanceTimersByTimeAsync(60000);
  expect(pool.waitingCount).toBe(1);
  held.release();
  const next = await waiting;
  next.release();
  await pool.end();
});
it("quotes the exact schema for raw SQL sessions without executing identifier text", async () => {
  const query = mockWireConnections();
  const schema = 'tenant \"quoted\",public';
  const pool = createPrismaPool(prismaPoolOptions(`postgresql://synthetic/db?schema=${encodeURIComponent(schema)}`));
  const client = await pool.connect();
  expect(query).toHaveBeenCalledWith("SELECT set_config('search_path', $1, false)", ['"tenant ""quoted"",public"']);
  client.release(); await pool.end();
});
it("enforces physical connect_timeout even when pool_timeout is disabled", async () => {
  const sockets = new Set<Socket>();
  const server = createServer(socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test listener");
  const pool = createPrismaPool(prismaPoolOptions(`postgresql://synthetic:synthetic@127.0.0.1:${address.port}/db?sslmode=disable&connect_timeout=1&pool_timeout=0`));
  try { await expect(pool.connect()).rejects.toThrow(/timeout/); }
  finally {
    for (const socket of sockets) socket.destroy();
    await pool.end();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

it.each([
  "postgresql://synthetic@ep-app-pooler.eu-central-1.aws.neon.tech/db?schema=custom",
  "postgresql://synthetic@ep-app-pooler.eu-central-1.aws.neon.tech/db?schema=custom&pgbouncer=false",
  "postgresql://synthetic@db.example/db?schema=custom&pgbouncer=true",
])("rejects custom schemas over transaction pooling before connecting: %s", url => {
  const connect = vi.spyOn(Client.prototype, "connect");
  expect(() => createPrismaPool(prismaPoolOptions(url))).toThrow("Custom schemas require a direct DATABASE_URL");
  expect(connect).not.toHaveBeenCalled();
});
it.each([
  "postgresql://synthetic@ep-app-pooler.eu-central-1.aws.neon.tech/db",
  "postgresql://synthetic@db.example/db?schema=public&pgbouncer=true",
])("never issues session search_path through transaction pooling: %s", async url => {
  const query = mockWireConnections();
  const pool = createPrismaPool(prismaPoolOptions(url));
  const client = await pool.connect();
  expect(query).not.toHaveBeenCalled();
  client.release(); await pool.end();
});
it("rejects repeated schema selectors instead of checking and using different values", () => {
  expect(() => prismaPoolOptions("postgresql://synthetic/db?schema=public&schema=custom")).toThrow("Invalid database option: schema");
});
