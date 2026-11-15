import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlannerCartSaver } from "@/lib/client/planner-cart-saver";
import { addPlannerCartItem, removePlannerCartItem, updatePlannerCartQuantity } from "@/components/planner/planner-cart-operations";
import type { CartItem, CatalogItem } from "@/components/planner/planner-types";
const line: CartItem = { catalogItemId: "i", sku: "S", name: "Item", brandId: "b", brandName: "Brand", category: "C", price: 10, currency: "EUR", qty: 2, minOrder: 1 };
const cart = (qty: number) => [{ ...line, qty }];
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it("debounces fast changes for 600ms and sends only the latest cart", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const saver = new PlannerCartSaver(save, vi.fn());
  saver.schedule(cart(2)); await vi.advanceTimersByTimeAsync(300);
  saver.schedule(cart(5)); await vi.advanceTimersByTimeAsync(599);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save.mock.calls).toEqual([[cart(5), false]]);
});
it("serializes requests and replaces intermediate pending states with the latest", async () => {
  let release!: () => void;
  const save = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
  const saver = new PlannerCartSaver(save, vi.fn());
  saver.schedule(cart(2)); await vi.advanceTimersByTimeAsync(600);
  saver.schedule(cart(3)); await vi.advanceTimersByTimeAsync(600);
  saver.schedule(cart(4)); await vi.advanceTimersByTimeAsync(600);
  expect(save).toHaveBeenCalledTimes(1);
  release(); await vi.advanceTimersByTimeAsync(0);
  expect(save.mock.calls.map(([items]) => items)).toEqual([cart(2), cart(4)]);
});
it("retains failed data for manual retry without an automatic retry loop", async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error()).mockResolvedValue(undefined);
  const error = vi.fn();
  const saver = new PlannerCartSaver(save, error);
  saver.schedule(cart(2)); await vi.advanceTimersByTimeAsync(600);
  expect(error).toHaveBeenLastCalledWith(true);
  await vi.advanceTimersByTimeAsync(6000);
  expect(save).toHaveBeenCalledTimes(1);
  await saver.flush();
  expect(save.mock.calls).toEqual([[cart(2), false], [cart(2), false]]);
  expect(error).toHaveBeenLastCalledWith(false);
});
it("never replaces newer edits with an earlier failed request", async () => {
  let reject!: (error: Error) => void;
  const save = vi.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; })).mockResolvedValue(undefined);
  const saver = new PlannerCartSaver(save, vi.fn());
  saver.schedule(cart(2)); await vi.advanceTimersByTimeAsync(600);
  saver.schedule(cart(8));
  reject(new Error()); await vi.advanceTimersByTimeAsync(0);
  await saver.flush();
  expect(save.mock.calls.map(([items]) => items)).toEqual([cart(2), cart(8)]);
});
it("flushes the pending state immediately on exit, after an in-flight save", async () => {
  let release!: () => void;
  const save = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
  const saver = new PlannerCartSaver(save, vi.fn());
  saver.schedule(cart(2)); await vi.advanceTimersByTimeAsync(600);
  saver.schedule(cart(9));
  const flush = saver.flush(true);
  release(); await flush;
  expect(save.mock.calls).toEqual([[cart(2), false], [cart(9), true]]);
});
it("applies pure add, update and remove operations without mutating their input", () => {
  const source: CatalogItem = { id: "i", catalogId: "c", brandId: "b", sku: "S", name: "Item", category: "C", color: null, style: null, material: null, priceWholesale: 10, priceRetail: null, minOrder: 1, stockAvail: 20, leadTimeDays: 1, tags: [], brand: { id: "b", name: "Brand", currency: "EUR" } };
  const initial = cart(2);
  expect(addPlannerCartItem([], source, 2)).toEqual(initial);
  expect(addPlannerCartItem(initial, source, 3)).toEqual(cart(5));
  expect(updatePlannerCartQuantity(initial, "i", 4)).toEqual(cart(4));
  expect(removePlannerCartItem(initial, "i")).toEqual([]);
  for (const value of [0, -1, 1.5, NaN, Infinity]) {
    expect(addPlannerCartItem(initial, source, value)).toBe(initial);
    expect(updatePlannerCartQuantity(initial, "i", value)).toBe(initial);
  }
  expect(initial).toEqual(cart(2));
});
