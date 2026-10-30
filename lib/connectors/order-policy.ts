import { isRecord } from "@/lib/api-contracts";
import type { OrderPolicy } from "./order-normalization";
export function parseOrderPolicy(value: unknown): OrderPolicy {
  if (!isRecord(value)) throw new Error("INVALID_SOURCE_MAPPING");
  const policy: OrderPolicy = {};
  if (value.statuses !== undefined) {
    if (
      !isRecord(value.statuses) ||
      Object.entries(value.statuses).some(
        ([id, kind]) =>
          !/^\d+$/.test(id) ||
          ![
            "UNKNOWN",
            "SALE",
            "RETURN",
            "CORRECTION",
            "PREORDER",
            "REFUSAL",
          ].includes(String(kind)),
      )
    )
      throw new Error("INVALID_SOURCE_MAPPING");
    policy.statuses = value.statuses as OrderPolicy["statuses"];
  }
  if (value.channels !== undefined) {
    if (
      !isRecord(value.channels) ||
      Object.entries(value.channels).some(
        ([id, name]) =>
          !/^\d+$/.test(id) ||
          typeof name !== "string" ||
          !name.trim() ||
          name.length > 200,
      )
    )
      throw new Error("INVALID_SOURCE_MAPPING");
    policy.channels = value.channels as Record<string, string>;
  }
  if (value.dates !== undefined) {
    const d = value.dates;
    if (
      !isRecord(d) ||
      (d.saleOrderTimeFallback !== undefined &&
        typeof d.saleOrderTimeFallback !== "boolean") ||
      (d.returnDateField !== undefined &&
        (typeof d.returnDateField !== "string" ||
          !/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(d.returnDateField)))
    )
      throw new Error("INVALID_SOURCE_MAPPING");
    policy.dates = d as OrderPolicy["dates"];
  }
  if (value.amounts !== undefined) {
    const a = value.amounts;
    if (
      !isRecord(a) ||
      !["gross_unit", "net_unit", "net_line"].includes(String(a.price)) ||
      !["line", "unit"].includes(String(a.absoluteDiscount)) ||
      typeof a.currency !== "string" ||
      !/^[A-Z]{3}$/.test(a.currency) ||
      (a.cost !== undefined && !["unit", "line"].includes(String(a.cost)))
    )
      throw new Error("INVALID_SOURCE_MAPPING");
    policy.amounts = a as unknown as OrderPolicy["amounts"];
  }
  return policy;
}
