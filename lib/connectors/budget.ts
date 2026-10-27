import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchWithTimeout } from "@/lib/server-fetch";
import { ConnectorReadError } from "./read-error";
import type { SqlDatabase } from "./database";

export interface RequestWindow {milliseconds:number;limit:number}

// Conservative public limits until account-specific evidence is available.
export const REQUEST_WINDOWS = [{ milliseconds: 60_000, limit: 10 }, { milliseconds: 3_600_000, limit: 100 }, { milliseconds: 86_400_000, limit: 1000 }] as const;
export const accountBudgetKey = (host: string) => createHash("sha256").update(host.toLowerCase()).digest("hex");

/** Lock the account row before counting rolling windows; reservations survive failed requests. */
export async function reserveRequest(db: SqlDatabase, key: string, now = new Date(), backfill = false, windows:ReadonlyArray<RequestWindow>=REQUEST_WINDOWS): Promise<Date | null> {
  if(windows.some(w=>!Number.isSafeInteger(w.limit)||w.limit<1||!Number.isSafeInteger(w.milliseconds)||w.milliseconds<1||w.milliseconds>86400000)) throw new Error("CONNECTOR_BUDGET_UNVERIFIED");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`INSERT INTO "ConnectorRequestBudget" ("accountKey") VALUES (${key}) ON CONFLICT DO NOTHING`);
    const [budget] = await tx.$queryRaw<Array<{ blockedUntil: Date | null }>>(Prisma.sql`SELECT "blockedUntil" FROM "ConnectorRequestBudget" WHERE "accountKey"=${key} FOR UPDATE`);
    if (budget.blockedUntil && budget.blockedUntil > now) return budget.blockedUntil;
    if(windows.length===0) return null;
    await tx.$executeRaw(Prisma.sql`DELETE FROM "ConnectorRequestAttempt" WHERE "accountKey"=${key} AND at <= ${new Date(now.getTime() - 86_400_000)}`);
    const attempts = await tx.$queryRaw<Array<{ at: Date }>>(Prisma.sql`SELECT at FROM "ConnectorRequestAttempt" WHERE "accountKey"=${key} ORDER BY at ASC`);
    let retry = 0;
    for (const window of windows) {
      const recent = attempts.filter(({ at }) => at.getTime() > now.getTime() - window.milliseconds);
      const limit = backfill ? Math.max(1,Math.floor(window.limit * 0.8)) : window.limit;
      if (recent.length >= limit) retry = Math.max(retry, recent[recent.length - limit].at.getTime() + window.milliseconds);
    }
    if (retry) return new Date(retry);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "ConnectorRequestAttempt" (id,"accountKey",at) VALUES (${randomUUID()},${key},${now})`);
    return null;
  });
}

export function retryAfter(value: string | null, now = new Date()): Date {
  const seconds = value && /^\d+$/.test(value) ? Number(value) : NaN;
  const timestamp = Number.isFinite(seconds) ? now.getTime() + seconds * 1000 : value ? Date.parse(value) : NaN;
  return new Date(Number.isFinite(timestamp) ? Math.min(Math.max(timestamp, now.getTime() + 1000), now.getTime() + 86_400_000) : now.getTime() + 60_000);
}

/** Every application transport uses the same durable budget, including connection checks. */
export function budgetedFetcher(host: string, db: SqlDatabase = prisma, fetcher = fetchWithTimeout, backfill = false, windows:ReadonlyArray<RequestWindow>=REQUEST_WINDOWS) {
  const key = accountBudgetKey(host);
  return async (url: URL, init: RequestInit): Promise<Response> => {
    const retryAt = await reserveRequest(db, key, new Date(), backfill,windows);
    if (retryAt) throw new ConnectorReadError("RATE_LIMITED", retryAt);
    const response = await fetcher(url, init);
    if (response.status === 429) {
      const retryAt = retryAfter(response.headers.get("Retry-After"));
      await db.$executeRaw(Prisma.sql`UPDATE "ConnectorRequestBudget" SET "blockedUntil"=GREATEST(COALESCE("blockedUntil",${retryAt}),${retryAt}) WHERE "accountKey"=${key}`);
      await response.body?.cancel().catch(() => undefined);
      throw new ConnectorReadError("RATE_LIMITED", retryAt);
    }
    return response;
  };
}
