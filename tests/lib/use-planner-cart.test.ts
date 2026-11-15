import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePlannerCart } from "@/components/planner/use-planner-cart";
import { savePlannerCart } from "@/lib/client/planner-cart-request";
import type { CatalogItem } from "@/components/planner/planner-types";
const state = vi.hoisted(() => ({ values: [] as any[], refs: [] as any[], index: 0, refIndex: 0 }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useCallback: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const index = state.index++; if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: any) => { state.values[index] = typeof value === "function" ? value(state.values[index]) : value; }];
  },
  useRef: (initial: unknown) => { const index = state.refIndex++; return state.refs[index] ??= { current: initial }; },
}));
vi.mock("@/lib/client/planner-cart-request", () => ({ savePlannerCart: vi.fn() }));
const item: CatalogItem = { id: "i", catalogId: "c", brandId: "b", sku: "S", name: "Item", category: "C", color: null, style: null, material: null, priceWholesale: 10, priceRetail: null, minOrder: 1, stockAvail: 20, leadTimeDays: 1, tags: [], brand: { id: "b", name: "Brand", currency: "EUR" } };
function render() { state.index = 0; state.refIndex = 0; return usePlannerCart([]); }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); state.values = []; state.refs = [];
  vi.mocked(savePlannerCart).mockResolvedValue(undefined);
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("does not save initial data and uses the latest state for rapid operations before rerender", async () => {
  const hook = render();
  const cleanup = vi.mocked(useEffect).mock.lastCall![0]();
  await vi.advanceTimersByTimeAsync(600);
  expect(savePlannerCart).not.toHaveBeenCalled();
  hook.addItem(item, 2); hook.addItem(item, 3); hook.updateQty("i", 7);
  expect(render().cart[0].qty).toBe(7);
  await vi.advanceTimersByTimeAsync(600);
  expect(savePlannerCart).toHaveBeenCalledTimes(1);
  expect(vi.mocked(savePlannerCart).mock.calls[0][0][0].qty).toBe(7);
  hook.removeFromCart("i");
  expect(render().cart).toEqual([]);
  cleanup?.(); await vi.advanceTimersByTimeAsync(0);
  expect(savePlannerCart).toHaveBeenLastCalledWith([], true);
});
it("flushes before the debounce delay on pagehide and unregisters the event on cleanup", async () => {
  const hook = render(); const cleanup = vi.mocked(useEffect).mock.lastCall![0]();
  hook.addItem(item, 2);
  window.dispatchEvent(new Event("pagehide"));
  await vi.advanceTimersByTimeAsync(0);
  expect(savePlannerCart).toHaveBeenCalledTimes(1);
  expect(vi.mocked(savePlannerCart).mock.calls[0][1]).toBe(true);
  cleanup?.(); window.dispatchEvent(new Event("pagehide"));
  await vi.advanceTimersByTimeAsync(600);
  expect(savePlannerCart).toHaveBeenCalledTimes(1);
});
it("keeps local edits on failure and clears the error after retry", async () => {
  vi.mocked(savePlannerCart).mockRejectedValueOnce(new Error());
  const hook = render(); const cleanup = vi.mocked(useEffect).mock.lastCall![0]();
  hook.addItem(item, 2); await vi.advanceTimersByTimeAsync(600);
  expect(render().saveError).toBe(true);
  expect(render().cart[0].qty).toBe(2);
  hook.retrySave(); await vi.advanceTimersByTimeAsync(0);
  expect(render().saveError).toBe(false);
  expect(savePlannerCart).toHaveBeenCalledTimes(2);
  cleanup?.();
});
