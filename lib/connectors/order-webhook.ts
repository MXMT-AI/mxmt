import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isRecord } from "@/lib/api-contracts";
import { payloadHash } from "./order-storage";

/** Our relay authorization token, NOT a claimed SalesDrive-native signature. */
export function salesDriveWebhookToken(sourceId: string, secret = process.env.SALESDRIVE_WEBHOOK_SECRET): string | null {
  if (!secret || Buffer.byteLength(secret) < 32) return null;
  return createHmac("sha256", secret).update(`salesdrive:orders:v1:${sourceId}`).digest("hex");
}
/** Authenticate this source only; missing relay configuration keeps the receiver disabled. */
export function webhookAuthorized(sourceId: string, authorization: string | null) {
  const token = salesDriveWebhookToken(sourceId);
  if (!token || !authorization) return false;
  const provided = Buffer.from(authorization), expected = Buffer.from(`Bearer ${token}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
/** Validate documented event/account identity without coercing unsafe or non-scalar order IDs. */
export function parseOrderWebhook(value: unknown, accountHost: string) {
  if (!isRecord(value) || !isRecord(value.info) || !isRecord(value.data)) return null;
  const { info, data } = value;
  if (info.webhookType !== "order" || !["new_order", "status_change", "check_fiscalize", "delivery_not_collected"].includes(String(info.webhookEvent)) ||
    ![accountHost, accountHost.replace(/\.salesdrive\.me$/, "")].includes(String(info.account))) return null;
  if (typeof data.id !== "string" && !(typeof data.id === "number" && Number.isSafeInteger(data.id))) return null;
  const orderId = String(data.id);
  if (!/^\d{1,20}$/.test(orderId)) return null;
  return { orderId, eventKey: payloadHash(value), payload: value };
}
