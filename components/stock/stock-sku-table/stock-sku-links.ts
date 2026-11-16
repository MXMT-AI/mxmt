import { merchandisingHref } from "@/lib/merchandising-navigation";

export function stockSkuLinks(row: Record<string, unknown>, params: URLSearchParams, monobrand: boolean) {
  const details = row.details as Record<string, unknown> | null;
  const ids = {
    skuId: String(row.id),
    currency: row.currency === null ? "__unassigned__" : String(row.currency),
    brandId: monobrand ? null : String(details?.brandId ?? "__unassigned__"),
    classification: null,
    mode: monobrand ? "all" : "brand",
  };
  return {
    repricing: merchandisingHref("/repricing", params, {
      ...ids,
      mode: null,
      classification: ["DEAD", "RISK"].includes(String(row.classification)) ? String(row.classification) : null,
    }),
    reordering: merchandisingHref("/reordering", params, ids),
  };
}
