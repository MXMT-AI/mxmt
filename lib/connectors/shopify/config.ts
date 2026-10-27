import { isRecord } from "@/lib/api-contracts";
import { utcWatermark } from "../requests";
export const SHOPIFY_VERSION = "2026-10";
export interface ShopifyConfig {
  shop: string;
  appId: string;
  accessToken: string;
  timezone: string;
  mappingRevision: number;
  evidence: {
    reference: string;
    currency: string;
    physicalStock: boolean;
    locationIds: string[];
    financials: boolean;
    history: null | { from: string; to: string; reference: string };
  };
}
/** Only a canonical permanent Shopify host is eligible for token forwarding. */
export function shopHost(v: unknown): string | null {
  return typeof v === "string" &&
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(v)
    ? v
    : null;
}
const keys = (v: Record<string, unknown>, allow: string[]) =>
  Object.keys(v).every((k) => allow.includes(k));
/** Parse secrets and independently approved money, warehouse and history evidence. */
export function parseShopifyConfig(v: unknown): {
  credentials: ShopifyConfig | null;
  issues: string[];
} {
  const bad = () => ({
    credentials: null,
    issues: ["Invalid Shopify connection or account evidence"],
  });
  if (
    !isRecord(v) ||
    !keys(v, [
      "shop",
      "appId",
      "accessToken",
      "timezone",
      "mappingRevision",
      "evidence",
    ]) ||
    !shopHost(v.shop) ||
    typeof v.appId !== "string" ||
    !/^gid:\/\/shopify\/App\/\d{1,25}$/.test(v.appId) ||
    typeof v.accessToken !== "string" ||
    !/^[\x21-\x7e]{16,4096}$/.test(v.accessToken) ||
    typeof v.timezone !== "string" ||
    v.timezone.length > 100 ||
    !Number.isSafeInteger(v.mappingRevision) ||
    Number(v.mappingRevision) < 1 ||
    Number(v.mappingRevision) > 1000000
  )
    return bad();
  try {
    Intl.DateTimeFormat("en", { timeZone: v.timezone });
  } catch {
    return bad();
  }
  const e = v.evidence;
  if (
    !isRecord(e) ||
    !keys(e, [
      "reference",
      "currency",
      "physicalStock",
      "locationIds",
      "financials",
      "history",
    ]) ||
    typeof e.reference !== "string" ||
    !e.reference.trim() ||
    e.reference.length > 200 ||
    typeof e.currency !== "string" ||
    !/^[A-Z]{3}$/.test(e.currency) ||
    typeof e.physicalStock !== "boolean" ||
    typeof e.financials !== "boolean" ||
    !Array.isArray(e.locationIds) ||
    e.locationIds.length > 50 ||
    new Set(e.locationIds).size !== e.locationIds.length ||
    e.locationIds.some(
      (id) =>
        typeof id !== "string" ||
        !/^gid:\/\/shopify\/Location\/\d{1,25}$/.test(id),
    ) ||
    (e.physicalStock && !e.locationIds.length)
  )
    return bad();
  const h = e.history;
  if (
    h !== null &&
    (!isRecord(h) ||
      !keys(h, ["from", "to", "reference"]) ||
      typeof h.from !== "string" ||
      !utcWatermark(h.from) ||
      typeof h.to !== "string" ||
      !utcWatermark(h.to) ||
      h.from > h.to ||
      Date.parse(h.to) > Date.now() ||
      typeof h.reference !== "string" ||
      !h.reference.trim() ||
      h.reference.length > 200)
  )
    return bad();
  return { credentials: v as unknown as ShopifyConfig, issues: [] };
}
/** Stable numeric event codes reuse existing source mapping and financial formulas. */
export function shopifyMapping(c: ShopifyConfig) {
  return {
    revision: c.mappingRevision,
    reference: c.evidence.reference,
    values: {
      evidence: c.evidence,
      statuses: { "1": "SALE", "2": "RETURN", "3": "PREORDER", "4": "REFUSAL" },
      ...(c.evidence.financials
        ? {
            amounts: {
              price: "gross_unit",
              absoluteDiscount: "line",
              currency: c.evidence.currency,
            },
          }
        : {}),
    },
  };
}
