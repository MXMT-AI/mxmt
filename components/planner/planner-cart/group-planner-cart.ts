import type { CartItem } from "../planner-types";

export function groupPlannerCart(cart: CartItem[]) {
  const groups = new Map<string, { items: CartItem[]; subtotal: number }>();
  let total = 0;
  for (const item of cart) {
    const group = groups.get(item.brandId) ?? { items: [], subtotal: 0 };
    const amount = item.price * item.qty;
    group.items.push(item);
    group.subtotal += amount;
    groups.set(item.brandId, group);
    total += amount;
  }
  return { groups, total };
}
