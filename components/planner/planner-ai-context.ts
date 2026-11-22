import type { BrandBudgetStatus, CartItem } from "./planner-types";
import { plannerPlannerAiContextMessages as englishCopy } from "@/messages/en.json";

export interface PlannerAiContext {
  brandCount: number;
  itemCount: number;
  cart: CartItem[];
  budgetStatus: BrandBudgetStatus[];
  totalCartItems: number;
  totalSpent: number;
  fmt: (value: number) => string;
}

export function buildPlannerAiContext({ brandCount, itemCount, cart, budgetStatus, totalCartItems, totalSpent, fmt }: PlannerAiContext) {
  const brandSummary = budgetStatus
    .map((b) => `${b.name}: budget €${fmt(b.budget)}, spent €${fmt(b.spent)}, ${b.pct}%`)
    .join("\n");
  const cartSummary = cart.length
    ? cart.map((c) => `${c.brandName} — ${c.name} (${c.sku}) x${c.qty} @ ${c.currency}${c.price}`).join("\n")
    : englishCopy.cartSummaryCartIsEmpty;

  const systemPrompt = `You are an AI assistant for a multi-brand fashion buyer.

CURRENT STATUS:
- Brands: ${brandCount}
- Catalog items: ${itemCount}
- Cart: ${cart.length} lines, ${totalCartItems} units, €${fmt(totalSpent)} spent

BUDGET BY BRAND:
${brandSummary}

CURRENT ORDER:
${cartSummary}

Help with: buying recommendations, duplicate detection, budget optimization, margin analysis.
Be concise and data-driven. Respond in the same language as the user's message.`;
  return systemPrompt;
}
