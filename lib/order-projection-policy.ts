import { Prisma } from "@prisma/client";
import type { OrderPolicy } from "./connectors/order-normalization";
import {
  defaultClientSettings,
  type ClientMerchandisingSettings,
} from "./merchandising-settings";
import { clientOrderFilterFingerprint } from "./merchandising-order-policy";
export function trustedOrderProjectionSql(
  policy: OrderPolicy,
  client: ClientMerchandisingSettings,
) {
  const json = (v: unknown) => Prisma.sql`${JSON.stringify(v)}::jsonb`;
  return Prisma.sql`(l.normalization->>'version'='2' AND COALESCE(l.normalization->>'filterFingerprint',${clientOrderFilterFingerprint(defaultClientSettings())})=${clientOrderFilterFingerprint(client)} AND j.checkpoint->'policy' IS NOT NULL
 AND COALESCE(j.checkpoint->'policy'->'statuses','{}'::jsonb)=${json(policy.statuses ?? {})}
 AND COALESCE(j.checkpoint->'policy'->'amounts','null'::jsonb)=${json(policy.amounts ?? null)}
 AND COALESCE(j.checkpoint->'policy'->'dates','null'::jsonb)=${json(policy.dates ?? null)})`;
}
