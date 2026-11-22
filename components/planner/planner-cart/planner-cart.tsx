"use client";

import { ShoppingCart } from "lucide-react";
import type { CartItem, BrandBudgetStatus } from "../planner-types";
import { PlannerCartItem } from "../planner-cart-item/planner-cart-item";
import { groupPlannerCart } from "./group-planner-cart";
import { plannerPlannerCartMessages as englishCopy } from "@/messages/en.json";
import { plannerPlannerCartMessages as ukrainianCopy } from "@/messages/uk.json";

export function PlannerCart({ cart, budgetStatus, removeFromCart, updateQty, fmt }: {
  cart: CartItem[];
  budgetStatus: BrandBudgetStatus[];
  removeFromCart: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  fmt: (n: number) => string;
}) {
  if (cart.length === 0) {
    return (
      <div className="text-center py-20">
        <ShoppingCart aria-hidden="true" size={40} className="mx-auto text-(--subtle) mb-4" />
        <p className="text-(--text) font-medium mb-1">{ukrainianCopy.замовленняПорожнє}</p>
        <p className="text-(--muted) text-sm">{ukrainianCopy.перейдітьДоКаталогуТаДодайте}</p>
      </div>
    );
  }

  const { groups, total } = groupPlannerCart(cart);

  return (
    <div className="max-w-3xl space-y-4">
      {Array.from(groups, ([brandId, { items, subtotal }]) => {
        const b = budgetStatus.find((bs) => bs.id === brandId);
        return (
          <div key={brandId} className="bg-(--surface) border border-(--border) rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-(--border) flex items-center justify-between">
              <span className="text-(--text) font-semibold">{b?.name ?? brandId}</span>
              <div className="flex items-center gap-4 text-sm font-mono">
                <span className="text-(--text)">€{fmt(subtotal)}</span>
                {b && b.budget > 0 && (
                  <span className={b.remaining < 0 ? "text-accent-orange" : "text-(--muted)"}>
                    {b.remaining >= 0 ? "€" + fmt(b.remaining) + englishCopy.left : "€" + fmt(Math.abs(b.remaining)) + englishCopy.over}
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-white/4">
              {items.map((item) => (
                <PlannerCartItem key={item.catalogItemId} item={item} removeFromCart={removeFromCart} updateQty={updateQty} fmt={fmt} />
              ))}
            </div>
          </div>
        );
      })}

      <div className="bg-(--surface) border border-(--border) rounded-xl p-5 flex justify-between items-center">
        <span className="text-(--muted) text-sm">{ukrainianCopy.загальнаСумаЗамовлення}</span>
        <span className="text-2xl font-bold text-(--text) font-mono">
          €{fmt(total)}
        </span>
      </div>
    </div>
  );
}
