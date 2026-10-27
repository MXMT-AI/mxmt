import "server-only";
import { Prisma } from "@prisma/client";
import type { SqlDatabase } from "./database";
import { accountBudgetKey } from "./budget";
import { ConnectorReadError } from "./read-error";
import { parseSourceJson } from "./json";
export interface QueryCostPolicy {
  estimatedCost: number;
  maximum: number;
  restoreRate: number;
}
interface CostState {
  available: number;
  maximum: number;
  restoreRate: number;
  at: string;
}
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000000;
function available(state: CostState, now: Date) {
  return Math.min(
    state.maximum,
    state.available +
      (Math.max(0, now.getTime() - Date.parse(state.at)) * state.restoreRate) /
        1000,
  );
}
export async function reserveQueryCost(
  db: SqlDatabase,
  key: string,
  policy: QueryCostPolicy,
  now = new Date(),
  backfill = false,
) {
  if (
    !finite(policy.estimatedCost) ||
    policy.estimatedCost < 1 ||
    !finite(policy.maximum) ||
    policy.maximum < policy.estimatedCost ||
    !finite(policy.restoreRate) ||
    policy.restoreRate <= 0
  )
    throw new ConnectorReadError("INVALID_RESPONSE");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO "ConnectorRequestBudget" ("accountKey") VALUES (${key}) ON CONFLICT DO NOTHING`,
    );
    const [row] = await tx.$queryRaw<
      Array<{ blockedUntil: Date | null; costState: CostState | null }>
    >(
      Prisma.sql`SELECT "blockedUntil","costState" FROM "ConnectorRequestBudget" WHERE "accountKey"=${key} FOR UPDATE`,
    );
    if (row.blockedUntil && row.blockedUntil > now) return row.blockedUntil;
    const state = row.costState ?? {
      available: policy.maximum,
      maximum: policy.maximum,
      restoreRate: policy.restoreRate,
      at: now.toISOString(),
    };
    if (
      !finite(state.available) ||
      !finite(state.maximum) ||
      state.available > state.maximum ||
      !finite(state.restoreRate) ||
      state.restoreRate <= 0 ||
      !Number.isFinite(Date.parse(state.at))
    )
      throw new ConnectorReadError("INVALID_RESPONSE");
    const balance = available(state, now);
    const required =
      policy.estimatedCost + (backfill ? Math.ceil(state.maximum * 0.2) : 0);
    if (required > state.maximum)
      throw new ConnectorReadError("INVALID_RESPONSE");
    if (balance < required)
      return new Date(
        now.getTime() +
          Math.ceil(((required - balance) / state.restoreRate) * 1000),
      );
    const next = {
      ...state,
      available: balance - policy.estimatedCost,
      at: now.toISOString(),
    };
    await tx.$executeRaw(
      Prisma.sql`UPDATE "ConnectorRequestBudget" SET "costState"=${JSON.stringify(next)}::jsonb WHERE "accountKey"=${key}`,
    );
    return null;
  });
}
/** Restrict parsing to a bounded clone; return the original body only after complete GraphQL success. */
export function graphqlBudgetedFetcher(
  identity: string,
  db: SqlDatabase,
  request: (url: URL, init: RequestInit) => Promise<Response>,
  policy: QueryCostPolicy,
  backfill = false,
) {
  const key = accountBudgetKey(identity);
  return async (url: URL, init: RequestInit) => {
    const retry = await reserveQueryCost(db, key, policy, new Date(), backfill);
    if (retry) throw new ConnectorReadError("RATE_LIMITED", retry);
    const response = await request(url, init);
    if (!response.ok) return response;
    const reader = response.clone().body?.getReader();
    if (!reader) throw new ConnectorReadError("INVALID_RESPONSE");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8 * 1024 * 1024) {
          void reader.cancel();
          throw new ConnectorReadError("RESPONSE_TOO_LARGE");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let body: any;
    try {
      body = parseSourceJson(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new ConnectorReadError("INVALID_RESPONSE");
    }
    const rawThrottle = body?.extensions?.cost?.throttleStatus;
    const number = (v: unknown) =>
      typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    const throttle =
      rawThrottle === undefined
        ? undefined
        : {
            maximumAvailable: number(rawThrottle?.maximumAvailable),
            currentlyAvailable: number(rawThrottle?.currentlyAvailable),
            restoreRate: number(rawThrottle?.restoreRate),
          };
    const throttled =
      Array.isArray(body?.errors) &&
      body.errors.some((e: any) => e?.extensions?.code === "THROTTLED");
    if (throttle !== undefined) {
      if (
        !finite(throttle.maximumAvailable) ||
        !finite(throttle.currentlyAvailable) ||
        !finite(throttle.restoreRate) ||
        throttle.restoreRate <= 0 ||
        throttle.currentlyAvailable > throttle.maximumAvailable
      )
        throw new ConnectorReadError("INVALID_RESPONSE");
      const maximum = throttle.maximumAvailable,
        current = throttle.currentlyAvailable,
        rate = throttle.restoreRate;
      await db.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<Array<{ costState: CostState }>>(
          Prisma.sql`SELECT "costState" FROM "ConnectorRequestBudget" WHERE "accountKey"=${key} FOR UPDATE`,
        );
        const now = new Date();
        // Out-of-order responses cannot credit cost already reserved by another worker.
        const state = {
          available: Math.min(available(row.costState, now), current),
          maximum,
          restoreRate: rate,
          at: now.toISOString(),
        };
        await tx.$executeRaw(
          Prisma.sql`UPDATE "ConnectorRequestBudget" SET "costState"=${JSON.stringify(state)}::jsonb WHERE "accountKey"=${key}`,
        );
      });
    }
    if (throttled) {
      const retryAt = new Date(Date.now() + 60000);
      await db.$executeRaw(
        Prisma.sql`UPDATE "ConnectorRequestBudget" SET "blockedUntil"=GREATEST(COALESCE("blockedUntil",${retryAt}),${retryAt}) WHERE "accountKey"=${key}`,
      );
      throw new ConnectorReadError("RATE_LIMITED", retryAt);
    }
    if (
      !body ||
      typeof body !== "object" ||
      (body.errors !== undefined &&
        (!Array.isArray(body.errors) || body.errors.length > 0)) ||
      !body.data
    )
      throw new ConnectorReadError("INVALID_RESPONSE");
    return response;
  };
}
