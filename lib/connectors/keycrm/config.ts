import { isRecord } from "@/lib/api-contracts";
import { parseOrderPolicy } from "../order-policy";
import { utcWatermark } from "../requests";
export interface KeyCrmConfig {
  accountId: string;
  apiKey: string;
  timezone: string;
  mappingRevision: number;
  statuses: Record<string, "SALE" | "PREORDER" | "REFUSAL">;
  channels: Record<string, string>;
  evidence: null | {
    reference: string;
    currency: string;
    netUnitPrice: boolean;
    purchasedPriceUnit: boolean;
    fullPaymentDate: boolean;
    physicalStock: boolean;
    warehouseIds: string[];
    history: null | { from: string; to: string; reference: string };
  };
}
export function parseKeyCrmConfig(value: unknown): {
  credentials: KeyCrmConfig | null;
  issues: string[];
} {
  const bad = () => ({
    credentials: null,
    issues: ["Invalid KeyCRM configuration or unconfirmed mapping evidence"],
  });
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (k) =>
        ![
          "accountId",
          "apiKey",
          "timezone",
          "mappingRevision",
          "statuses",
          "channels",
          "evidence",
        ].includes(k),
    ) ||
    typeof value.accountId !== "string" ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.accountId) ||
    typeof value.apiKey !== "string" ||
    !/^[\x21-\x7e]{8,4096}$/.test(value.apiKey) ||
    typeof value.timezone !== "string" ||
    value.timezone.length > 100 ||
    !Number.isSafeInteger(value.mappingRevision) ||
    Number(value.mappingRevision) < 1 ||
    Number(value.mappingRevision) > 1000000 ||
    !isRecord(value.statuses) ||
    !isRecord(value.channels) ||
    Object.keys(value.statuses).length > 100 ||
    Object.keys(value.channels).length > 100
  )
    return bad();
  try {
    Intl.DateTimeFormat("en", { timeZone: value.timezone });
    parseOrderPolicy({ statuses: value.statuses, channels: value.channels });
  } catch {
    return bad();
  }
  if (
    Object.values(value.statuses).some(
      (k) => !["SALE", "PREORDER", "REFUSAL"].includes(String(k)),
    )
  )
    return bad();
  const e = value.evidence;
  if (e !== null) {
    if (
      !isRecord(e) ||
      Object.keys(e).some(
        (k) =>
          ![
            "reference",
            "currency",
            "netUnitPrice",
            "purchasedPriceUnit",
            "fullPaymentDate",
            "physicalStock",
            "warehouseIds",
            "history",
          ].includes(k),
      ) ||
      typeof e.reference !== "string" ||
      !e.reference.trim() ||
      e.reference.length > 200 ||
      typeof e.currency !== "string" ||
      !/^[A-Z]{3}$/.test(e.currency) ||
      [
        "netUnitPrice",
        "purchasedPriceUnit",
        "fullPaymentDate",
        "physicalStock",
      ].some((k) => typeof e[k] !== "boolean") ||
      !Array.isArray(e.warehouseIds) ||
      e.warehouseIds.length > 50 ||
      new Set(e.warehouseIds).size !== e.warehouseIds.length ||
      e.warehouseIds.some(
        (id) => typeof id !== "string" || !/^\d{1,20}$/.test(id),
      )
    )
      return bad();
    const h = e.history;
    if (
      h !== null &&
      (!isRecord(h) ||
        Object.keys(h).some((k) => !["from", "to", "reference"].includes(k)) ||
        typeof h.from !== "string" ||
        !utcWatermark(h.from) ||
        typeof h.to !== "string" ||
        !utcWatermark(h.to) ||
        Date.parse(String(h.from)) > Date.parse(String(h.to)) ||
        Date.parse(String(h.to)) > Date.now() ||
        typeof h.reference !== "string" ||
        !h.reference.trim() ||
        h.reference.length > 200)
    )
      return bad();
  }
  return { credentials: value as unknown as KeyCrmConfig, issues: [] };
}
export function keyCrmMapping(c: KeyCrmConfig) {
  return {
    revision: c.mappingRevision,
    reference: c.evidence?.reference ?? "Unverified KeyCRM mapping",
    values: {
      // Public approval evidence changes date/stock/history facts as well as amounts.
      evidence: c.evidence,
      statuses: c.statuses,
      channels: c.channels,
      ...(c.evidence?.netUnitPrice
        ? {
            amounts: {
              price: "net_unit",
              absoluteDiscount: "line",
              currency: c.evidence.currency,
              ...(c.evidence.purchasedPriceUnit ? { cost: "unit" } : {}),
            },
          }
        : {}),
    },
  };
}
