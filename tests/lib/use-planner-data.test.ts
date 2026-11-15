import { useEffect } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { usePlannerData } from "@/components/planner/use-planner-data";
import { fetchPlannerItems, fetchPlannerBrands, fetchPlannerCatalogs, fetchPlannerDuplicates } from "@/lib/client/planner-data-request";
import type { Brand, CatalogItem, CatalogUpload, PlannerSection } from "@/components/planner/planner-types";
const state = vi.hoisted(() => ({ values: [] as any[], refs: [] as any[], index: 0, refIndex: 0 }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useCallback: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const index = state.index++; if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: any) => { state.values[index] = typeof value === "function" ? value(state.values[index]) : value; }];
  },
  useRef: (initial: unknown) => { const index = state.refIndex++; return state.refs[index] ??= { current: initial }; },
}));
vi.mock("@/lib/client/planner-data-request", () => ({ fetchPlannerItems: vi.fn(), fetchPlannerBrands: vi.fn(), fetchPlannerCatalogs: vi.fn(), fetchPlannerDuplicates: vi.fn() }));
const brand: Brand = { id: "b", name: "Brand", budget: 100, paymentDays: 30, currency: "EUR", country: null, contact: null, leadTimeDays: 28, moq: 1 };
const item = { id: "i", category: "New" } as CatalogItem;
const catalog = { id: "c", itemCount: 100 } as CatalogUpload;
function render(section: PlannerSection = "catalog") {
  state.index = 0; state.refIndex = 0;
  return usePlannerData([brand], [], section);
}
function itemsEffect() { return vi.mocked(useEffect).mock.calls.at(-2)![0](); }
beforeEach(() => {
  vi.clearAllMocks(); state.values = []; state.refs = [];
  vi.mocked(fetchPlannerItems).mockResolvedValue([]);
  vi.mocked(fetchPlannerBrands).mockResolvedValue([brand]);
  vi.mocked(fetchPlannerCatalogs).mockResolvedValue([]);
  vi.mocked(fetchPlannerDuplicates).mockResolvedValue([]);
});
it("ignores an older response after fast filter changes even if transport ignores abort", async () => {
  let old!: (rows: CatalogItem[]) => void, current!: (rows: CatalogItem[]) => void;
  vi.mocked(fetchPlannerItems).mockReturnValueOnce(new Promise(resolve => { old = resolve; })).mockReturnValueOnce(new Promise(resolve => { current = resolve; }));
  const first = render(); const cleanup = itemsEffect();
  first.setFilterSearch("new"); cleanup?.();
  render(); itemsEffect();
  expect(vi.mocked(fetchPlannerItems).mock.calls[0][1].aborted).toBe(true);
  expect(vi.mocked(fetchPlannerItems).mock.calls[1][0].search).toBe("new");
  current([item]); await new Promise(resolve => setTimeout(resolve, 0));
  old([{ ...item, id: "old" }]); await new Promise(resolve => setTimeout(resolve, 0));
  expect(render().items).toEqual([item]);
  expect(render().itemsLoading).toBe(false);
});
it("keeps catalog loading and scanning independent", async () => {
  let finish!: (rows: CatalogItem[]) => void;
  vi.mocked(fetchPlannerItems).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const hook = render(); const pending = hook.loadItems();
  await hook.scanDuplicates();
  expect(render().scanning).toBe(false);
  expect(render().itemsLoading).toBe(true);
  finish([]); await pending;
  expect(render().itemsLoading).toBe(false);
});
it("refreshes catalog history and item lists after import", async () => {
  vi.mocked(fetchPlannerCatalogs).mockResolvedValueOnce([catalog]);
  vi.mocked(fetchPlannerItems).mockResolvedValueOnce([item]);
  const hook = render("dashboard"); itemsEffect();
  expect(fetchPlannerItems).not.toHaveBeenCalled();
  await hook.refreshAfterUpload();
  expect(render().catalogs).toEqual([catalog]);
  expect(render().items).toEqual([item]);
  expect(render().categories).toEqual(["New"]);
});
it("retains previous brands on failure and supports a scoped retry", async () => {
  vi.mocked(fetchPlannerBrands).mockRejectedValueOnce(new Error());
  const hook = render();
  await hook.reloadBrands();
  expect(render().errors.brands).toBe(true);
  expect(render().brands).toEqual([brand]);
  render().retry("brands");
  await vi.waitFor(() => expect(render().errors.brands).toBe(false));
  expect(fetchPlannerBrands).toHaveBeenCalledTimes(2);
  expect(fetchPlannerCatalogs).not.toHaveBeenCalled();
});
it("reports scan failures without overwriting the previous results", async () => {
  const hook = render();
  vi.mocked(fetchPlannerDuplicates).mockResolvedValueOnce([[item]]);
  expect(await hook.scanDuplicates()).toEqual([[item]]);
  vi.mocked(fetchPlannerDuplicates).mockRejectedValueOnce(new Error());
  expect(await hook.scanDuplicates()).toBeUndefined();
  expect(render().duplicates).toEqual([[item]]);
  expect(render().errors.duplicates).toBe(true);
  expect(render().scanning).toBe(false);
});
it("cancels pending resources on unmount and ignores their late errors", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(fetchPlannerCatalogs).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  const hook = render();
  const cleanup = vi.mocked(useEffect).mock.lastCall![0]();
  const pending = hook.refreshAfterUpload();
  cleanup?.();
  expect(vi.mocked(fetchPlannerCatalogs).mock.calls[0][0].aborted).toBe(true);
  reject(new Error()); await pending;
  expect(render().errors.catalogs).toBe(false);
});
