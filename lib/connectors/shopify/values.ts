import { isRecord } from "@/lib/api-contracts";
import { ConnectorReadError } from "../read-error";
import { exact } from "../order-normalization";
export type Row = Record<string, unknown>;
export const invalid = (): never => {
  throw new ConnectorReadError("INVALID_RESPONSE");
};
export const object = (v: unknown): Row => (isRecord(v) ? v : invalid());
export const list = (v: unknown, max = 1000): Row[] =>
  Array.isArray(v) && v.length <= max ? v.map(object) : invalid();
export function gid(v: unknown, type?: string): string {
  if (
    typeof v !== "string" ||
    !/^gid:\/\/shopify\/(?:[A-Za-z]+\/\d{1,25}|InventoryLevel\/\d{1,25}\?inventory_item_id=\d{1,25})$/.test(
      v,
    ) ||
    (type && !v.startsWith(`gid://shopify/${type}/`))
  )
    invalid();
  return v as string;
}
export const text = (v: unknown): string =>
  typeof v === "string" && v.trim() && v.length <= 1000 ? v : invalid();
export const optionalText = (v: unknown): string | null =>
  v == null || v === "" ? null : text(v);
export const decimal = (v: unknown): string =>
  typeof v === "string" && exact(v)
    ? v
    : typeof v === "number" && Number.isSafeInteger(v) && exact(String(v))
      ? String(v)
      : invalid();
export const integer = (v: unknown): number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 1000000
    ? v
    : invalid();
export function instant(v: unknown): string {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)
  )
    return invalid();
  const normalized = v.replace(
      /\.(\d{1,2})Z$/,
      (_m, d) => `.${d.padEnd(3, "0")}Z`,
    ),
    canonical = normalized.includes(".")
      ? normalized
      : normalized.replace("Z", ".000Z"),
    date = new Date(v);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== canonical)
    return invalid();
  return date.toISOString();
}
/** Require a complete, advancing connection; opaque provider URLs are never followed. */
export function connection(v: unknown, after: string | null, limit = 100) {
  const c = object(v),
    records = list(c.nodes, limit),
    p = object(c.pageInfo);
  if (
    typeof p.hasNextPage !== "boolean" ||
    (p.endCursor !== null &&
      (typeof p.endCursor !== "string" ||
        !p.endCursor ||
        p.endCursor.length > 1500)) ||
    (p.hasNextPage &&
      (!records.length || !p.endCursor || p.endCursor === after))
  )
    invalid();
  const ids = records.map((r) => gid(r.id));
  if (new Set(ids).size !== ids.length) invalid();
  return { records, next: p.hasNextPage ? (p.endCursor as string) : null };
}

/** Read exact shop-currency amounts only; presentment currency never substitutes for shop money. */
export function money(v: unknown, currency: string): string {
  const m = object(object(v).shopMoney);
  if (m.currencyCode !== currency) invalid();
  const amount = decimal(m.amount);
  if (exact(amount)!.isNegative()) invalid();
  return amount;
}
