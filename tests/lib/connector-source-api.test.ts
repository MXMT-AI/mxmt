import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ db: null as any, cookie: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: state.cookie }) }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (q: any) => state.db.$queryRaw(q),
    $executeRaw: (q: any) => state.db.$executeRaw(q),
    $transaction: (fn: any) => state.db.$transaction(fn),
  },
}));
import { createScreenDb } from "../helpers/screen-db";
import { signAccessToken } from "@/lib/auth";
import { GET, POST } from "@/app/api/connectors/source/route";
let f: Awaited<ReturnType<typeof createScreenDb>>;
const request = (body?: unknown) =>
  new NextRequest("https://app.test/api/connectors/source", {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": "b",
      "x-user-role": "SUPER_ADMIN",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const login = async (role = "ADMIN") => {
  state.cookie = await signAccessToken({ sub: "owner", tenantId: "a", role });
};
beforeAll(async () => {
  vi.stubEnv("JWT_ACCESS_SECRET", "source-api-fixture-key");
  f = await createScreenDb();
  state.db = f.db;
  await f.pg.exec(
    `INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('alt','a','CSV','upload',now()),('foreign','b','CSV','upload',now()); INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId",provider,"accountHost","encryptedConfig","lastCheck","updatedAt") VALUES ('alt','a','alt','csv','upload','synthetic','{"ok":true}',now()),('foreign','b','foreign','csv','upload','synthetic','{"ok":true}',now());`,
  );
}, 30000);
afterAll(async () => {
  await f?.pg.close();
  vi.unstubAllEnvs();
});
it("requires signed sessions, hides credentials and lists only tenant-owned source choices", async () => {
  expect((await GET(request())).status).toBe(401);
  await login("VIEWER");
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.text();
  expect(body).not.toContain("encryptedConfig");
  expect(body).not.toContain("synthetic");
  expect(JSON.parse(body).connections).toHaveLength(2);
  expect((await POST(request({ sourceId: "alt", revision: 0 }))).status).toBe(
    403,
  );
});
it("rejects identity overrides, cross-tenant targets and stale revisions before changing the source", async () => {
  await login();
  expect(
    (await POST(request({ sourceId: "alt", revision: 0, tenantId: "b" })))
      .status,
  ).toBe(400);
  expect(
    (await POST(request({ sourceId: "foreign", revision: 0 }))).status,
  ).toBe(404);
  const saved = await POST(request({ sourceId: "alt", revision: 0 }));
  expect(saved.status).toBe(200);
  expect((await saved.json()).sourceId).toBe("alt");
  expect(
    (await POST(request({ sourceId: "source", revision: 0 }))).status,
  ).toBe(409);
});
