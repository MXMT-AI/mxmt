import { expect, it, vi } from "vitest";
import { savePlannerCart } from "@/lib/client/planner-cart-request";
import { apiFetch } from "@/lib/fetch";
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
it("saves the cart through the authenticated wrapper and supports exit requests", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ ok: true }));
  await savePlannerCart([], true);
  expect(apiFetch).toHaveBeenCalledWith("/api/planner/cart", { method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"items":[]}', keepalive: true });
});
it("rejects failed saves", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response("Error", { status: 500 }));
  await expect(savePlannerCart([])).rejects.toThrow("PLANNER_CART_SAVE_FAILED");
});
