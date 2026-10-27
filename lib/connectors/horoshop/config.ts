import { isRecord } from "@/lib/api-contracts";
import { parseOrderPolicy } from "../order-policy";
export interface HoroshopConfig {
  origin: string;
  login: string;
  password: string;
  timezone: string;
  mappingRevision: number;
  statuses: Record<string, "SALE" | "PREORDER" | "REFUSAL">;
  evidence: {
    reference: string;
    currency: string;
    // Account evidence, not an invented provider-wide quota.
    requestsPerWindow: number;
    windowSeconds: number;
    stableOrderPagination: boolean;
    catalogCount: number | null;
    physicalStock: boolean;
    warehouses: string[];
    netUnitPrice: boolean;
  };
}
export function shopOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 253) return null;
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      u.search ||
      u.hash ||
      u.pathname !== "/" ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
        u.hostname,
      ) ||
      u.hostname.endsWith(".local") ||
      u.hostname.endsWith(".localhost")
    )
      return null;
    return u.origin;
  } catch {
    return null;
  }
}
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
export function parseHoroshopConfig(value: unknown): {
  credentials: HoroshopConfig | null;
  issues: string[];
} {
  const bad = () => ({
    credentials: null,
    issues: ["Invalid Horoshop configuration or account evidence"],
  });
  if (
    !isRecord(value) ||
    !keys(value, [
      "origin",
      "login",
      "password",
      "timezone",
      "mappingRevision",
      "statuses",
      "evidence",
    ]) ||
    !shopOrigin(value.origin) ||
    [value.login, value.password].some(
      (v) =>
        typeof v !== "string" ||
        !v.trim() ||
        v.length > 1024 ||
        /[\x00-\x1f\x7f]/.test(v),
    ) ||
    typeof value.timezone !== "string" ||
    value.timezone.length > 100 ||
    !Number.isSafeInteger(value.mappingRevision) ||
    Number(value.mappingRevision) < 1 ||
    Number(value.mappingRevision) > 1000000 ||
    !isRecord(value.statuses) ||
    Object.keys(value.statuses).length > 100 ||
    Object.values(value.statuses).some(
      (v) => !["SALE", "PREORDER", "REFUSAL"].includes(String(v)),
    )
  )
    return bad();
  try {
    Intl.DateTimeFormat("en", { timeZone: value.timezone });
    parseOrderPolicy({ statuses: value.statuses });
  } catch {
    return bad();
  }
  const e = value.evidence;
  if (
    !isRecord(e) ||
    !keys(e, [
      "reference",
      "currency",
      "requestsPerWindow",
      "windowSeconds",
      "stableOrderPagination",
      "catalogCount",
      "physicalStock",
      "warehouses",
      "netUnitPrice",
    ]) ||
    typeof e.reference !== "string" ||
    !e.reference.trim() ||
    e.reference.length > 200 ||
    typeof e.currency !== "string" ||
    !/^[A-Z]{3}$/.test(e.currency) ||
    !Number.isSafeInteger(e.requestsPerWindow) ||
    Number(e.requestsPerWindow) < 1 ||
    Number(e.requestsPerWindow) > 100 ||
    !Number.isSafeInteger(e.windowSeconds) ||
    Number(e.windowSeconds) < 1 ||
    Number(e.windowSeconds) > 3600 ||
    [e.stableOrderPagination, e.physicalStock, e.netUnitPrice].some(
      (v) => typeof v !== "boolean",
    ) ||
    (e.catalogCount !== null &&
      (!Number.isSafeInteger(e.catalogCount) ||
        Number(e.catalogCount) < 0 ||
        Number(e.catalogCount) > 100000)) ||
    !Array.isArray(e.warehouses) ||
    e.warehouses.length > 50 ||
    new Set(e.warehouses).size !== e.warehouses.length ||
    e.warehouses.some(
      (v) => typeof v !== "string" || !v.trim() || v.length > 100,
    ) ||
    (e.physicalStock && !e.warehouses.length)
  )
    return bad();
  return {
    credentials: {
      ...value,
      origin: shopOrigin(value.origin),
    } as unknown as HoroshopConfig,
    issues: [],
  };
}
export function horoshopMapping(c: HoroshopConfig) {
  return {
    revision: c.mappingRevision,
    reference: c.evidence.reference,
    values: {
      statuses: c.statuses,
      evidence: c.evidence,
      ...(c.evidence.netUnitPrice
        ? {
            amounts: {
              price: "net_unit" as const,
              absoluteDiscount: "line" as const,
              currency: c.evidence.currency,
            },
          }
        : {}),
    },
  };
}
