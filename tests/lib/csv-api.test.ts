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
import { csvOptions, csvPacket } from "../fixtures/csv-connector";
import { signAccessToken } from "@/lib/auth";
import { GET, POST } from "@/app/api/connectors/csv/uploads/route";
import {
  GET as GET_ONE,
  POST as ACTION,
} from "@/app/api/connectors/csv/uploads/[id]/route";
let f: Awaited<ReturnType<typeof createScreenDb>>, id: string, hash: string;
const request = (body?: unknown, suffix = "") =>
  new NextRequest("https://app.test/api/connectors/csv/uploads" + suffix, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": "b",
      "x-user-role": "SUPER_ADMIN",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const login = async (role = "ADMIN", tenantId = "a") => {
  state.cookie = await signAccessToken({ sub: "owner", tenantId, role });
};
beforeAll(async () => {
  vi.stubEnv("JWT_ACCESS_SECRET", "csv-api-secret");
  vi.stubEnv(
    "CONNECTOR_ENCRYPTION_KEY",
    Buffer.alloc(32, 8).toString("base64"),
  );
  f = await createScreenDb();
  state.db = f.db;
}, 30000);
afterAll(async () => {
  await f?.pg.close();
  vi.unstubAllEnvs();
});
it("requires signed ADMIN for every CSV file/preview/job operation and bounds chunked request bodies", async () => {
  expect((await GET(request())).status).toBe(401);
  await login("VIEWER");
  expect((await GET(request())).status).toBe(403);
  expect(
    (
      await POST(
        request({ sourceId: null, options: csvOptions, files: csvPacket() }),
      )
    ).status,
  ).toBe(403);
  await login();
  expect((await POST(request({ junk: "a".repeat(1500001) }))).status).toBe(413);
  expect(
    (
      await POST(
        request({
          tenantId: "b",
          sourceId: null,
          options: csvOptions,
          files: csvPacket(),
        }),
      )
    ).status,
  ).toBe(400);
});
it("creates only signed-tenant previews, returns safe no-store errors and downloads byte-identical files", async () => {
  const result = await POST(
    request({ sourceId: null, options: csvOptions, files: csvPacket() }),
  );
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(result.headers.get("x-request-id")).toBeTruthy();
  const data = await result.json();
  id = data.id;
  hash = data.contentHash;
  const file = await GET_ONE(request(undefined, `/${id}?file=orders`), {
    params: Promise.resolve({ id }),
  });
  expect(file.status).toBe(200);
  expect(Buffer.from(await file.arrayBuffer())).toEqual(
    Buffer.from(csvPacket()[2].bytes, "base64"),
  );
  expect(file.headers.get("content-disposition")).toContain("attachment");
  await login("ADMIN", "b");
  for (const suffix of ["", "?file=orders"])
    expect(
      (
        await GET_ONE(request(undefined, `/${id}${suffix}`), {
          params: Promise.resolve({ id }),
        })
      ).status,
    ).toBe(404);
  expect(
    (
      await ACTION(request({ action: "process", hash }, `/${id}`), {
        params: Promise.resolve({ id }),
      })
    ).status,
  ).toBe(404);
  await login();
  const unknown = await GET_ONE(request(undefined, "/missing"), {
    params: Promise.resolve({ id: "missing" }),
  });
  expect(await unknown.json()).toMatchObject({ code: "CSV_NOT_FOUND" });
});
it("does not accept identity/job overrides or mismatched preview hashes", async () => {
  expect(
    (
      await ACTION(
        request({ action: "activate", hash, jobId: "foreign" }, `/${id}`),
        { params: Promise.resolve({ id }) },
      )
    ).status,
  ).toBe(400);
  const bad = await ACTION(
    request({ action: "activate", hash: "0".repeat(64) }, `/${id}`),
    { params: Promise.resolve({ id }) },
  );
  expect(bad.status).toBe(409);
  expect((await bad.json()).code).toBe("CSV_HASH_CHANGED");
  const denied = await ACTION(request({ action: "activate", hash }, `/${id}`), {
    params: Promise.resolve({ id }),
  });
  expect((await denied.json()).code).toBe("CSV_SELECT_SOURCE_FIRST");
});
