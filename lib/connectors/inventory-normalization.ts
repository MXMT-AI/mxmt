import { normalizedBrandKey } from "@/lib/data-normalization";
import { randomUUID } from "node:crypto";
import { isRecord } from "@/lib/api-contracts";
import type { CatalogSnapshot } from "./contract";
import { exact } from "./order-normalization";

export interface InventoryPolicy {
  receipts?: { postedStatuses: string[]; suppliers: Record<string, string>; productIdField?: "id" | "parameter"; currency?: string; unitCostVerified?: boolean };
}
/** Only a separately approved mapping can establish supplier posting and procurement cost. */
export function inventoryPolicy(value: unknown): InventoryPolicy {
  if (!isRecord(value) || value.receipts === undefined) return {};
  const r = value.receipts;
  if (!isRecord(r) || !Array.isArray(r.postedStatuses) || r.postedStatuses.some((id) => typeof id !== "string" || !/^\d+$/.test(id)) ||
    !isRecord(r.suppliers) || Object.entries(r.suppliers).some(([id, target]) => !/^\d+$/.test(id) || typeof target !== "string" || !target) ||
    r.productIdField !== undefined && !["id", "parameter"].includes(String(r.productIdField)) ||
    r.currency !== undefined && (typeof r.currency !== "string" || !/^[A-Z]{3}$/.test(r.currency)) ||
    r.unitCostVerified !== undefined && typeof r.unitCostVerified !== "boolean") throw new Error("INVALID_SOURCE_MAPPING");
  return { receipts: r as unknown as InventoryPolicy["receipts"] };
}
export interface CatalogEntry {
  observedAt:string;priceObservedAt:string;proposedId: string; externalId: string; article: string | null; canonicalSku: string; name: string;
  categoryId: string | null; categoryName: string | null; vendor: string | null; barcode: string | null;
  retailPrice: string | null; oldPrice: string | null; quantity: string | null; currency: string | null;
  attributes: Record<string, unknown>;
}
/** Validate the entire observation before any catalogue or business snapshot is changed. */
export function normalizeCatalog(snapshot: CatalogSnapshot, sourceId: string, provider="salesdrive") {
  if (!Number.isFinite(Date.parse(snapshot.observedAt)) || snapshot.products.length !== snapshot.stock.length) throw new Error("INVALID_CATALOG");
  const stock = new Map(snapshot.stock.map((row) => [row.productId, row]));
  if (stock.size !== snapshot.stock.length) throw new Error("DUPLICATE_CATALOG_ID");
  const ids = new Set<string>(), skus = new Set<string>(), issues = new Set<string>(["HISTORICAL_STOCK_UNAVAILABLE"]);
  const rows = snapshot.products.map((product): CatalogEntry => {
    if (!product.externalId || ids.has(product.externalId)) throw new Error("DUPLICATE_CATALOG_ID"); ids.add(product.externalId);
    for (const [value, max] of [[product.externalId,200],[product.sku,200],[product.name,1000],[product.categoryId,200],[product.categoryName,500],[product.barcode,200]] as const) {
      if (value != null && (value.length>max || !value.trim())) throw new Error("INVALID_CATALOG");
    }
    if (product.brand && product.brand.length>200) throw new Error("INVALID_CATALOG");
    const observation = stock.get(product.externalId);
    if (!observation || (snapshot.perRowObservations
      ? !Number.isFinite(Date.parse(observation.observedAt))||!Number.isFinite(Date.parse(product.observedAt))||Date.parse(observation.observedAt)>Date.parse(snapshot.observedAt)||Date.parse(product.observedAt)>Date.parse(snapshot.observedAt)
      : observation.observedAt !== snapshot.observedAt || product.observedAt !== snapshot.observedAt)) throw new Error("MIXED_CATALOG_OBSERVATION");
    const money = (value: string | null | undefined, signed = false) => {
      if (value == null) return null;
      const number = exact(value);
      if (!number || !signed && number.isNegative()) throw new Error("INVALID_CATALOG_NUMBER");
      return number.toString();
    };
    const retailPrice = money(product.retailPrice), oldPrice = money(product.oldPrice), quantity = money(observation.onHand, true);
    if (quantity !== null && Number(quantity)<0) issues.add("NEGATIVE_SOURCE_STOCK");
    if (quantity === null) issues.add("STOCK_QUANTITY_UNAVAILABLE");
    if (retailPrice === null) issues.add("RETAIL_PRICE_UNAVAILABLE");
    const currency = product.currency && /^[A-Z]{3}$/.test(product.currency) ? product.currency : null;
    if (!currency) issues.add("CURRENCY_UNVERIFIED");
    const canonicalSku = product.sku ?? `@${provider}:${sourceId}:${product.externalId}`;
    if (!product.sku) issues.add("MISSING_SOURCE_SKU");
    if (skus.has(canonicalSku)) throw new Error("DUPLICATE_CATALOG_SKU"); skus.add(canonicalSku);
    return {observedAt:observation!.observedAt,priceObservedAt:product.observedAt,proposedId: randomUUID(), externalId: product.externalId, article: product.sku, canonicalSku, name: product.name,
      categoryId: product.categoryId, categoryName: product.categoryName ?? null, vendor: normalizedBrandKey(product.brand), barcode: product.barcode,
      retailPrice, oldPrice, quantity, currency, attributes: { observedAt:product.observedAt, sourceStatus: product.sourceStatus ?? null, sourceSku: product.sku,
        vendor: product.brand, categoryId: product.categoryId, categoryName: product.categoryName ?? null,
        exportedCost: product.costPrice, identityDerived: !product.sku } };
  });
  return { rows, issues };
}
