import type { CartItem, CatalogItem } from "./planner-types";
import { parsePlannerQuantity } from "./planner-quantity";

export function addPlannerCartItem(cart: CartItem[], item: CatalogItem, qty: number): CartItem[] {
  if (parsePlannerQuantity(String(qty)) === null) return cart;
  const existing = cart.find(line => line.catalogItemId === item.id);
  if (existing) {
    const nextQty = existing.qty + qty;
    if (parsePlannerQuantity(String(nextQty)) === null) return cart;
    return cart.map(line => line.catalogItemId === item.id ? { ...line, qty: nextQty } : line);
  }
  return [...cart, {
    catalogItemId: item.id, sku: item.sku, name: item.name, brandId: item.brandId,
    brandName: item.brand.name, category: item.category, price: item.priceWholesale,
    currency: item.brand.currency, qty, minOrder: item.minOrder,
  }];
}

export function removePlannerCartItem(cart: CartItem[], id: string): CartItem[] {
  return cart.some(item => item.catalogItemId === id) ? cart.filter(item => item.catalogItemId !== id) : cart;
}

export function updatePlannerCartQuantity(cart: CartItem[], id: string, qty: number): CartItem[] {
  if (parsePlannerQuantity(String(qty)) === null || !cart.some(item => item.catalogItemId === id && item.qty !== qty)) return cart;
  return cart.map(item => item.catalogItemId === id ? { ...item, qty } : item);
}
