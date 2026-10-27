import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createMerchandisingDb } from "../helpers/merchandising-db";
import { reserveRequest, accountBudgetKey } from "@/lib/connectors/budget";
import {
  reserveQueryCost,
  graphqlBudgetedFetcher,
} from "@/lib/connectors/query-cost";
let f: Awaited<ReturnType<typeof createMerchandisingDb>>;
beforeAll(async () => {
  f = await createMerchandisingDb();
}, 30000);
afterAll(async () => f?.pg.close());
it("applies provider/account windows without mixing independent credentials or erasing backfill headroom", async () => {
  const now = new Date("2026-10-27T00:00:00Z"),
    windows = [{ milliseconds: 60000, limit: 2 }];
  const a = accountBudgetKey("keycrm:verified-account-a"),
    b = accountBudgetKey("keycrm:verified-account-b"),
    other = accountBudgetKey("shopify:verified-account-a");
  expect(await reserveRequest(f.db, a, now, false, windows)).toBeNull();
  expect(await reserveRequest(f.db, a, now, false, windows)).toBeNull();
  expect(await reserveRequest(f.db, a, now, false, windows)).toEqual(
    new Date("2026-10-27T00:01:00Z"),
  );
  expect(await reserveRequest(f.db, b, now, false, windows)).toBeNull();
  expect(await reserveRequest(f.db, other, now, false, windows)).toBeNull();
  expect(
    await reserveRequest(f.db, "single", now, true, [
      { milliseconds: 60000, limit: 1 },
    ]),
  ).toBeNull();
});
it("persists query-cost reservations and restores credit over time instead of sleeping in a worker", async () => {
  const policy = { estimatedCost: 40, maximum: 100, restoreRate: 10 },
    now = new Date("2026-10-27T01:00:00Z");
  expect(await reserveQueryCost(f.db, "cost", policy, now)).toBeNull();
  expect(await reserveQueryCost(f.db, "cost", policy, now)).toBeNull();
  expect(await reserveQueryCost(f.db, "cost", policy, now)).toEqual(
    new Date(now.getTime() + 2000),
  );
  expect(
    await reserveQueryCost(
      f.db,
      "cost",
      policy,
      new Date(now.getTime() + 2000),
    ),
  ).toBeNull();
});
it("reads Shopify-style cost feedback and rejects HTTP-200 GraphQL failures without exposing partial data", async () => {
  const url = new URL(
      "https://fixture.myshopify.com/admin/api/2026-10/graphql.json",
    ),
    policy = { estimatedCost: 50, maximum: 100, restoreRate: 10 };
  const remote = vi.fn(async () =>
    Response.json({
      data: { orders: [] },
      extensions: {
        cost: {
          throttleStatus: {
            maximumAvailable: 100,
            currentlyAvailable: 20,
            restoreRate: 10,
          },
        },
      },
    }),
  );
  const fetcher = graphqlBudgetedFetcher(
    "shopify:fixture",
    f.db,
    remote,
    policy,
  );
  expect((await fetcher(url, { method: "POST" })).ok).toBe(true);
  await expect(fetcher(url, { method: "POST" })).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
  expect(remote).toHaveBeenCalledTimes(1);
  const errors = graphqlBudgetedFetcher(
    "shopify:errors",
    f.db,
    async () =>
      Response.json({
        data: { partial: "private" },
        errors: [
          {
            message: "private customer details",
            extensions: { code: "ACCESS_DENIED" },
          },
        ],
      }),
    policy,
  );
  await expect(errors(url, {})).rejects.toMatchObject({
    message: "INVALID_RESPONSE",
  });
  const throttled = graphqlBudgetedFetcher(
    "shopify:throttle",
    f.db,
    async () =>
      Response.json({
        errors: [{ message: "private", extensions: { code: "THROTTLED" } }],
      }),
    policy,
  );
  await expect(throttled(url, {})).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
  await expect(
    reserveQueryCost(f.db, accountBudgetKey("shopify:throttle"), policy),
  ).resolves.toBeInstanceOf(Date);
});

it("reserves query-cost headroom for routine work during backfill", async () => {
  const now = new Date("2026-10-27T02:00:00Z"),
    policy = { estimatedCost: 50, maximum: 100, restoreRate: 10 };
  expect(
    await reserveQueryCost(f.db, "cost-headroom", policy, now, true),
  ).toBeNull();
  expect(
    await reserveQueryCost(f.db, "cost-headroom", policy, now, true),
  ).toEqual(new Date(now.getTime() + 2000));
  expect(
    await reserveQueryCost(f.db, "cost-headroom", policy, now, false),
  ).toBeNull();
});
