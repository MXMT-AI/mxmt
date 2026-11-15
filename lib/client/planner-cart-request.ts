import { apiFetch } from "@/lib/fetch";
import type { CartItem } from "@/components/planner/planner-types";

export async function savePlannerCart(items: CartItem[], keepalive = false) {
  const body = JSON.stringify({ items });
  const response = await apiFetch("/api/planner/cart", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
    // Browsers limit the total outstanding keepalive payload to 64 KiB.
    keepalive: keepalive && new TextEncoder().encode(body).byteLength < 64 * 1024,
  });
  if (!response.ok) throw new Error("PLANNER_CART_SAVE_FAILED");
}
