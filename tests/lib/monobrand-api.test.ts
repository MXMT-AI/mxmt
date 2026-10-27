import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  db: null as any,
  cookies: new Map<string, string>(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => ({ value: m.cookies.get(key) }),
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (q: any) => m.db.$queryRaw(q),
    $executeRaw: (q: any) => m.db.$executeRaw(q),
    $transaction: (fn: any, options: any) => m.db.$transaction(fn, options),
  },
}));
import { createMonobrandDb } from "../helpers/monobrand-db";
import { screenSelection } from "../helpers/screen-db";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import {
  createRepricingInputs,
  getRepricingPreview,
} from "@/lib/repricing-store";
import { signAccessToken } from "@/lib/auth";
import { GET as screenGet } from "@/app/api/merchandising/[screen]/route";
import {
  POST as exportPost,
  GET as historyGet,
} from "@/app/api/merchandising/exports/route";
import { GET as fileGet } from "@/app/api/merchandising/exports/[exportId]/route";
import {
  GET as importGet,
  POST as importPost,
} from "@/app/api/connectors/salesdrive/import/route";
let f: Awaited<ReturnType<typeof createMonobrandDb>>, b: string, command: any;
const request = (path: string, body?: unknown) =>
  new NextRequest("https://app.test" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": "a",
      "x-user-role": "SUPER_ADMIN",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const login = async (tenantId: "a" | "b", role = "ADMIN") =>
  m.cookies.set(
    "access_token",
    await signAccessToken({
      sub: tenantId === "a" ? "owner" : "owner-b",
      tenantId,
      role,
    }),
  );
beforeAll(async () => {
  vi.stubEnv("JWT_ACCESS_SECRET", "monobrand-isolation-secret");
  f = await createMonobrandDb();
  m.db = f.db;
  b = (await createScreenSnapshot("b", screenSelection, f.db)).snapshotId;
  const { inputSetId } = await createRepricingInputs(
      "b",
      b,
      f.db,
      screenSelection.now,
    ),
    p = await getRepricingPreview("b", { inputSetId }, f.db);
  command = {
    exportId: "50505050-5050-4050-8050-505050505052",
    kind: "reprice",
    previewId: p.previewId,
    scenario: { inputSetId },
  };
}, 30000);
afterAll(async () => {
  await f?.pg.close();
  vi.unstubAllEnvs();
});
it("binds all five screen APIs to the signed client even when identity headers are forged", async () => {
  for (const screen of [
    "overview",
    "sales",
    "stock",
    "repricing",
    "reordering",
  ]) {
    await login("b", "VIEWER");
    const own = await screenGet(
      request(`/api/merchandising/${screen}?snapshotId=${b}`),
      { params: Promise.resolve({ screen }) },
    );
    expect(own.status).toBe(200);
    expect((await own.json()).context.profileMode).toBe("MONOBRAND");
    await login("a");
    const other = await screenGet(
      request(`/api/merchandising/${screen}?snapshotId=${b}`),
      { params: Promise.resolve({ screen }) },
    );
    expect(other.status).toBe(404);
  }
});
it("isolates export creation, stored downloads and history through the authenticated APIs", async () => {
  await login("b", "VIEWER");
  expect(
    (await exportPost(request("/api/merchandising/exports", command))).status,
  ).toBe(403);
  await login("b");
  const created = await exportPost(
    request("/api/merchandising/exports", command),
  );
  expect(created.status).toBe(201);
  const receipt = await created.json();
  await login("a");
  const file = await fileGet(request(receipt.files[0].url), {
    params: Promise.resolve({ exportId: receipt.exportId }),
  });
  expect(file.status).toBe(404);
  expect(
    (await exportPost(request("/api/merchandising/exports", command))).status,
  ).toBe(404);
  expect(
    (
      await (
        await historyGet(request("/api/merchandising/exports?kind=reprice"))
      ).json()
    ).rows,
  ).toEqual([]);
  await login("b", "VIEWER");
  expect(
    (
      await (
        await historyGet(request("/api/merchandising/exports?kind=reprice"))
      ).json()
    ).rows,
  ).toHaveLength(1);
});
it("exposes and resumes only the current client import job", async () => {
  await f.pg.exec(
    `UPDATE "ConnectorSyncJob" SET state='PAUSED' WHERE id='orders-job'`,
  );
  await login("b", "VIEWER");
  const bProgress = await importGet(
    request("/api/connectors/salesdrive/import"),
  );
  expect((await bProgress.json()).job.id).toBe("bimba:orders-job");
  expect(
    (
      await importPost(
        request("/api/connectors/salesdrive/import", { action: "resume" }),
      )
    ).status,
  ).toBe(403);
  await login("b");
  expect(
    (
      await importPost(
        request("/api/connectors/salesdrive/import", { action: "resume" }),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await f.pg.query(
        `SELECT state FROM "ConnectorSyncJob" WHERE id='orders-job'`,
      )
    ).rows,
  ).toEqual([{ state: "PAUSED" }]);
});
