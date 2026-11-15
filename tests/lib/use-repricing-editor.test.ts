import { useEffect, useReducer, useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRepricingEditor } from "@/components/repricing/use-repricing-editor";
import { initialRepricingState, readRepricingDraft, repricingWorkspaceReducer } from "@/lib/repricing-workspace";
const navigation = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(navigation.query) }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useReducer: vi.fn(), useRef: vi.fn() }));
let state: ReturnType<typeof initialRepricingState>;
let lastUrl: { current: string };
let location: { pathname: string; search: string };
const replaceState = vi.fn();
function render(monobrand = false) {
  vi.mocked(useReducer).mockReturnValue([state, (action: Parameters<typeof repricingWorkspaceReducer>[1]) => { state = repricingWorkspaceReducer(state, action); }] as never);
  vi.mocked(useRef).mockReturnValue(lastUrl);
  const result = useRepricingEditor(monobrand);
  vi.mocked(useEffect).mock.lastCall![0]();
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  navigation.query = "brandId=b&page=3&tab=demo";
  lastUrl = { current: navigation.query };
  state = { ...initialRepricingState(readRepricingDraft(new URLSearchParams(navigation.query))), page: 3 };
  location = { pathname: "/en/repricing", search: `?${navigation.query}` };
  replaceState.mockImplementation((_state, _title, url: string) => { location.search = url.slice(url.indexOf("?")); });
  vi.stubGlobal("window", { location, history: { replaceState } });
});
afterEach(() => vi.unstubAllGlobals());
it("preserves edits across pagination and its own URL update without putting edits in the URL", () => {
  render().changeSelection("sku", false);
  render().changePrice("sku", "12.50");
  render().changePage(2);
  navigation.query = location.search.slice(1);
  render();
  expect(state.page).toBe(2);
  expect(state.edits).toEqual({ selection: [{ skuId: "sku", included: false }], manualPrices: [{ skuId: "sku", price: "12.50" }] });
  expect(location.search).toBe("?brandId=b&page=2&tab=demo");
  render().changePrice("sku", null);
  expect(state.edits.manualPrices).toEqual([]);
});
it("resets edits and pagination on parameter change while keeping shared query context", () => {
  render().changePrice("sku", "12.50");
  const draft = render().draft;
  render().change({ ...draft, parameters: { ...draft.parameters, sharePct: 50 } });
  expect(state.page).toBe(1);
  expect(state.edits).toEqual({ selection: [], manualPrices: [] });
  expect(new URLSearchParams(location.search).get("tab")).toBe("demo");
  expect(new URLSearchParams(location.search).has("page")).toBe(false);
});
it("restores external navigation and clears manual edits", () => {
  render().changePrice("sku", "12.50");
  navigation.query = "status=RISK&page=2";
  render();
  expect(state.page).toBe(2);
  expect(state.draft.filters.status).toBe("RISK");
  expect(state.edits.manualPrices).toEqual([]);
  expect(replaceState).not.toHaveBeenCalled();
});
it("normalizes monobrand filters without mutating stored state", () => {
  expect(render(true).draft.filters.brandId).toBeUndefined();
  expect(state.draft.filters.brandId).toBe("b");
});
