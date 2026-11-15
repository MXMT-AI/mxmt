import type { Brand, BrandBudgetStatus, CartItem } from "./planner-types";

export function calculatePlannerBudget(brands: Brand[], cart: CartItem[]) {
  const spentByBrand = new Map<string, number>();
  let totalCartItems = 0;
  for (const item of cart) {
    spentByBrand.set(item.brandId, (spentByBrand.get(item.brandId) ?? 0) + item.price * item.qty);
    totalCartItems += item.qty;
  }

  let totalBudget = 0;
  let totalSpent = 0;
  const budgetStatus: BrandBudgetStatus[] = brands.map(brand => {
    const spent = spentByBrand.get(brand.id) ?? 0;
    const budget = brand.budget ?? 0;
    totalBudget += budget;
    totalSpent += spent;
    return {
      ...brand,
      spent,
      remaining: budget - spent,
      pct: budget > 0 ? Math.round((spent / budget) * 100) : 0,
    };
  });

  return { budgetStatus, totalBudget, totalSpent, totalCartItems };
}
