import { expect, it } from "vitest";
import { calculatePlannerBudget } from "@/components/planner/calculate-planner-budget";
import type { Brand, CartItem } from "@/components/planner/planner-types";
const brand: Brand = { id: "a", name: "Demo", budget: 100, paymentDays: 30, currency: "EUR", country: null, contact: null, leadTimeDays: 28, moq: 1 };
const item: CartItem = { catalogItemId: "i", sku: "SKU", name: "Item", brandId: "a", brandName: "Demo", category: "Shoes", price: 10, currency: "EUR", qty: 2, minOrder: 1 };
it("handles empty inputs and brands without order lines", () => {
  expect(calculatePlannerBudget([], [])).toEqual({ budgetStatus: [], totalBudget: 0, totalSpent: 0, totalCartItems: 0 });
  expect(calculatePlannerBudget([brand], [])).toEqual({ budgetStatus: [{ ...brand, spent: 0, remaining: 100, pct: 0 }], totalBudget: 100, totalSpent: 0, totalCartItems: 0 });
});
it("sums repeated brand lines and returns unchanged brand metadata", () => {
  const cart = [item, { ...item, catalogItemId: "j", price: 5, qty: 3 }, { ...item, catalogItemId: "k", brandId: "b", price: 7, qty: 4 }];
  const brands = [brand, { ...brand, id: "b", budget: 50 }];
  const result = calculatePlannerBudget(brands, cart);
  expect(result.budgetStatus).toEqual([{ ...brands[0], spent: 35, remaining: 65, pct: 35 }, { ...brands[1], spent: 28, remaining: 22, pct: 56 }]);
  expect(result).toMatchObject({ totalBudget: 150, totalSpent: 63, totalCartItems: 9 });
  expect(cart[0]).toEqual(item);
  expect(brands[0]).toEqual(brand);
});
it("preserves integer rounding and budget overruns", () => {
  const result = calculatePlannerBudget([{ ...brand, budget: 30 }], [{ ...item, price: 10, qty: 4 }]);
  expect(result.budgetStatus[0]).toMatchObject({ spent: 40, remaining: -10, pct: 133 });
});
it("keeps a zero budget percentage finite even when there are expenses", () => {
  const result = calculatePlannerBudget([{ ...brand, budget: 0 }], [item]);
  expect(result.budgetStatus[0]).toMatchObject({ spent: 20, remaining: -20, pct: 0 });
  expect(result).toMatchObject({ totalBudget: 0, totalSpent: 20, totalCartItems: 2 });
});
it("retains the existing rule: unknown-brand units count, while budget spend covers known brands", () => {
  const result = calculatePlannerBudget([brand], [item, { ...item, catalogItemId: "unknown", brandId: "missing", qty: 5 }]);
  expect(result).toMatchObject({ totalBudget: 100, totalSpent: 20, totalCartItems: 7 });
  expect(result.budgetStatus).toHaveLength(1);
});
it("handles brand IDs that coincide with object prototype keys", () => {
  const result = calculatePlannerBudget([{ ...brand, id: "__proto__" }], [{ ...item, brandId: "__proto__" }]);
  expect(result.budgetStatus[0].spent).toBe(20);
});
